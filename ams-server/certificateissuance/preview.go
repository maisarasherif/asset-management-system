package certificateissuance

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

const PreviewTTL = 30 * time.Minute
const SnapshotVersion = 1
const TemplateVersion = "pms-examination-a4-v3"
const previewIssuer = "AMS-CERTIFICATE-PREVIEW"
const previewAudience = "generated-certificate-approval"

var ErrPreviewInput = errors.New("use valid renewal dates and at most 4000 characters for each optional field")
var ErrPreviewToken = errors.New("invalid preview; create and review a fresh preview")
var ErrPreviewExpired = errors.New("this preview expired; create and review a fresh preview")
var ErrPreviewChanged = errors.New("certificate or signing details changed; create and review a fresh preview")
var ErrPreviewText = errors.New("certificate text contains characters unsupported by the PDF font")

type PreviewInput struct {
	SignerID     *uuid.UUID `json:"signer_id"`
	IssueDate    string     `json:"issue_date"`
	ExpiryDate   string     `json:"expiry_date"`
	Remarks      string     `json:"remarks"`
	Measurements string     `json:"measurements"`
}

// All rendered content is typed and signed. Object keys never leave the server.
type Snapshot struct {
	SchemaVersion      int            `json:"schema_version"`
	TemplateVersion    string         `json:"template_version"`
	CertificateID      uuid.UUID      `json:"certificate_id"`
	ComponentID        uuid.UUID      `json:"component_id"`
	EquipmentID        uuid.UUID      `json:"equipment_id"`
	TestID             uuid.UUID      `json:"test_id"`
	EquipmentName      string         `json:"equipment_name"`
	ComponentName      string         `json:"component_name"`
	ComponentDisplayID string         `json:"component_display_id"`
	SerialNumber       string         `json:"serial_number"`
	Location           string         `json:"location"`
	CertificateName    string         `json:"certificate_name"`
	TestName           string         `json:"test_name"`
	TestDescription    string         `json:"test_description"`
	IMCARef            string         `json:"imca_ref"`
	IMCAD018           string         `json:"imca_d018"`
	IssueDate          string         `json:"issue_date"`
	ExpiryDate         string         `json:"expiry_date"`
	ValidityPeriod     string         `json:"validity_period"`
	Remarks            string         `json:"remarks"`
	Measurements       string         `json:"measurements"`
	Signer             EligibleSigner `json:"signer"`
	SourceFingerprint  string         `json:"source_fingerprint"`
}

type PreviewClaims struct {
	Purpose  string   `json:"purpose"`
	Snapshot Snapshot `json:"snapshot"`
	jwt.RegisteredClaims
}

type PreviewResponse struct {
	PDF       []byte    `json:"pdf_base64"`
	Token     string    `json:"preview_token"`
	Number    string    `json:"document_number"`
	ExpiresAt time.Time `json:"expires_at"`
	Snapshot  Snapshot  `json:"snapshot"`
}

type PreviewRenderer interface {
	Render(context.Context, Snapshot, string, []byte) ([]byte, error)
}
type Previews struct {
	Management SignerManagement
	Secret     []byte
	Renderer   PreviewRenderer
}

func previewKey(secret []byte) ([]byte, error) {
	if len(secret) == 0 {
		return nil, errors.New("preview signing secret is not configured")
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte("AMS/generated-certificate-preview/v1"))
	return mac.Sum(nil), nil
}

func SignPreview(secret []byte, actor uuid.UUID, snapshot Snapshot, now time.Time) (string, error) {
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return "", err
	}
	if len(encoded) > 64*1024 {
		return "", ErrPreviewInput
	}
	key, err := previewKey(secret)
	if err != nil {
		return "", err
	}
	claims := PreviewClaims{Purpose: "certificate-preview", Snapshot: snapshot, RegisteredClaims: jwt.RegisteredClaims{
		Issuer: previewIssuer, Audience: jwt.ClaimStrings{previewAudience}, Subject: actor.String(), ID: uuid.NewString(),
		IssuedAt: jwt.NewNumericDate(now), NotBefore: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(PreviewTTL)),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(key)
}

