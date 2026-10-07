package certificateissuance

import (
	"bytes"
	"compress/zlib"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"regexp"
	"strconv"
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
		{"previous header-only template", func(c *PreviewClaims) { c.Snapshot.TemplateVersion = "pms-examination-a4-v2" }},
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

func TestExaminationPDFTrailingBlankLinesPreserveContentAndPagination(t *testing.T) {
	signature := signatureImageFixture(t, "png")
	snapshot := Snapshot{SchemaVersion: SnapshotVersion, TemplateVersion: TemplateVersion,
		IssueDate: "2026-10-04", ExpiryDate: "2027-10-04", ValidityPeriod: "12 months",
		EquipmentName: "Dive system", ComponentName: "Pressure Gauge", ComponentDisplayID: "042",
		SerialNumber: "PG-123", Location: "Warehouse", TestName: "Pressure test",
		TestDescription: "Signer selection", IMCARef: "D018", IMCAD018: "Signer selection",
		Measurements: "Applied pressure: 10 bar", Signer: EligibleSigner{FullName: "José Marin", Organization: "Porto Marine"}}
	renderer := PDFRenderer{}
	for _, remarks := range []string{
		"First paragraph\n\nSecond paragraph",
		strings.TrimSuffix(strings.Repeat("A recorded pressure observation with readable continuation.\n", 60), "\n"),
	} {
		snapshot.Remarks = remarks
		baseline, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), signature)
		if err != nil {
			t.Fatal(err)
		}
		for _, suffix := range []string{"\n", "\n\n", "\r\n\r\n", "\n \t\n"} {
			padded := snapshot
			padded.Remarks += suffix
			padded.Measurements += suffix
			before := padded
			actual, err := renderer.Render(context.Background(), padded, DocumentNumber(padded, "XX"), signature)
			if err != nil || !bytes.Equal(actual, baseline) {
				t.Fatalf("trailing blanks %q changed rendered content or pagination: %v", suffix, err)
			}
			if padded.Remarks != before.Remarks || padded.Measurements != before.Measurements {
				t.Fatal("rendering changed the approved text")
			}
		}
	}
	snapshot.Remarks = "First paragraph\n\nSecond paragraph"
	withParagraphBreak, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), signature)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Remarks = "First paragraph\nSecond paragraph"
	withoutParagraphBreak, err := renderer.Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), signature)
	if err != nil || bytes.Equal(withParagraphBreak, withoutParagraphBreak) {
		t.Fatal("intentional blank lines between paragraphs were lost", err)
	}
}

func TestExaminationPDFSignerDateHasBottomPaddingWhenDetailsWrap(t *testing.T) {
	// Inspect the real rendered PDF content, rather than reusing the renderer's
	// height formula. PDF coordinates increase upward from the page bottom.
	streams := regexp.MustCompile(`(?s)stream\r?\n(.*?)\r?\nendstream`)
	border := regexp.MustCompile(`40\.00 ([0-9.]+) 515\.00 ([0-9.]+) re S`)
	leftBodyText := regexp.MustCompile(`BT\s+50\.00 ([0-9.]+) TD\s+/F[0-9]+ 10 Tf`)
	for _, fixture := range []struct{ name, organization, remarks string }{
		{"SYNERGY", "Porto Marine", ""},
		{"SYNERGY", "SYNERGY INNOVATIVE DIVING EQUIPMENT TRADING LLC", ""},
		{strings.Repeat("Examiner ", 8), strings.Repeat("Inspection organization ", 6), ""},
		{"SYNERGY", "SYNERGY INNOVATIVE DIVING EQUIPMENT TRADING LLC", strings.Repeat("A recorded pressure observation.\n", 60)},
	} {
		t.Run(fmt.Sprintf("%d-%d-%d", len(fixture.name), len(fixture.organization), len(fixture.remarks)), func(t *testing.T) {
			snapshot := Snapshot{SchemaVersion: SnapshotVersion, TemplateVersion: TemplateVersion,
				IssueDate: "2026-10-06", EquipmentName: "Dive system", ComponentName: "Pressure Gauge",
				ComponentDisplayID: "042", TestName: "Pressure test", Remarks: fixture.remarks,
				Signer: EligibleSigner{FullName: fixture.name, Organization: fixture.organization}}
			output, err := (PDFRenderer{}).Render(context.Background(), snapshot, DocumentNumber(snapshot, "XX"), signatureImageFixture(t, "png"))
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, stream := range streams.FindAllSubmatch(output, -1) {
				reader, err := zlib.NewReader(bytes.NewReader(stream[1]))
				if err != nil { // Images and other streams need not be zlib content.
					continue
				}
				content, readErr := io.ReadAll(reader)
				reader.Close()
				if readErr != nil {
					t.Fatal(readErr)
				}
				box := border.FindSubmatchIndex(content)
				if box == nil {
					continue
				}
				bottom, err := strconv.ParseFloat(string(content[box[2]:box[3]]), 64)
				if err != nil {
					t.Fatal(err)
				}
				// The last left-column body text after this outline is the date;
				// the signature label and footer use different x/size positions.
				values := leftBodyText.FindAllSubmatch(content[box[1]:], -1)
				if len(values) < 3 {
					t.Fatal("signer name, organization or date missing from its page")
				}
				baseline, err := strconv.ParseFloat(string(values[len(values)-1][1]), 64)
				if err != nil || baseline-bottom < 12 {
					t.Fatalf("date baseline %.2f touches border %.2f; need 10pt padding plus descender room: %v", baseline, bottom, err)
				}
				found = true
			}
			if !found {
				t.Fatal("rendered PDF has no complete signer outline/date block")
			}
		})
	}
}

func TestApprovedPreviewIdentityAllowsExpiryButPreservesSecurity(t *testing.T) {
	secret := []byte("approved-identity-secret")
	actor, certificate := uuid.New(), uuid.New()
	now := time.Now().Truncate(time.Second)
	snapshot := Snapshot{SchemaVersion: SnapshotVersion, TemplateVersion: TemplateVersion, CertificateID: certificate}
	raw, err := SignPreview(secret, actor, snapshot, now.Add(-31*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyPreview(secret, raw, actor, certificate, now); !errors.Is(err, ErrPreviewExpired) {
		t.Fatal(err)
	}
	claims, err := verifyPreview(secret, raw, actor, certificate, now, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifyPreview(secret, raw, uuid.New(), certificate, now, true); !errors.Is(err, ErrPreviewToken) {
		t.Fatal("expired identity crossed accounts", err)
	}
	key, _ := previewKey(secret)
	for _, mutate := range []func(*PreviewClaims){
		func(c *PreviewClaims) { c.Issuer = "wrong" }, func(c *PreviewClaims) { c.Audience = jwt.ClaimStrings{"login"} }, func(c *PreviewClaims) { c.Purpose = "login" },
		func(c *PreviewClaims) { c.ExpiresAt = nil }, func(c *PreviewClaims) { c.IssuedAt = jwt.NewNumericDate(now.Add(time.Hour)) },
	} {
		changed := claims
		mutate(&changed)
		token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, changed).SignedString(key)
		if _, err := verifyPreview(secret, token, actor, certificate, now, true); !errors.Is(err, ErrPreviewToken) {
			t.Fatal("approved identity bypassed security", err)
		}
	}
	if _, err := verifyPreview(secret, raw[:len(raw)-7]+"forged!", actor, certificate, now, true); !errors.Is(err, ErrPreviewToken) {
		t.Fatal("tampered expired identity accepted", err)
	}
}
