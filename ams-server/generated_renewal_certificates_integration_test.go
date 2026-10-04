package main_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

type previewControlledRenderer struct {
	render  func()
	failure error
}

func (r previewControlledRenderer) Render(context.Context, issuance.Snapshot, string, []byte) ([]byte, error) {
	if r.render != nil {
		r.render()
	}
	return []byte("%PDF-controlled"), r.failure
}

func TestGeneratedRenewalPreviewStaleSourcesFailuresAndNoDrafts(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	actor := signingActor(t, h)
	component, testID := createComponentFixture(t, h, "Preview Pressure Gauge")
	certificate := uuid.MustParse(stringField(t, createCertificate(t, h, certificatePayload(component, testID, 93)), "certificate_id"))
	person := signingPerson(t, h, "Preview Examiner", signingCategory(t, h, "PREVIEW", true), true)
	store := &signingMemoryStore{objects: map[string][]byte{}}
	management := issuance.SignerManagement{Pool: h.pool, Store: store}
	if _, err := management.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, false))); err != nil {
		t.Fatal(err)
	}
	service := issuance.Previews{Management: management, Secret: []byte(os.Getenv("SECRET_KEY")), Renderer: previewControlledRenderer{}}
	input := issuance.PreviewInput{SignerID: &person, IssueDate: "2026-10-04", Remarks: "Examiné — Ω Ж\nTwo lines", Measurements: "10 bar"}
	original, err := db.New(h.pool).GetCertificateByID(ctx, certificate)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := json.Marshal(original)
	// Count every table, not just dates: preview may not create DB drafts/audit rows.
	counts := func() map[string]int64 {
		result := map[string]int64{}
		rows, err := h.pool.Query(ctx, "SELECT tablename FROM pg_tables WHERE schemaname='public'")
		if err != nil {
			t.Fatal(err)
		}
		names := []string{}
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				t.Fatal(err)
			}
			names = append(names, name)
		}
		rows.Close()
		for _, name := range names {
			var count int64
			if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM "+`"`+strings.ReplaceAll(name, `"`, `""`)+`"`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			result[name] = count
		}
		return result
	}
	initialCounts, _ := json.Marshal(counts())
	objects := len(store.objects)
	preview, err := service.Prepare(ctx, actor, certificate, input)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(preview.Number, "-XX") || preview.Snapshot.ExpiryDate != "2027-10-04" || preview.Snapshot.Measurements != "10 bar" {
		t.Fatalf("unexpected preview: %+v", preview.Snapshot)
	}
	if _, err := service.Validate(ctx, actor, certificate, preview.Token); err != nil {
		t.Fatal(err)
	}
	renderFailure := errors.New("controlled preview renderer failure")
	service.Renderer = previewControlledRenderer{failure: renderFailure}
	if _, err := service.Prepare(ctx, actor, certificate, input); !errors.Is(err, renderFailure) {
		t.Fatal("renderer failure swallowed", err)
	}
	service.Renderer = previewControlledRenderer{}
	afterCounts, _ := json.Marshal(counts())
	if !bytes.Equal(initialCounts, afterCounts) || objects != len(store.objects) {
		t.Fatal("preview created a DB or storage draft")
	}
	for _, change := range []struct {
		name, sql string
		id        uuid.UUID
	}{
		{"component", "UPDATE components SET name=name||' changed' WHERE component_id=$1", uuid.MustParse(component)},
		{"equipment", "UPDATE assets SET name=name||' changed' WHERE asset_id=(SELECT asset_id FROM components WHERE component_id=$1)", uuid.MustParse(component)},
		{"test", "UPDATE test_types SET description=description||' changed' WHERE test_id=$1", uuid.MustParse(testID)},
		{"references", "UPDATE certificates SET imca_ref=imca_ref||' changed' WHERE certificate_id=$1", certificate},
		{"signer", "UPDATE competent_persons SET organization=organization||' changed' WHERE competent_person_id=$1", person},
	} {
		t.Run(change.name, func(t *testing.T) {
			fresh, err := service.Prepare(ctx, actor, certificate, input)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := h.pool.Exec(ctx, change.sql, change.id); err != nil {
				t.Fatal(err)
			}
			if _, err := service.Validate(ctx, actor, certificate, fresh.Token); !errors.Is(err, issuance.ErrPreviewChanged) {
				t.Fatal("changed source accepted", err)
			}
		})
	}
	fresh, err := service.Prepare(ctx, actor, certificate, input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := management.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, true))); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Validate(ctx, actor, certificate, fresh.Token); !errors.Is(err, issuance.ErrPreviewChanged) {
		t.Fatal("replaced signature accepted", err)
	}
	fresh, err = service.Prepare(ctx, actor, certificate, input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET active=FALSE WHERE competent_person_id=$1", person); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Validate(ctx, actor, certificate, fresh.Token); !errors.Is(err, issuance.ErrPreviewChanged) {
		t.Fatal("inactive signer accepted", err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET active=TRUE WHERE competent_person_id=$1", person); err != nil {
		t.Fatal(err)
	}
	service.Renderer = previewControlledRenderer{render: func() {
		if _, err := h.pool.Exec(ctx, "UPDATE certificates SET imca_d018=imca_d018||' render race' WHERE certificate_id=$1", certificate); err != nil {
			t.Fatal(err)
		}
	}}
	if _, err := service.Prepare(ctx, actor, certificate, input); !errors.Is(err, issuance.ErrPreviewChanged) {
		t.Fatal("source changed during render accepted", err)
	}
	service.Renderer = previewControlledRenderer{}
	for key := range store.objects {
		store.objects[key] = []byte("corrupt image")
	}
	if _, err := service.Prepare(ctx, actor, certificate, input); !errors.Is(err, issuance.ErrStorage) {
		t.Fatal("corrupt stored image accepted", err)
	}
	current, err := db.New(h.pool).GetCertificateByID(ctx, certificate)
	if err != nil {
		t.Fatal(err)
	}
	current.ImcaRef = original.ImcaRef
	current.ImcaD018 = original.ImcaD018
	after, _ := json.Marshal(current)
	if !bytes.Equal(before, after) {
		t.Fatal("preview changed current document, dates, or certificate version")
	}
}

func TestGeneratedRenewalPreviewHTTPPDFTokenAndRoleBoundaries(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)
	if os.Getenv("AMS_TEST_STORAGE_PREFIX") == "" {
		t.Fatal("use isolated preview storage")
	}
	ctx := context.Background()
	component, testID := createComponentFixture(t, h, "Preview Pressure Gauge")
	certificate := stringField(t, createCertificate(t, h, certificatePayload(component, testID, 94)), "certificate_id")
	second := stringField(t, createCertificate(t, h, certificatePayload(component, testID, 95)), "certificate_id")
	person := signingPerson(t, h, "José Preview Examiner", signingCategory(t, h, "PREVIEW_HTTP", true), true)
	personPath := "/v1/competent-person/" + person.String() + "/signing-profile/signature"
	// JPEG input must normalize to an 8-bit PNG that gopdf can embed.
	personProfile := decodeObject(t, performMultipartRequest(t, h.router, h.adminToken, personPath, "file", "signature.jpg", signingImage(t, true), nil, http.StatusOK))
	personSignature := stringField(t, personProfile["signature"].(map[string]any), "signature_id")
	personImage := performJSONRequest(t, h.router, h.adminToken, http.MethodGet, strings.TrimSuffix(personPath, "/signature")+"/signatures/"+personSignature+"/file", nil, http.StatusOK)
	if len(personImage) < 25 || personImage[24] != 8 {
		t.Fatal("saved competent-person JPEG must become an 8-bit PNG")
	}
	path := "/v1/certificate/" + certificate + "/generated-preview"
	input := map[string]any{"signer_id": person, "issue_date": "2026-10-04", "remarks": "Examiné — Ω Ж\nSecond line", "measurements": "10 bar"}
	journalBefore, err := os.ReadFile(os.Getenv("AMS_TEST_STORAGE_MANIFEST"))
	if err != nil {
		t.Fatal(err)
	}
	var response issuance.PreviewResponse
	if err := json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, input, http.StatusOK), &response); err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(response.PDF, []byte("%PDF-")) || !strings.HasSuffix(response.Number, "-XX") || response.Snapshot.Signer.FullName != "José Preview Examiner" || response.Snapshot.TemplateVersion != issuance.TemplateVersion {
		t.Fatal("preview document incomplete")
	}
	tokenInput := map[string]any{"preview_token": response.Token}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/validate", tokenInput, http.StatusNoContent)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/certificate/"+second+"/generated-preview/validate", tokenInput, http.StatusBadRequest)
	performJSONRequest(t, h.router, response.Token, http.MethodPost, path, input, http.StatusUnauthorized)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/validate", map[string]any{"preview_token": h.adminToken}, http.StatusBadRequest)
	old, err := issuance.SignPreview([]byte(os.Getenv("SECRET_KEY")), signingActor(t, h), response.Snapshot, time.Now().Add(-31*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/validate", map[string]any{"preview_token": old}, http.StatusGone)
	for _, template := range []string{"pms-examination-a4-v1", "pms-examination-a4-v2"} {
		previousLayout := response.Snapshot
		previousLayout.TemplateVersion = template
		previousToken, err := issuance.SignPreview([]byte(os.Getenv("SECRET_KEY")), signingActor(t, h), previousLayout, time.Now().Truncate(time.Second))
		if err != nil {
			t.Fatal(err)
		}
		performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/validate", map[string]any{"preview_token": previousToken}, http.StatusBadRequest)
	}
	for _, role := range []string{"USER", "CLIENT", "ADMIN", "SUPER_ADMIN"} {
		token := createIntegrationUserToken(t, h.pool, "Preview", role, "preview-"+role+"@example.com", "preview-password", role)
		status := http.StatusForbidden
		if role == "SUPER_ADMIN" {
			status = http.StatusOK
		}
		performJSONRequest(t, h.router, token, http.MethodPost, path, input, status)
		validateStatus := http.StatusForbidden
		if role == "ADMIN" || role == "SUPER_ADMIN" {
			validateStatus = http.StatusBadRequest
		}
		performJSONRequest(t, h.router, token, http.MethodPost, path+"/validate", tokenInput, validateStatus)
		if role == "USER" {
			// VIEWER belongs to product_access, not users.role. Product access
			// must not grant certificate signing authority to an ordinary user.
			viewer := mustGetIntegrationUserByEmail(t, h.pool, "preview-USER@example.com")
			grantHRAdminProductAccess(t, h, viewer.UserID.String(), "VIEWER")
			performJSONRequest(t, h.router, token, http.MethodPost, path, input, http.StatusForbidden)
			performJSONRequest(t, h.router, token, http.MethodPost, path+"/validate", tokenInput, http.StatusForbidden)
		}
	}
	journalAfter, err := os.ReadFile(os.Getenv("AMS_TEST_STORAGE_MANIFEST"))
	if err != nil || !bytes.Equal(journalBefore, journalAfter) {
		t.Fatal("preview created storage objects")
	}
	adminToken := createIntegrationUserToken(t, h.pool, "Own", "Preview", "own-preview@example.com", "preview-password", "ADMIN")
	profile := decodeObject(t, performJSONRequest(t, h.router, adminToken, http.MethodGet, "/v1/account/signing-profile", nil, http.StatusOK))
	admin := uuid.MustParse(stringField(t, profile, "user_id"))
	management := issuance.SignerManagement{Pool: h.pool, Store: issuance.R2Signatures{}}
	if _, err := management.AssignCategory(ctx, signingActor(t, h), admin, &response.Snapshot.Signer.CategoryID); err != nil {
		t.Fatal(err)
	}
	performMultipartRequest(t, h.router, adminToken, "/v1/account/signing-profile/signature", "file", "own.jpg", signingImage(t, true), nil, http.StatusOK)
	own := decodeObject(t, performJSONRequest(t, h.router, adminToken, http.MethodPost, path, map[string]any{"issue_date": "2026-10-04"}, http.StatusOK))
	assertField(t, own["snapshot"].(map[string]any)["signer"].(map[string]any), "full_name", "Own Preview")
	for _, invalid := range []map[string]any{
		{"signer_id": person, "issue_date": "2026-02-30"}, {"signer_id": person, "issue_date": "2026-10-04", "expiry_date": "2026-10-03"},
		{"signer_id": person, "issue_date": "2026-10-04", "remarks": strings.Repeat("a", 4001)},
		{"signer_id": person, "issue_date": "2026-10-04", "measurements": "\u0000"},
		{"signer_id": person, "issue_date": "2026-10-04", "remarks": "unsupported emoji \U0001F680"},
		{"signer_id": person, "issue_date": "2026-10-04", "document_number": "forged"},
	} {
		performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, invalid, http.StatusBadRequest)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE test_types SET requires_renewal=FALSE,validity_duration=NULL WHERE test_id=$1", uuid.MustParse(testID)); err != nil {
		t.Fatal(err)
	}
	nonExpiring := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, map[string]any{"signer_id": person, "issue_date": "2026-10-04"}, http.StatusOK))
	assertField(t, nonExpiring["snapshot"].(map[string]any), "expiry_date", "")
	assertField(t, nonExpiring["snapshot"].(map[string]any), "validity_period", "No expiry")
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, map[string]any{"signer_id": person, "issue_date": "2026-10-04", "expiry_date": "2027-10-04"}, http.StatusBadRequest)
	if _, err := h.pool.Exec(ctx, "UPDATE test_types SET requires_renewal=TRUE,validity_duration=12 WHERE test_id=$1", uuid.MustParse(testID)); err != nil {
		t.Fatal(err)
	}
	if directory := os.Getenv("AMS_CERTIFICATE_PREVIEW_EVIDENCE_DIR"); directory != "" {
		if err := os.MkdirAll(directory, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, "examination-preview.pdf"), response.PDF, 0600); err != nil {
			t.Fatal(err)
		}
		input["remarks"] = strings.Repeat("Long examination remarks with continuation and readable text.\n", 60)
		var long issuance.PreviewResponse
		if err := json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, input, http.StatusOK), &long); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, "examination-preview-long.pdf"), long.PDF, 0600); err != nil {
			t.Fatal(err)
		}
	}
}

// Baseline for the workflow the generated-certificate feature will extend.
// Until atomic external renewal lands, upload and date publication are separate.
func TestGeneratedRenewalBaselinePreservesExternalDocumentsAndHistory(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)
	prefix := os.Getenv("AMS_TEST_STORAGE_PREFIX")
	if prefix == "" {
		t.Fatal("run certificate storage baseline through the isolated VPS runner")
	}
	componentID, testID := createComponentFixture(t, h, "Renewal baseline component")
	payload := certificatePayload(componentID, testID, 90)
	certificateID := stringField(t, createCertificate(t, h, payload), "certificate_id")
	personID := createCompetentPersonFixture(t, h.pool, "Renewal baseline signer")
	path := "/v1/certificate/" + certificateID
	documents := [][]byte{[]byte("%PDF-1.4 baseline original"), []byte("%PDF-1.4 baseline replacement")}
	for _, document := range documents {
		performMultipartRequest(t, h.router, h.adminToken, path+"/file", "file", "baseline.pdf", document,
			map[string]string{"competent_person_id": personID}, http.StatusOK)
	}
	current := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path, nil, http.StatusOK))
	key := stringField(t, current, "certificate_file")
	if !strings.HasPrefix(key, prefix) {
		t.Fatalf("unscoped storage key: %q", key)
	}
	if stringField(t, current, "issue_date") != payload["issue_date"].(time.Time).Format(time.RFC3339) {
		t.Fatal("upload unexpectedly published renewal dates")
	}
	history := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/uploads?page=1&limit=20", nil, http.StatusOK))
	if paginatedCount(t, history) != 2 {
		t.Fatal("replacement did not preserve both upload records")
	}
	entries := history["data"].([]any)
	seen := make(map[string]bool)
	client := &http.Client{Timeout: 30 * time.Second}
	for _, item := range entries {
		entry := item.(map[string]any)
		if !strings.HasPrefix(stringField(t, entry, "file_key"), prefix) {
			t.Fatal("unscoped history object")
		}
		assertField(t, entry, "competent_person_id", personID)
		link := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet,
			path+"/uploads/"+stringField(t, entry, "uuid")+"/file", nil, http.StatusOK))
		response, err := client.Get(stringField(t, link, "url"))
		if err != nil {
			t.Fatal(err)
		}
		data, readErr := io.ReadAll(io.LimitReader(response.Body, 1024))
		response.Body.Close()
		if readErr != nil || response.StatusCode != http.StatusOK {
			t.Fatalf("document download: status=%d err=%v", response.StatusCode, readErr)
		}
		if !bytes.Equal(data, documents[0]) && !bytes.Equal(data, documents[1]) {
			t.Fatal("stored document content changed")
		}
		seen[string(data)] = true
	}
	if len(seen) != 2 {
		t.Fatal("history did not return both immutable uploaded documents")
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, path, map[string]any{
		"issue_date": "2026-10-02T00:00:00Z", "expiry_date": "2027-10-02T00:00:00Z",
	}, http.StatusOK)
	current = decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path, nil, http.StatusOK))
	assertField(t, current, "certificate_file", key)
	assertField(t, current, "issue_date", "2026-10-02T00:00:00Z")
	assertField(t, current, "expiry_date", "2027-10-02T00:00:00Z")
	performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, path, nil, http.StatusOK)
	journal, err := os.ReadFile(os.Getenv("AMS_TEST_STORAGE_MANIFEST"))
	if err != nil || !bytes.Contains(journal, []byte(key+"\n")) {
		t.Fatal("cleanup lost the object after certificate deletion")
	}
}

func signingImage(t *testing.T, jpegImage bool) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 64, 24))
	for x := 8; x < 56; x++ {
		img.Set(x, 12, color.NRGBA{R: 20, G: 40, B: 80, A: 255})
	}
	var data bytes.Buffer
	var err error
	if jpegImage {
		err = jpeg.Encode(&data, img, &jpeg.Options{Quality: 90})
	} else {
		err = png.Encode(&data, img)
	}
	if err != nil {
		t.Fatal(err)
	}
	return data.Bytes()
}

func TestGeneratedRenewalOwnSigningProfileEnforcesAccountAndRoleBoundaries(t *testing.T) {
	h := setupIntegrationTest(t)
	path := "/v1/account/signing-profile"
	performJSONRequest(t, h.router, "", http.MethodGet, path, nil, http.StatusUnauthorized)
	for _, role := range []string{"SUPER_ADMIN", "USER", "CLIENT"} {
		token := createIntegrationUserToken(t, h.pool, role, "Signer", role+"-signing@example.com", "signing-password", role)
		performJSONRequest(t, h.router, token, http.MethodGet, path, nil, http.StatusForbidden)
		performJSONRequest(t, h.router, token, http.MethodPut, path, map[string]any{"organization": "PMS"}, http.StatusForbidden)
		performMultipartRequest(t, h.router, token, path+"/signature", "file", "signature.png", signingImage(t, false), nil, http.StatusForbidden)
	}
	ownerToken := createIntegrationUserToken(t, h.pool, "Own", "Examiner", "own-signing@example.com", "signing-password", "ADMIN")
	otherToken := createIntegrationUserToken(t, h.pool, "Other", "Examiner", "other-signing@example.com", "signing-password", "ADMIN")
	profile := decodeObject(t, performJSONRequest(t, h.router, ownerToken, http.MethodGet, path, nil, http.StatusOK))
	assertField(t, profile, "full_name", "Own Examiner")
	assertField(t, profile, "organization", "Porto Marine Services L.L.C.")
	if profile["signature"] != nil || profile["competency_category_id"] != nil {
		t.Fatal("new account unexpectedly has signing authority or a signature")
	}
	other := decodeObject(t, performJSONRequest(t, h.router, otherToken, http.MethodGet, path, nil, http.StatusOK))
	spoofed := decodeObject(t, performJSONRequest(t, h.router, ownerToken, http.MethodGet, path+"?user_id="+stringField(t, other, "user_id"), nil, http.StatusOK))
	assertField(t, spoofed, "user_id", stringField(t, profile, "user_id"))
	updated := decodeObject(t, performJSONRequest(t, h.router, ownerToken, http.MethodPut, path, map[string]any{"organization": "  Porto Marine — Inspection  "}, http.StatusOK))
	assertField(t, updated, "organization", "Porto Marine — Inspection")
	if _, err := h.pool.Exec(context.Background(), "UPDATE users SET first_name='Updated' WHERE email='own-signing@example.com'"); err != nil {
		t.Fatal(err)
	}
	updated = decodeObject(t, performJSONRequest(t, h.router, ownerToken, http.MethodGet, path, nil, http.StatusOK))
	assertField(t, updated, "full_name", "Updated Examiner")
	for _, input := range []map[string]any{
		{"organization": "Changed", "user_id": stringField(t, other, "user_id")},
		{"organization": "Changed", "competency_category_id": uuid.NewString()},
		{"organization": "Changed", "current_signature_id": uuid.NewString()},
		{"organization": " "}, {"organization": strings.Repeat("界", 201)}, {"organization": "PMS\x00Inspection"},
	} {
		performJSONRequest(t, h.router, ownerToken, http.MethodPut, path, input, http.StatusBadRequest)
	}
	other = decodeObject(t, performJSONRequest(t, h.router, otherToken, http.MethodGet, path, nil, http.StatusOK))
	assertField(t, other, "organization", "Porto Marine Services L.L.C.")
	performJSONRequest(t, h.router, ownerToken, http.MethodGet, path+"/signatures/"+uuid.NewString()+"/file", nil, http.StatusNotFound)
	performMultipartRequest(t, h.router, ownerToken, path+"/signature", "file", "fake.png", []byte("%PDF-1.4 fake PNG"), nil, http.StatusBadRequest)
	performMultipartRequest(t, h.router, ownerToken, path+"/signature", "file", "oversized.png", bytes.Repeat([]byte{'x'}, issuance.MaxSignatureBytes+1), nil, http.StatusRequestEntityTooLarge)
	performMultipartRequest(t, h.router, ownerToken, path+"/signature", "file", "signature.png", signingImage(t, false), map[string]string{"user_id": stringField(t, other, "user_id")}, http.StatusBadRequest)
	huge := signingImage(t, false)
	binary.BigEndian.PutUint32(huge[16:20], 4097)
	binary.BigEndian.PutUint32(huge[29:33], crc32.ChecksumIEEE(huge[12:29]))
	performMultipartRequest(t, h.router, ownerToken, path+"/signature", "file", "huge.png", huge, nil, http.StatusBadRequest)
	// A token's ADMIN claim cannot override a changed database role.
	if _, err := h.pool.Exec(context.Background(), "UPDATE users SET role = 'USER' WHERE email = 'own-signing@example.com'"); err != nil {
		t.Fatal(err)
	}
	performJSONRequest(t, h.router, ownerToken, http.MethodGet, path, nil, http.StatusForbidden)
	if _, err := h.pool.Exec(context.Background(), "UPDATE users SET status = 'SUSPENDED' WHERE email = 'other-signing@example.com'"); err != nil {
		t.Fatal(err)
	}
	performJSONRequest(t, h.router, otherToken, http.MethodGet, path, nil, http.StatusForbidden)
}

func TestGeneratedRenewalOwnSignatureVersionsWithRealR2(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)
	if os.Getenv("AMS_TEST_STORAGE_PREFIX") == "" {
		t.Fatal("use isolated runner storage")
	}
	token := createIntegrationUserToken(t, h.pool, "R2", "Examiner", "r2-signing@example.com", "signing-password", "ADMIN")
	other := createIntegrationUserToken(t, h.pool, "Other", "Examiner", "r2-other-signing@example.com", "signing-password", "ADMIN")
	path := "/v1/account/signing-profile"
	first := decodeObject(t, performMultipartRequest(t, h.router, token, path+"/signature", "file", "signature.png", signingImage(t, false), nil, http.StatusOK))
	version := first["signature"].(map[string]any)
	firstID := stringField(t, version, "signature_id")
	filePath := path + "/signatures/" + firstID + "/file"
	original := performJSONRequest(t, h.router, token, http.MethodGet, filePath, nil, http.StatusOK)
	decoded, err := png.Decode(bytes.NewReader(original))
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, alpha := decoded.At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatal("R2 image lost transparency")
	}
	digest := sha256.Sum256(original)
	assertField(t, version, "sha256", hex.EncodeToString(digest[:]))
	performJSONRequest(t, h.router, other, http.MethodGet, filePath, nil, http.StatusNotFound)
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, filePath, nil, http.StatusForbidden)
	second := decodeObject(t, performMultipartRequest(t, h.router, token, path+"/signature", "file", "signature.jpg", signingImage(t, true), nil, http.StatusOK))
	secondVersion := second["signature"].(map[string]any)
	if stringField(t, secondVersion, "signature_id") == firstID {
		t.Fatal("replacement reused signature identity")
	}
	current := performJSONRequest(t, h.router, token, http.MethodGet, path+"/signatures/"+stringField(t, secondVersion, "signature_id")+"/file", nil, http.StatusOK)
	if _, err := png.Decode(bytes.NewReader(current)); err != nil {
		t.Fatal("JPEG not stored as PNG")
	}
	retained := performJSONRequest(t, h.router, token, http.MethodGet, filePath, nil, http.StatusOK)
	if !bytes.Equal(original, retained) {
		t.Fatal("replacement changed earlier signature bytes")
	}
	var keys []string
	rows, err := h.pool.Query(context.Background(), "SELECT file_key FROM certificate_signature_versions ORDER BY created_at")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			t.Fatal(err)
		}
		keys = append(keys, key)
	}
	if rows.Err() != nil || len(keys) != 2 || keys[0] == keys[1] {
		t.Fatal("signature versions did not retain separate objects")
	}
	journal, err := os.ReadFile(os.Getenv("AMS_TEST_STORAGE_MANIFEST"))
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range keys {
		if !strings.HasPrefix(key, os.Getenv("AMS_TEST_STORAGE_PREFIX")) || !bytes.Contains(journal, []byte(key+"\n")) {
			t.Fatal("signature object escaped runner cleanup")
		}
	}
}

type signingMemoryStore struct {
	objects   map[string][]byte
	failPut   bool
	beforePut func()
}

func (s *signingMemoryStore) PrepareKey(id, owner uuid.UUID) (string, error) {
	return "controlled-signatures/" + owner.String() + "/" + id.String() + ".png", nil
}
func (s *signingMemoryStore) Put(_ context.Context, key string, data []byte) error {
	if s.beforePut != nil {
		callback := s.beforePut
		s.beforePut = nil
		callback()
	}
	if s.failPut {
		return errors.New("controlled storage failure")
	}
	s.objects[key] = bytes.Clone(data)
	return nil
}
func (s *signingMemoryStore) Read(_ context.Context, key string) ([]byte, error) {
	data, ok := s.objects[key]
	if !ok {
		return nil, errors.New("missing controlled image")
	}
	return bytes.Clone(data), nil
}

type signingFailPublish struct{ issuance.SignatureRepository }

func (signingFailPublish) Publish(context.Context, uuid.UUID, uuid.UUID, *uuid.UUID) error {
	return errors.New("controlled publication failure")
}

func TestGeneratedRenewalSigningStorageAndPublicationFailuresPreserveCurrentImage(t *testing.T) {
	h := setupIntegrationTest(t)
	user := createIntegrationUser(t, h.pool, "Failure", "Examiner", "failure-signing@example.com", "signing-password", "ADMIN")
	store := &signingMemoryStore{objects: map[string][]byte{}}
	repo := issuance.PostgresSignatures{Pool: h.pool}
	service := issuance.Signatures{Repository: repo, Store: store}
	ctx := context.Background()
	original, err := service.ReplaceOwnSignature(ctx, user.UserID, bytes.NewReader(signingImage(t, false)))
	if err != nil {
		t.Fatal(err)
	}
	originalBytes, err := service.OwnImage(ctx, user.UserID, original.Signature.ID)
	if err != nil {
		t.Fatal(err)
	}
	store.failPut = true
	if _, err := service.ReplaceOwnSignature(ctx, user.UserID, bytes.NewReader(signingImage(t, true))); !errors.Is(err, issuance.ErrStorage) {
		t.Fatalf("storage failure: %v", err)
	}
	store.failPut = false
	failing := issuance.Signatures{Repository: signingFailPublish{SignatureRepository: repo}, Store: store}
	if _, err := failing.ReplaceOwnSignature(ctx, user.UserID, bytes.NewReader(signingImage(t, true))); err == nil {
		t.Fatal("publication failure was ignored")
	}
	current, err := service.OwnProfile(ctx, user.UserID)
	if err != nil || current.Signature.ID != original.Signature.ID {
		t.Fatal("failure replaced current signature")
	}
	retained, err := service.OwnImage(ctx, user.UserID, original.Signature.ID)
	if err != nil || !bytes.Equal(retained, originalBytes) {
		t.Fatal("failure changed stored image")
	}
	var failed int
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_signature_versions WHERE owner_id=$1 AND storage_state='FAILED'", user.UserID).Scan(&failed); err != nil || failed != 2 {
		t.Fatal("failed writes lost their persistent object references")
	}
	var failedID uuid.UUID
	if err := h.pool.QueryRow(ctx, "SELECT signature_id FROM certificate_signature_versions WHERE owner_id=$1 AND storage_state='FAILED' LIMIT 1", user.UserID).Scan(&failedID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.OwnImage(ctx, user.UserID, failedID); !errors.Is(err, issuance.ErrNotFound) {
		t.Fatalf("unpublished signature was readable: %v", err)
	}
	store.objects[original.Signature.Key] = []byte("altered storage bytes")
	if _, err := service.OwnImage(ctx, user.UserID, original.Signature.ID); !errors.Is(err, issuance.ErrStorage) {
		t.Fatalf("altered signature bytes were served: %v", err)
	}
	store.objects[original.Signature.Key] = originalBytes
	if _, err := h.pool.Exec(ctx, "UPDATE certificate_signature_versions SET file_key='rewritten' WHERE signature_id=$1", original.Signature.ID); err == nil {
		t.Fatal("immutable version metadata was rewritten")
	}
	// Source deletion preserves stable ownership/object metadata for history.
	if _, err := db.New(h.pool).DeleteUser(ctx, user.UserID); err != nil {
		t.Fatal(err)
	}
	var ownerID uuid.UUID
	if err := h.pool.QueryRow(ctx, "SELECT owner_id FROM certificate_signature_versions WHERE signature_id=$1", original.Signature.ID).Scan(&ownerID); err != nil || ownerID != user.UserID {
		t.Fatal("source deletion erased signature history")
	}
}

func TestGeneratedRenewalSlowSignatureReplacementCannotOverwriteNewerImage(t *testing.T) {
	h := setupIntegrationTest(t)
	user := createIntegrationUser(t, h.pool, "Concurrent", "Examiner", "concurrent-signing@example.com", "signing-password", "ADMIN")
	store := &signingMemoryStore{objects: map[string][]byte{}}
	service := issuance.Signatures{Repository: issuance.PostgresSignatures{Pool: h.pool}, Store: store}
	ctx := context.Background()
	if _, err := service.ReplaceOwnSignature(ctx, user.UserID, bytes.NewReader(signingImage(t, false))); err != nil {
		t.Fatal(err)
	}
	var newer issuance.SigningProfile
	store.beforePut = func() {
		var err error
		newer, err = service.ReplaceOwnSignature(ctx, user.UserID, bytes.NewReader(signingImage(t, true)))
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := service.ReplaceOwnSignature(ctx, user.UserID, bytes.NewReader(signingImage(t, false))); !errors.Is(err, issuance.ErrConflict) {
		t.Fatalf("older upload was not fenced: %v", err)
	}
	current, err := service.OwnProfile(ctx, user.UserID)
	if err != nil || current.Signature.ID != newer.Signature.ID {
		t.Fatal("older upload overwrote newer publication")
	}
}

func signingActor(t *testing.T, h *integrationHarness) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := h.pool.QueryRow(context.Background(), "SELECT user_id FROM users WHERE token=$1", h.adminToken).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func signingPerson(t *testing.T, h *integrationHarness, name string, category uuid.UUID, active bool) uuid.UUID {
	t.Helper()
	p, err := db.New(h.pool).CreateCompetentPerson(context.Background(), db.CreateCompetentPersonParams{
		FullName: name, PersonType: "Internal", Organization: "Porto Marine", CompetencyCategoryID: category, Active: active,
	})
	if err != nil {
		t.Fatal(err)
	}
	return p.CompetentPersonID
}

func signingCategory(t *testing.T, h *integrationHarness, name string, active bool) uuid.UUID {
	t.Helper()
	c, err := db.New(h.pool).CreateCompetencyCategory(context.Background(), db.CreateCompetencyCategoryParams{
		CategoryCode: name, CategoryName: name, Description: "Signer eligibility fixture", Active: active,
	})
	if err != nil {
		t.Fatal(err)
	}
	return c.CompetencyCategoryID
}

func TestGeneratedRenewalSuperAdminManagementRejectsDirectRoleAndFieldBypasses(t *testing.T) {
	h := setupIntegrationTest(t)
	category := signingCategory(t, h, "MANAGE", true)
	inactive := signingCategory(t, h, "INACTIVE", false)
	person := signingPerson(t, h, "Managed examiner", category, true)
	adminToken := createIntegrationUserToken(t, h.pool, "Admin", "Examiner", "managed-admin@example.com", "signing-password", "ADMIN")
	profile := decodeObject(t, performJSONRequest(t, h.router, adminToken, http.MethodGet, "/v1/account/signing-profile", nil, http.StatusOK))
	adminID := stringField(t, profile, "user_id")
	personPath := "/v1/competent-person/" + person.String() + "/signing-profile"
	accountPath := "/v1/user/" + adminID + "/signing-profile"
	for _, token := range []string{adminToken,
		createIntegrationUserToken(t, h.pool, "User", "Examiner", "managed-user@example.com", "signing-password", "USER"),
		createIntegrationUserToken(t, h.pool, "Client", "Examiner", "managed-client@example.com", "signing-password", "CLIENT"), ""} {
		status := http.StatusForbidden
		if token == "" {
			status = http.StatusUnauthorized
		}
		performJSONRequest(t, h.router, token, http.MethodGet, personPath, nil, status)
		performMultipartRequest(t, h.router, token, personPath+"/signature", "file", "signature.png", signingImage(t, false), nil, status)
		performJSONRequest(t, h.router, token, http.MethodGet, personPath+"/signatures/"+uuid.NewString()+"/file", nil, status)
		performJSONRequest(t, h.router, token, http.MethodGet, accountPath, nil, status)
		performJSONRequest(t, h.router, token, http.MethodPut, accountPath, map[string]any{"competency_category_id": category}, status)
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/competent-person/"+uuid.NewString()+"/signing-profile", nil, http.StatusNotFound)
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/user/"+uuid.NewString()+"/signing-profile", nil, http.StatusNotFound)
	for _, input := range []map[string]any{
		{}, {"competency_category_id": "invalid"}, {"competency_category_id": uuid.New()}, {"competency_category_id": inactive},
		{"competency_category_id": category, "organization": "Spoof"}, {"competency_category_id": category, "user_id": uuid.New()},
	} {
		performJSONRequest(t, h.router, h.adminToken, http.MethodPut, accountPath, input, http.StatusBadRequest)
	}
	for _, role := range []string{"USER", "CLIENT", "SUPER_ADMIN"} {
		user := createIntegrationUser(t, h.pool, role, "Target", "managed-target-"+role+"@example.com", "signing-password", role)
		performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/user/"+user.UserID.String()+"/signing-profile", map[string]any{"competency_category_id": category}, http.StatusBadRequest)
	}
	performMultipartRequest(t, h.router, h.adminToken, personPath+"/signature", "file", "fake.png", []byte("%PDF-1.4"), nil, http.StatusBadRequest)
	performMultipartRequest(t, h.router, h.adminToken, personPath+"/signature", "file", "oversized.png", bytes.Repeat([]byte{'x'}, issuance.MaxSignatureBytes+1), nil, http.StatusRequestEntityTooLarge)
	performMultipartRequest(t, h.router, h.adminToken, personPath+"/signature", "file", "image.png", signingImage(t, false), map[string]string{"competent_person_id": uuid.NewString()}, http.StatusBadRequest)
	assigned := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, accountPath, map[string]any{"competency_category_id": category}, http.StatusOK))
	assertField(t, assigned, "competency_category_id", category.String())
	cleared := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, accountPath, map[string]any{"competency_category_id": nil}, http.StatusOK))
	if cleared["competency_category_id"] != nil {
		t.Fatal("category was not cleared")
	}
	// Existing JWT claims do not grant management after demotion.
	actor := signingActor(t, h)
	if _, err := h.pool.Exec(context.Background(), "UPDATE users SET role='ADMIN' WHERE user_id=$1", actor); err != nil {
		t.Fatal(err)
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, accountPath, map[string]any{"competency_category_id": category}, http.StatusForbidden)
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, personPath, nil, http.StatusForbidden)
}

func TestGeneratedRenewalSignerEligibilityRevalidatesCategoryStatusAndOwnership(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	actor := signingActor(t, h)
	a := signingCategory(t, h, "ELIGIBLE_A", true)
	b := signingCategory(t, h, "ELIGIBLE_B", true)
	inactive := signingCategory(t, h, "ELIGIBLE_INACTIVE", false)
	allowed := signingPerson(t, h, "Allowed examiner", a, true)
	unsigned := signingPerson(t, h, "Unsigned examiner", a, true)
	wrong := signingPerson(t, h, "Wrong category examiner", b, true)
	inactivePerson := signingPerson(t, h, "Inactive examiner", a, false)
	inactiveCategory := signingPerson(t, h, "Inactive category examiner", inactive, true)
	blank := signingPerson(t, h, "Blank organization examiner", a, true)
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET organization=E'\\t ' WHERE competent_person_id=$1", blank); err != nil {
		t.Fatal(err)
	}
	store := &signingMemoryStore{objects: map[string][]byte{}}
	manager := issuance.SignerManagement{Pool: h.pool, Store: store}
	for _, person := range []uuid.UUID{allowed, wrong, inactivePerson, inactiveCategory, blank} {
		if _, err := manager.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, false))); err != nil {
			t.Fatal(err)
		}
	}
	component, testID := createComponentFixture(t, h, "Signer eligibility component")
	payload := certificatePayload(component, testID, 90)
	payload["competency_category_ids"] = []string{a.String()}
	cert := uuid.MustParse(stringField(t, createCertificate(t, h, payload), "certificate_id"))
	path := "/v1/certificate/" + cert.String()
	assertField(t, decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path, nil, http.StatusOK)), "competency_category_ids", []any{a.String()})
	adminToken := createIntegrationUserToken(t, h.pool, "Own", "Examiner", "eligible-admin@example.com", "signing-password", "ADMIN")
	p := decodeObject(t, performJSONRequest(t, h.router, adminToken, http.MethodGet, "/v1/account/signing-profile", nil, http.StatusOK))
	admin := uuid.MustParse(stringField(t, p, "user_id"))
	assertChoicesFor := func(certificatePath, token string, expected ...uuid.UUID) {
		t.Helper()
		var rows []issuance.EligibleSigner
		raw := performJSONRequest(t, h.router, token, http.MethodGet, certificatePath+"/generated-signers", nil, http.StatusOK)
		if err := json.Unmarshal(raw, &rows); err != nil {
			t.Fatal(err)
		}
		if len(rows) != len(expected) {
			t.Fatalf("eligible signer count: got %d, want %d: %s", len(rows), len(expected), raw)
		}
		for _, id := range expected {
			found := false
			for _, row := range rows {
				if row.SignerID == id {
					found = true
					if row.Signature.ID == uuid.Nil || row.Signature.Key != "" {
						t.Fatal("missing signature or exposed private key")
					}
				}
			}
			if !found {
				t.Fatalf("expected signer %s missing: %s", id, raw)
			}
		}
	}
	assertChoices := func(token string, expected ...uuid.UUID) {
		t.Helper()
		assertChoicesFor(path, token, expected...)
	}
	assertChoices(h.adminToken, allowed)
	assertChoices(adminToken)
	if _, err := manager.AssignCategory(ctx, actor, admin, &a); err != nil {
		t.Fatal(err)
	}
	assertChoices(adminToken) // A category alone does not confer eligibility.
	own := issuance.Signatures{Repository: issuance.PostgresSignatures{Pool: h.pool}, Store: store}
	ownProfile, err := own.ReplaceOwnSignature(ctx, admin, bytes.NewReader(signingImage(t, false)))
	if err != nil {
		t.Fatal(err)
	}
	assertChoices(adminToken, admin)
	resolved := decodeObject(t, performJSONRequest(t, h.router, adminToken, http.MethodPost, path+"/generated-signer", map[string]any{}, http.StatusOK))
	assertField(t, resolved, "owner_kind", "ACCOUNT")
	assertField(t, resolved, "full_name", "Own Examiner")
	for _, id := range []uuid.UUID{allowed, uuid.New()} {
		performJSONRequest(t, h.router, adminToken, http.MethodPost, path+"/generated-signer", map[string]any{"signer_id": id}, http.StatusForbidden)
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-signer", map[string]any{"signer_id": allowed}, http.StatusOK)
	for _, id := range []uuid.UUID{admin, unsigned, wrong, inactivePerson, inactiveCategory, blank, uuid.New()} {
		performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-signer", map[string]any{"signer_id": id}, http.StatusBadRequest)
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-signer", map[string]any{}, http.StatusBadRequest)
	performJSONRequest(t, h.router, adminToken, http.MethodPost, path+"/generated-signer", map[string]any{"signer_id": admin, "organization": "Spoof"}, http.StatusBadRequest)
	for _, role := range []string{"USER", "CLIENT"} {
		token := createIntegrationUserToken(t, h.pool, role, "Signer", "eligible-"+role+"@example.com", "signing-password", role)
		performJSONRequest(t, h.router, token, http.MethodGet, path+"/generated-signers", nil, http.StatusForbidden)
		performJSONRequest(t, h.router, token, http.MethodPost, path+"/generated-signer", map[string]any{"signer_id": allowed}, http.StatusForbidden)
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+uuid.NewString()+"/generated-signers", nil, http.StatusNotFound)
	if _, err := h.pool.Exec(ctx, "UPDATE competency_categories SET active=FALSE WHERE competency_category_id=$1", a); err != nil {
		t.Fatal(err)
	}
	assertChoices(h.adminToken)
	assertChoices(adminToken)
	performJSONRequest(t, h.router, adminToken, http.MethodPost, path+"/generated-signer", map[string]any{}, http.StatusBadRequest)
	if _, err := h.pool.Exec(ctx, "UPDATE competency_categories SET active=TRUE WHERE competency_category_id=$1", a); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET active=FALSE WHERE competent_person_id=$1", allowed); err != nil {
		t.Fatal(err)
	}
	assertChoices(h.adminToken)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-signer", map[string]any{"signer_id": allowed}, http.StatusBadRequest)
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET active=TRUE WHERE competent_person_id=$1", allowed); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.AssignCategory(ctx, actor, admin, &b); err != nil {
		t.Fatal(err)
	}
	assertChoices(adminToken)
	// Category rules are configured on creation; PATCH does not accept them.
	// Use a separate unrestricted certificate to exercise the real API contract.
	unrestrictedPayload := certificatePayload(component, testID, 91)
	unrestrictedPayload["competency_category_ids"] = []string{}
	unrestrictedID := stringField(t, createCertificate(t, h, unrestrictedPayload), "certificate_id")
	unrestrictedPath := "/v1/certificate/" + unrestrictedID
	assertField(t, decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, unrestrictedPath, nil, http.StatusOK)), "competency_category_ids", []any{})
	assertChoicesFor(unrestrictedPath, h.adminToken, allowed, wrong)
	assertChoicesFor(unrestrictedPath, adminToken, admin)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, unrestrictedPath+"/generated-signer", map[string]any{"signer_id": wrong}, http.StatusOK)
	performJSONRequest(t, h.router, adminToken, http.MethodPost, unrestrictedPath+"/generated-signer", map[string]any{}, http.StatusOK)
	// A selection permitted by the unrestricted record grants no authority on A.
	assertChoices(h.adminToken, allowed)
	assertChoices(adminToken)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-signer", map[string]any{"signer_id": wrong}, http.StatusBadRequest)
	performJSONRequest(t, h.router, adminToken, http.MethodPost, path+"/generated-signer", map[string]any{}, http.StatusBadRequest)
	cleared, err := manager.AssignCategory(ctx, actor, admin, nil)
	if err != nil || cleared.Signature.ID != ownProfile.Signature.ID {
		t.Fatal("category clear changed saved signature")
	}
	assertChoices(adminToken)
	assertChoicesFor(unrestrictedPath, adminToken)
	if _, err := manager.AssignCategory(ctx, actor, admin, &a); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE users SET status='SUSPENDED' WHERE user_id=$1", admin); err != nil {
		t.Fatal(err)
	}
	managedInactive, err := manager.AssignCategory(ctx, actor, admin, nil)
	if err != nil || managedInactive.Signature.ID != ownProfile.Signature.ID {
		t.Fatal("super admin could not manage suspended admin without changing its signature")
	}
	performJSONRequest(t, h.router, adminToken, http.MethodGet, path+"/generated-signers", nil, http.StatusForbidden)
}

func TestGeneratedRenewalCompetentSignaturesUsePrivateImmutableR2Versions(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)
	if os.Getenv("AMS_TEST_STORAGE_PREFIX") == "" {
		t.Fatal("use isolated runner storage")
	}
	category := signingCategory(t, h, "CP_R2", true)
	person := signingPerson(t, h, "R2 managed examiner", category, true)
	other := signingPerson(t, h, "Other managed examiner", category, true)
	path := "/v1/competent-person/" + person.String() + "/signing-profile"
	first := decodeObject(t, performMultipartRequest(t, h.router, h.adminToken, path+"/signature", "file", "signature.png", signingImage(t, false), nil, http.StatusOK))
	id := stringField(t, first["signature"].(map[string]any), "signature_id")
	filePath := path + "/signatures/" + id + "/file"
	original := performJSONRequest(t, h.router, h.adminToken, http.MethodGet, filePath, nil, http.StatusOK)
	img, err := png.Decode(bytes.NewReader(original))
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, alpha := img.At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatal("competent signature lost alpha")
	}
	digest := sha256.Sum256(original)
	assertField(t, first["signature"].(map[string]any), "sha256", hex.EncodeToString(digest[:]))
	second := decodeObject(t, performMultipartRequest(t, h.router, h.adminToken, path+"/signature", "file", "signature.jpg", signingImage(t, true), nil, http.StatusOK))
	secondID := stringField(t, second["signature"].(map[string]any), "signature_id")
	if secondID == id {
		t.Fatal("competent signature was overwritten")
	}
	current := performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/signatures/"+secondID+"/file", nil, http.StatusOK)
	if _, err := png.Decode(bytes.NewReader(current)); err != nil {
		t.Fatal("JPEG not normalized")
	}
	if !bytes.Equal(original, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, filePath, nil, http.StatusOK)) {
		t.Fatal("earlier image changed")
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/competent-person/"+other.String()+"/signing-profile/signatures/"+id+"/file", nil, http.StatusNotFound)
	token := createIntegrationUserToken(t, h.pool, "Admin", "Examiner", "cp-r2-admin@example.com", "signing-password", "ADMIN")
	performJSONRequest(t, h.router, token, http.MethodGet, filePath, nil, http.StatusForbidden)
	var key string
	var creator uuid.UUID
	if err := h.pool.QueryRow(context.Background(), "SELECT file_key,created_by_user_id FROM certificate_signature_versions WHERE signature_id=$1", id).Scan(&key, &creator); err != nil {
		t.Fatal(err)
	}
	journal, err := os.ReadFile(os.Getenv("AMS_TEST_STORAGE_MANIFEST"))
	if err != nil || !strings.HasPrefix(key, os.Getenv("AMS_TEST_STORAGE_PREFIX")) || !strings.Contains(key, "competent-person") || !bytes.Contains(journal, []byte(key+"\n")) || creator != signingActor(t, h) {
		t.Fatal("competent signature ownership or cleanup scope lost")
	}
	// A profile cannot point at another person's stored signature.
	if _, err := h.pool.Exec(context.Background(), "INSERT INTO competent_person_signing_profiles(competent_person_id,current_signature_id) VALUES($1,$2)", other, id); err == nil {
		t.Fatal("foreign competent signature association accepted")
	}
	if _, err := h.pool.Exec(context.Background(), "DELETE FROM competent_persons WHERE competent_person_id=$1", person); err != nil {
		t.Fatal(err)
	}
	var owner uuid.UUID
	if err := h.pool.QueryRow(context.Background(), "SELECT owner_id FROM certificate_signature_versions WHERE signature_id=$1 AND competent_person_id IS NULL", id).Scan(&owner); err != nil || owner != person {
		t.Fatal("competent person deletion erased stable signature ownership")
	}
}

func TestGeneratedRenewalCompetentSignatureFailuresAndRevokedActorCannotPublish(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	actor := signingActor(t, h)
	person := signingPerson(t, h, "Publication examiner", signingCategory(t, h, "CP_FAILURE", true), true)
	store := &signingMemoryStore{objects: map[string][]byte{}}
	service := issuance.SignerManagement{Pool: h.pool, Store: store}
	original, err := service.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, false)))
	if err != nil {
		t.Fatal(err)
	}
	store.failPut = true
	if _, err := service.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, true))); !errors.Is(err, issuance.ErrStorage) {
		t.Fatalf("storage failure: %v", err)
	}
	store.failPut = false
	current, err := service.PersonProfile(ctx, actor, person)
	if err != nil || current.Signature.ID != original.Signature.ID {
		t.Fatal("failed upload changed current signature")
	}
	var newer issuance.CompetentSigningProfile
	store.beforePut = func() {
		var err error
		newer, err = service.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, true)))
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := service.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, false))); !errors.Is(err, issuance.ErrConflict) {
		t.Fatalf("slow competent upload overwrote newer: %v", err)
	}
	current, err = service.PersonProfile(ctx, actor, person)
	if err != nil || current.Signature.ID != newer.Signature.ID {
		t.Fatal("slow upload became current")
	}
	store.beforePut = func() {
		if _, err := h.pool.Exec(ctx, "UPDATE users SET role='ADMIN' WHERE user_id=$1", actor); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := service.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, false))); !errors.Is(err, issuance.ErrConflict) {
		t.Fatalf("revoked manager published: %v", err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE users SET role='SUPER_ADMIN' WHERE user_id=$1", actor); err != nil {
		t.Fatal(err)
	}
	current, err = service.PersonProfile(ctx, actor, person)
	if err != nil || current.Signature.ID != newer.Signature.ID {
		t.Fatal("revoked actor changed current image")
	}
	var failed int
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_signature_versions WHERE owner_id=$1 AND storage_state='FAILED'", person).Scan(&failed); err != nil || failed != 3 {
		t.Fatal("failed competent uploads lost persistent references")
	}
}