func VerifyPreview(secret []byte, raw string, actor, certificate uuid.UUID, now time.Time) (PreviewClaims, error) {
	var claims PreviewClaims
	if len(raw) == 0 || len(raw) > 128*1024 {
		return claims, ErrPreviewToken
	}
	key, err := previewKey(secret)
	if err != nil {
		return claims, err
	}
	token, err := jwt.ParseWithClaims(raw, &claims, func(*jwt.Token) (any, error) { return key, nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(previewIssuer), jwt.WithAudience(previewAudience),
		jwt.WithExpirationRequired(), jwt.WithIssuedAt(), jwt.WithTimeFunc(func() time.Time { return now }))
	if errors.Is(err, jwt.ErrTokenExpired) {
		return PreviewClaims{}, ErrPreviewExpired
	}
	if err != nil || !token.Valid || claims.Purpose != "certificate-preview" || claims.Subject != actor.String() || claims.ID == "" ||
		claims.Snapshot.CertificateID != certificate || claims.Snapshot.SchemaVersion != SnapshotVersion || claims.Snapshot.TemplateVersion != TemplateVersion ||
		claims.IssuedAt == nil || claims.NotBefore == nil || claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time) != PreviewTTL {
		return PreviewClaims{}, ErrPreviewToken
	}
	return claims, nil
}

func validFreeText(value string, limit int) bool {
	return utf8.ValidString(value) && utf8.RuneCountInString(value) <= limit && !strings.ContainsFunc(value, func(r rune) bool {
		return unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t'
	})
}

func AddCalendarMonths(date time.Time, months int) time.Time {
	first := time.Date(date.Year(), date.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1).Day()
	day := min(date.Day(), last)
	return time.Date(first.Year(), first.Month(), day, 0, 0, 0, 0, time.UTC)
}

func validityPeriod(issue, expiry time.Time) string {
	months := (expiry.Year()-issue.Year())*12 + int(expiry.Month()-issue.Month())
	if months > 0 && AddCalendarMonths(issue, months).Equal(expiry) {
		if months == 1 {
			return "1 month"
		}
		return fmt.Sprintf("%d months", months)
	}
	days := int((expiry.Unix() - issue.Unix()) / 86400)
	if days == 1 {
		return "1 day"
	}
	return fmt.Sprintf("%d days", days)
}

func DocumentNumber(snapshot Snapshot, sequence string) string {
	initials := []rune{}
	for _, word := range strings.FieldsFunc(snapshot.ComponentName, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		initials = append(initials, unicode.ToUpper([]rune(word)[0]))
	}
	if len(initials) == 0 {
		initials = []rune("C")
	}
	date, _ := time.Parse("2006-01-02", snapshot.IssueDate)
	return fmt.Sprintf("PMS-CE-%s-%s-%s-%s", date.Format("060102"), snapshot.ComponentDisplayID, string(initials), sequence)
}

