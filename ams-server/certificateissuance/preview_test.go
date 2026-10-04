package certificateissuance

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func TestPreviewTokenPurposeExpiryBindingsAndAlgorithm(t *testing.T) {
	secret := []byte("preview-security-unit-secret")
	actor, certificate := uuid.New(), uuid.New()
	now := time.Now().Truncate(time.Second)
	snapshot := Snapshot{SchemaVersion: SnapshotVersion, TemplateVersion: TemplateVersion, CertificateID: certificate}
	raw, err := SignPreview(secret, actor, snapshot, now)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := VerifyPreview(secret, raw, actor, certificate, now.Add(29*time.Minute))
	if err != nil || claims.ID == "" {
		t.Fatal(err)
	}
	cases := []struct {
		name, token string
		actor, cert uuid.UUID
		when        time.Time
		want        error
	}{
		{"expired", raw, actor, certificate, now.Add(PreviewTTL), ErrPreviewExpired},
		{"foreign actor", raw, uuid.New(), certificate, now, ErrPreviewToken},
		{"foreign certificate", raw, actor, uuid.New(), now, ErrPreviewToken},
		{"tampered payload", raw[:len(raw)-8] + "changed!", actor, certificate, now, ErrPreviewToken},
	}
	key, _ := previewKey(secret)
	wrongPurpose := claims
	wrongPurpose.Purpose = "login"
	token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, wrongPurpose).SignedString(key)
	cases = append(cases, struct {
		name, token string
		actor, cert uuid.UUID
		when        time.Time
		want        error
	}{"wrong purpose", token, actor, certificate, now, ErrPreviewToken})
	wrongAlgorithm, _ := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString(key)
	cases = append(cases, struct {
		name, token string
		actor, cert uuid.UUID
		when        time.Time
		want        error
	}{"wrong algorithm", wrongAlgorithm, actor, certificate, now, ErrPreviewToken})
	missingExpiry := claims
	missingExpiry.ExpiresAt = nil
	token, _ = jwt.NewWithClaims(jwt.SigningMethodHS256, missingExpiry).SignedString(key)
	cases = append(cases, struct {
		name, token string
		actor, cert uuid.UUID
		when        time.Time
		want        error
	}{"missing expiry", token, actor, certificate, now, ErrPreviewToken})
	for _, change := range []struct {
		name   string
		mutate func(*PreviewClaims)
	}{
		{"wrong issuer", func(c *PreviewClaims) { c.Issuer = "AMS" }},
		{"wrong audience", func(c *PreviewClaims) { c.Audience = jwt.ClaimStrings{"login"} }},
		{"missing issued time", func(c *PreviewClaims) { c.IssuedAt = nil }},
		{"unknown schema", func(c *PreviewClaims) { c.Snapshot.SchemaVersion = 99 }},
		{"unknown template", func(c *PreviewClaims) { c.Snapshot.TemplateVersion = "unknown" }},
		{"previous layout template", func(c *PreviewClaims) { c.Snapshot.TemplateVersion = "pms-examination-a4-v1" }},
	} {
		changed := claims
		change.mutate(&changed)
		raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, changed).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		cases = append(cases, struct {
			name, token string
			actor, cert uuid.UUID
			when        time.Time
			want        error
		}{change.name, raw, actor, certificate, now, ErrPreviewToken})
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := VerifyPreview(secret, c.token, c.actor, c.cert, c.when); !errors.Is(err, c.want) {
				t.Fatalf("got %v want %v", err, c.want)
			}
		})
	}
	t.Setenv("SECRET_KEY", string(secret))
	if _, err := utils.ValidateToken(raw); err == nil {
		t.Fatal("preview token authenticated as an access token")
	}
	auth, _, err := utils.GenerateAccessToken("a@example.com", "A", "B", "ADMIN", actor.String())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyPreview(secret, auth, actor, certificate, now); !errors.Is(err, ErrPreviewToken) {
		t.Fatal("access token accepted as preview", err)
	}
	if _, err := SignPreview(nil, actor, snapshot, now); err == nil {
		t.Fatal("unconfigured signing accepted")
	}
}