func (p Previews) snapshot(ctx context.Context, actor, certificate uuid.UUID, input PreviewInput) (Snapshot, error) {
	signer, err := p.Management.Resolve(ctx, actor, certificate, input.SignerID)
	if err != nil {
		return Snapshot{}, err
	}
	source, err := db.New(p.Management.Pool).GetCertificatePreviewSource(ctx, certificate)
	if errors.Is(err, pgx.ErrNoRows) {
		return Snapshot{}, ErrSigningProfileNotFound
	}
	if err != nil {
		return Snapshot{}, err
	}
	issue, err := time.Parse("2006-01-02", input.IssueDate)
	if err != nil || issue.Year() < 1900 || issue.Year() > 9999 || !validFreeText(input.Remarks, 4000) || !validFreeText(input.Measurements, 4000) {
		return Snapshot{}, ErrPreviewInput
	}
	period := "No expiry"
	expiryDate := input.ExpiryDate
	if source.RequiresRenewal {
		if expiryDate == "" && source.ValidityMonths > 0 {
			expiryDate = AddCalendarMonths(issue, int(source.ValidityMonths)).Format("2006-01-02")
		}
		expiry, err := time.Parse("2006-01-02", expiryDate)
		if err != nil || !expiry.After(issue) || expiry.Year() > 9999 {
			return Snapshot{}, ErrPreviewInput
		}
		period = validityPeriod(issue, expiry)
	} else if expiryDate != "" {
		return Snapshot{}, ErrPreviewInput
	}
	encoded, err := json.Marshal(source)
	if err != nil {
		return Snapshot{}, err
	}
	digest := sha256.Sum256(encoded)
	snapshot := Snapshot{SchemaVersion: SnapshotVersion, TemplateVersion: TemplateVersion,
		CertificateID: certificate, ComponentID: source.ComponentID, EquipmentID: source.AssetID, TestID: source.TestID,
		EquipmentName: source.EquipmentName, ComponentName: source.ComponentName, ComponentDisplayID: source.ComponentDisplayID,
		SerialNumber: source.SerialNumber, Location: source.Location, CertificateName: source.CertificateName,
		TestName: source.TestName, TestDescription: source.TestDescription, IMCARef: source.ImcaRef, IMCAD018: source.ImcaD018,
		IssueDate: input.IssueDate, ExpiryDate: expiryDate, ValidityPeriod: period,
		Remarks: strings.ReplaceAll(input.Remarks, "\r\n", "\n"), Measurements: strings.ReplaceAll(input.Measurements, "\r\n", "\n"),
		Signer: signer, SourceFingerprint: hex.EncodeToString(digest[:])}
	for _, value := range []string{snapshot.EquipmentName, snapshot.ComponentName, snapshot.ComponentDisplayID, snapshot.SerialNumber, snapshot.Location,
		snapshot.CertificateName, snapshot.TestName, snapshot.TestDescription, snapshot.IMCARef, snapshot.IMCAD018, signer.FullName, signer.Organization, signer.CategoryName} {
		if !validFreeText(value, 8000) {
			return Snapshot{}, ErrPreviewInput
		}
	}
	return snapshot, nil
}

func (p Previews) Validate(ctx context.Context, actor, certificate uuid.UUID, raw string) (PreviewClaims, error) {
	if _, err := p.Management.actorRole(ctx, actor, false); err != nil {
		return PreviewClaims{}, err
	}
	claims, err := VerifyPreview(p.Secret, raw, actor, certificate, time.Now())
	if err != nil {
		return PreviewClaims{}, err
	}
	s := claims.Snapshot
	current, err := p.snapshot(ctx, actor, certificate, PreviewInput{SignerID: &s.Signer.SignerID, IssueDate: s.IssueDate, ExpiryDate: s.ExpiryDate, Remarks: s.Remarks, Measurements: s.Measurements})
	if errors.Is(err, ErrSignerIneligible) || errors.Is(err, ErrPreviewInput) {
		return PreviewClaims{}, ErrPreviewChanged
	}
	if err != nil {
		return PreviewClaims{}, err
	}
	a, _ := json.Marshal(s)
	b, _ := json.Marshal(current)
	if string(a) != string(b) {
		return PreviewClaims{}, ErrPreviewChanged
	}
	return claims, nil
}

func (p Previews) Prepare(ctx context.Context, actor, certificate uuid.UUID, input PreviewInput) (PreviewResponse, error) {
	snapshot, err := p.snapshot(ctx, actor, certificate, input)
	if err != nil {
		return PreviewResponse{}, err
	}
	var image []byte
	if snapshot.Signer.OwnerKind == "ACCOUNT" {
		image, err = readSignature(ctx, actor, snapshot.Signer.Signature.ID, PostgresSignatures{Pool: p.Management.Pool}, p.Management.Store)
	} else {
		image, err = p.Management.PersonImage(ctx, actor, snapshot.Signer.SignerID, snapshot.Signer.Signature.ID)
	}
	if err != nil {
		return PreviewResponse{}, err
	}
	number := DocumentNumber(snapshot, "XX")
	pdf, err := p.Renderer.Render(ctx, snapshot, number, image)
	if err != nil {
		return PreviewResponse{}, err
	}
	now := time.Now().Truncate(time.Second)
	token, err := SignPreview(p.Secret, actor, snapshot, now)
	if err != nil {
		return PreviewResponse{}, err
	}
	// Avoid returning a preview whose source/signature changed during rendering.
	if _, err := p.Validate(ctx, actor, certificate, token); err != nil {
		return PreviewResponse{}, err
	}
	return PreviewResponse{PDF: pdf, Token: token, Number: number, ExpiresAt: now.Add(PreviewTTL), Snapshot: snapshot}, nil
}