func TestPreviewCalendarAndNumbers(t *testing.T) {
	leap, _ := time.Parse("2006-01-02", "2024-01-31")
	if got := AddCalendarMonths(leap, 1).Format("2006-01-02"); got != "2024-02-29" {
		t.Fatal(got)
	}
	if got := validityPeriod(leap, AddCalendarMonths(leap, 1)); got != "1 month" {
		t.Fatal(got)
	}
	if got := validityPeriod(leap, leap.AddDate(0, 0, 2)); got != "2 days" {
		t.Fatal(got)
	}
	s := Snapshot{IssueDate: "2026-10-04", ComponentDisplayID: "042", ComponentName: "Pressure Gauge"}
	if got := DocumentNumber(s, "XX"); got != "PMS-CE-261004-042-PG-XX" {
		t.Fatal(got)
	}
	s.ComponentDisplayID = "043"
	if got := DocumentNumber(s, "01"); got != "PMS-CE-261004-043-PG-01" {
		t.Fatal(got)
	}
}

func TestExaminationPDFUnicodeTransparencyPaginationAndMissingGlyph(t *testing.T) {
	image := image.NewNRGBA(image.Rect(0, 0, 120, 48))
	image.Set(50, 20, color.NRGBA{R: 10, G: 40, B: 80, A: 255})
	var signature bytes.Buffer
	if err := png.Encode(&signature, image); err != nil {
		t.Fatal(err)
	}
	snapshot := Snapshot{SchemaVersion: 1, TemplateVersion: TemplateVersion, IssueDate: "2026-10-04", ExpiryDate: "2027-10-04", ValidityPeriod: "12 months",
		EquipmentName: "Dive system", ComponentName: "Pressure Gauge", ComponentDisplayID: "042", SerialNumber: "PG-123", Location: "Warehouse", TestName: "Pressure test", IMCARef: "D018", IMCAD018: "Section 3",
		Remarks: "Examiné — Ω Ж\nSecond line", Measurements: "10 bar", Signer: EligibleSigner{FullName: "José Marin", Organization: "Porto Marine"}}
	renderer := PDFRenderer{}
	pdf, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), signature.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	pages := regexp.MustCompile(`/Type\s*/Page(?:\s|/)`)
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) || len(pages.FindAll(pdf, -1)) != 1 || !bytes.Contains(pdf, []byte("/SMask")) || !bytes.Contains(pdf, []byte("/ToUnicode")) {
		t.Fatal("invalid ordinary PDF, transparency, fonts, or page count")
	}
	for _, char := range []rune{'é', 'Ω', 'Ж'} {
		if !bytes.Contains(pdf, []byte(fmt.Sprintf("<%04X>", char))) {
			t.Fatalf("missing Unicode map for %c", char)
		}
	}
	// Existing signatures may have been saved as 16-bit PNGs before upload
	// normalization was fixed. Rendering must preserve their immutable bytes.
	legacy := signature16BitFixture(t)
	original := append([]byte(nil), legacy...)
	legacyPDF, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), legacy)
	if err != nil || !bytes.HasPrefix(legacyPDF, []byte("%PDF-")) || !bytes.Contains(legacyPDF, []byte("/SMask")) {
		t.Fatal("legacy 16-bit signature did not render with transparency", err)
	}
	if !bytes.Equal(legacy, original) {
		t.Fatal("rendering mutated the stored signature bytes")
	}
	// Reproduce the previous JPEG -> YCbCr -> 16-bit PNG storage path.
	decodedJPEG, err := jpeg.Decode(bytes.NewReader(signatureImageFixture(t, "jpeg")))
	if err != nil {
		t.Fatal(err)
	}
	var legacyJPEG bytes.Buffer
	if err := png.Encode(&legacyJPEG, decodedJPEG); err != nil || legacyJPEG.Bytes()[24] != 16 {
		t.Fatal("legacy JPEG fixture must be a 16-bit PNG", err)
	}
	if output, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), legacyJPEG.Bytes()); err != nil || !bytes.HasPrefix(output, []byte("%PDF-")) {
		t.Fatal("legacy JPEG signature could not be embedded", err)
	}
	snapshot.Remarks = strings.Repeat("A pressure observation with a readable continuation.\n", 75)
	long, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), signature.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if len(pages.FindAll(long, -1)) < 2 {
		t.Fatal("long remarks did not paginate")
	}
	snapshot.Remarks = "unsupported emoji \U0001F680"
	if _, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), signature.Bytes()); !errors.Is(err, ErrPreviewText) {
		t.Fatal("unsupported glyph was silently dropped", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := renderer.Render(ctx, snapshot, "XX", signature.Bytes()); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled render succeeded", err)
	}
}
