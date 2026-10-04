package main_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
	"sync"

	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
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
	longRemarks := strings.TrimSuffix(strings.Repeat("A recorded pressure observation with readable continuation.\n", 60), "\n")
	longInput := map[string]any{"signer_id": person, "issue_date": "2026-10-04", "remarks": longRemarks, "measurements": "Applied pressure: 10 bar"}
	var cleanLong issuance.PreviewResponse
	if err := json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, longInput, http.StatusOK), &cleanLong); err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{"\n", "\r\n\r\n", "\n \t\n"} {
		longInput["remarks"] = longRemarks + suffix
		longInput["measurements"] = "Applied pressure: 10 bar" + suffix
		var padded issuance.PreviewResponse
		if err := json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, longInput, http.StatusOK), &padded); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(padded.PDF, cleanLong.PDF) || padded.Number != cleanLong.Number {
			t.Fatalf("trailing blanks %q changed preview PDF content or pagination", suffix)
		}
		if padded.Snapshot.Remarks != strings.ReplaceAll(longRemarks+suffix, "\r\n", "\n") || padded.Snapshot.Measurements != strings.ReplaceAll("Applied pressure: 10 bar"+suffix, "\r\n", "\n") {
			t.Fatal("preview discarded approved trailing whitespace")
		}
		performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/validate", map[string]any{"preview_token": padded.Token}, http.StatusNoContent)
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
		// Retain the trailing-blank regression example for final visual review.
		var long issuance.PreviewResponse
		if err := json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path, longInput, http.StatusOK), &long); err != nil {
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

// Step 5 uses deterministic fault injection against the real disposable database.
// All live R2 writes are exercised separately by the HTTP/UI/API gates.
type issuanceMemoryDocuments struct {
	mu              sync.Mutex
	objects         map[string][]byte
	failPut         bool
	uncertainPut    bool
	failRead        bool
	afterPut        func()
	puts            int
	deletes         int
	failDelete      bool
	uncertainDelete bool
}

func (s *issuanceMemoryDocuments) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deletes++
	if s.failDelete {
		return errors.New("controlled DELETE failure")
	}
	delete(s.objects, key)
	if s.uncertainDelete {
		return errors.New("controlled lost DELETE acknowledgement")
	}
	return nil
}

func (s *issuanceMemoryDocuments) PrepareKey(id, cert uuid.UUID) (string, error) {
	return "controlled-issued/" + cert.String() + "/" + id.String() + ".pdf", nil
}
func (s *issuanceMemoryDocuments) Put(_ context.Context, key string, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.puts++
	if s.failPut {
		return errors.New("controlled PUT failure")
	}
	if _, exists := s.objects[key]; exists {
		return errors.New("immutable document exists")
	}
	s.objects[key] = bytes.Clone(data)
	if s.afterPut != nil {
		s.afterPut()
	}
	if s.uncertainPut {
		return errors.New("controlled lost PUT acknowledgment")
	}
	return nil
}
func (s *issuanceMemoryDocuments) Read(_ context.Context, key string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failRead {
		return nil, errors.New("controlled GET failure")
	}
	data, exists := s.objects[key]
	if !exists {
		return nil, issuance.ErrDocumentMissing
	}
	return bytes.Clone(data), nil
}

func recoveryFailureFixture(t *testing.T, h *integrationHarness) (issuance.Issuances, uuid.UUID, uuid.UUID, issuance.Issuance, *issuanceMemoryDocuments) {
	t.Helper()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(context.Background(), actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	documents.uncertainPut = true
	failed, err := service.Approve(context.Background(), actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || failed.State != "FAILED" {
		t.Fatal(failed, err)
	}
	documents.uncertainPut = false
	return service, actor, cert, failed, documents
}

func TestGeneratedRenewalRecoveryReusesSavedApprovalAfterProfileChanges(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	original, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	before, _ := json.Marshal(original)
	source, err := db.New(h.pool).GetCertificatePreviewSource(ctx, cert)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot issuance.Snapshot
	if err := json.Unmarshal(failed.Snapshot, &snapshot); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET full_name='Changed after approval', active=false WHERE competent_person_id=$1", snapshot.Signer.SignerID); err != nil {
		t.Fatal(err)
	}
	renderer := &issuanceRecordingRenderer{failure: errors.New("retry must reuse stored bytes")}
	service.Previews.Renderer = renderer
	puts := documents.puts
	completed, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if err != nil || completed.State != "COMPLETED" || completed.ID != failed.ID || completed.Number != failed.Number || completed.SHA256 != failed.SHA256 || !bytes.Equal(completed.Snapshot, failed.Snapshot) || renderer.calls != 0 || documents.puts != puts {
		t.Fatal(completed, err, renderer.calls, documents.puts)
	}
	// Repeated retry is idempotent and a completed certificate cannot be abandoned.
	repeated, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if err != nil || repeated.CompletedAt == nil || !repeated.CompletedAt.Equal(*completed.CompletedAt) {
		t.Fatal(repeated, err)
	}
	if _, err = service.Abandon(ctx, actor, cert, failed.ID); !errors.Is(err, issuance.ErrIssuanceCompleted) {
		t.Fatal(err)
	}
	if _, err = service.RetryCleanup(ctx, actor, cert, failed.ID); !errors.Is(err, issuance.ErrIssuanceCompleted) {
		t.Fatal(err)
	}
	if documents.deletes != 0 {
		t.Fatal("completed file deleted")
	}
	// Publication happened only on recovery, not during the uncertain PUT.
	if len(before) == 0 {
		t.Fatal("missing original fixture")
	}
	var version int64
	if err := h.pool.QueryRow(ctx, "SELECT renewal_version FROM certificates WHERE certificate_id=$1", cert).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != source.RenewalVersion+1 {
		t.Fatal("retry published more than once")
	}
}

// The preview panel observes this contract after a history recovery invalidates its status query.
func TestGeneratedRenewalStatusReflectsRecoveredAndAbandonedApprovals(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	statusPath := "/v1/certificate/" + cert.String() + "/issuances/" + failed.ID.String()
	before := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, statusPath, nil, http.StatusOK))
	assertField(t, before, "state", "FAILED")
	completed, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	refreshed := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, statusPath, nil, http.StatusOK))
	assertField(t, refreshed, "state", "COMPLETED")
	assertField(t, refreshed, "document_number", failed.Number)
	if stringField(t, refreshed, "document_sha256") != completed.SHA256 {
		t.Fatal("status lost stored digest")
	}
	var saved issuance.Snapshot
	if err = json.Unmarshal(failed.Snapshot, &saved); err != nil {
		t.Fatal(err)
	}
	preview, err := service.Previews.Prepare(ctx, actor, cert, issuance.PreviewInput{SignerID: &saved.Signer.SignerID, IssueDate: failed.IssueDate})
	if err != nil {
		t.Fatal(err)
	}
	documents.uncertainPut = true
	second, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) {
		t.Fatal(err)
	}
	documents.uncertainPut = false
	abandoned, err := service.Abandon(ctx, actor, cert, second.ID)
	if err != nil {
		t.Fatal(err)
	}
	terminal := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+cert.String()+"/issuances/"+second.ID.String(), nil, http.StatusOK))
	assertField(t, terminal, "state", "ABANDONED")
	assertField(t, terminal, "cleanup_state", "DELETED")
	assertField(t, terminal, "document_number", abandoned.Number)
	if terminal["abandoned_at"] == nil {
		t.Fatal("terminal status lost audit timestamp")
	}
}

func TestGeneratedRenewalRecoveryRenderAndStorageFailuresKeepOneNumber(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	renderer := &issuanceRecordingRenderer{failure: errors.New("render failed")}
	service.Previews.Renderer = renderer
	failed, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) {
		t.Fatal(err)
	}
	renderer.failure = nil
	documents.failPut = true
	second, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || second.Number != failed.Number {
		t.Fatal(second, err)
	}
	documents.failPut = false
	completed, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if err != nil || completed.Number != failed.Number || completed.State != "COMPLETED" {
		t.Fatal(completed, err)
	}
	var count int
	if err = h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_issuances WHERE certificate_id=$1", cert).Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
}

func TestGeneratedRenewalRecoveryAbandonRetainsAuditAndRetriesDeletion(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	current, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	before, _ := json.Marshal(current)
	row, _ := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	documents.failDelete = true
	abandoned, err := service.Abandon(ctx, actor, cert, failed.ID)
	if !errors.Is(err, issuance.ErrIssuanceCleanup) || abandoned.State != "ABANDONED" || abandoned.CleanupState != "FAILED" || abandoned.CleanupFailureCode != "STORAGE_DELETE" || abandoned.Number != failed.Number {
		t.Fatal(abandoned, err)
	}
	if len(documents.objects[row.FileKey]) == 0 {
		t.Fatal("failed deletion lost retained file")
	}
	if _, err = service.Retry(ctx, actor, cert, failed.ID, nil); !errors.Is(err, issuance.ErrIssuanceAbandoned) {
		t.Fatal(err)
	}
	documents.failDelete = false
	documents.uncertainDelete = true
	lost, err := service.RetryCleanup(ctx, actor, cert, failed.ID)
	if !errors.Is(err, issuance.ErrIssuanceCleanup) || lost.CleanupState != "FAILED" {
		t.Fatal(lost, err)
	}
	documents.uncertainDelete = false
	deleted, err := service.RetryCleanup(ctx, actor, cert, failed.ID)
	if err != nil || deleted.CleanupState != "DELETED" {
		t.Fatal(deleted, err)
	}
	deletes := documents.deletes
	for i := 0; i < 2; i++ {
		again, err := service.Abandon(ctx, actor, cert, failed.ID)
		if err != nil || again.CleanupState != "DELETED" {
			t.Fatal(again, err)
		}
		_, err = service.RetryCleanup(ctx, actor, cert, failed.ID)
		if err != nil {
			t.Fatal(err)
		}
	}
	if documents.deletes != deletes || len(documents.objects) != 0 {
		t.Fatal("terminal cleanup performed another delete")
	}
	retained, _ := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	if retained.FileKey != row.FileKey || !bytes.Equal(retained.Snapshot, row.Snapshot) || retained.DocumentNumber != row.DocumentNumber || retained.DocumentSha256 != row.DocumentSha256 {
		t.Fatal("abandonment changed approved audit")
	}
	if retained.AbandonedBy == nil || *retained.AbandonedBy != actor || retained.AbandonedAt == nil {
		t.Fatal("abandonment actor/time not retained")
	}
	if _, err = h.pool.Exec(ctx, "UPDATE certificate_issuances SET abandoned_by=$2 WHERE issuance_id=$1", failed.ID, uuid.New()); err == nil {
		t.Fatal("abandonment audit could be rewritten")
	}
	assertCertificateUnchanged(t, h, cert, before)
	// Reserved sequence is never recycled after abandonment.
	var snap issuance.Snapshot
	_ = json.Unmarshal(failed.Snapshot, &snap)
	preview, err := service.Previews.Prepare(ctx, actor, cert, issuance.PreviewInput{SignerID: &snap.Signer.SignerID, IssueDate: failed.IssueDate})
	if err != nil {
		t.Fatal(err)
	}
	next, err := service.Approve(ctx, actor, cert, preview.Token)
	if err != nil || !strings.HasSuffix(next.Number, "-02") {
		t.Fatal(next, err)
	}
}

func TestGeneratedRenewalRecoveryExternalRequiresExactOriginalWhenMissing(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, preview, documents := generatedIssuanceFixture(t, h)
	input := externalInput(*preview.SignerID)
	documents.failPut = true
	failed, err := service.ApproveExternal(ctx, actor, cert, input)
	if !errors.Is(err, issuance.ErrIssuanceFailed) {
		t.Fatal(err)
	}
	documents.failPut = false
	missing, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if !errors.Is(err, issuance.ErrOriginalFileRequired) || missing.FailureCode != "DOCUMENT_INPUT" {
		t.Fatal(missing, err)
	}
	if _, err = service.Retry(ctx, actor, cert, failed.ID, []byte("wrong original")); !errors.Is(err, issuance.ErrApprovalMismatch) {
		t.Fatal(err)
	}
	completed, err := service.Retry(ctx, actor, cert, failed.ID, input.Data)
	if err != nil || completed.State != "COMPLETED" || completed.Number != "" || completed.ID != failed.ID {
		t.Fatal(completed, err)
	}
	if _, err = service.Abandon(ctx, actor, cert, failed.ID); !errors.Is(err, issuance.ErrIssuanceCompleted) {
		t.Fatal(err)
	}
}

func TestGeneratedRenewalRecoveryStaleApprovalCanOnlyBeAbandoned(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	if _, err := h.pool.Exec(ctx, "UPDATE certificates SET renewal_version=renewal_version+1 WHERE certificate_id=$1", cert); err != nil {
		t.Fatal(err)
	}
	current, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	before, _ := json.Marshal(current)
	stale, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if !errors.Is(err, issuance.ErrIssuanceConflict) || stale.FailureCode != "STALE_CERTIFICATE" {
		t.Fatal(stale, err)
	}
	abandoned, err := service.Abandon(ctx, actor, cert, failed.ID)
	if err != nil || abandoned.CleanupState != "DELETED" || documents.deletes != 1 {
		t.Fatal(abandoned, err)
	}
	assertCertificateUnchanged(t, h, cert, before)
}

func TestGeneratedRenewalRecoveryScopesRolesAndOwnership(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, _ := recoveryFailureFixture(t, h)
	for _, role := range []string{"ADMIN", "USER", "CLIENT"} {
		token := createIntegrationUserToken(t, h.pool, "Other", "Recovery", strings.ToLower(role)+"-recovery@example.com", "recovery-password", role)
		var other uuid.UUID
		if err := h.pool.QueryRow(ctx, "SELECT user_id FROM users WHERE token=$1", token).Scan(&other); err != nil {
			t.Fatal(err)
		}
		for _, action := range []string{"retry", "abandon", "cleanup"} {
			path := "/v1/certificate/" + cert.String() + "/issuances/" + failed.ID.String() + "/" + action
			performJSONRequest(t, h.router, token, http.MethodPost, path, nil, http.StatusForbidden)
		}
		if _, err := service.Retry(ctx, other, cert, failed.ID, nil); !errors.Is(err, issuance.ErrIssuerForbidden) {
			t.Fatal(role, err)
		}
	}
	if _, err := service.Retry(ctx, actor, uuid.New(), failed.ID, nil); !errors.Is(err, issuance.ErrNotFound) {
		t.Fatal(err)
	}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/certificate/"+uuid.NewString()+"/issuances/"+failed.ID.String()+"/retry", nil, http.StatusNotFound)
	if _, err := h.pool.Exec(ctx, "UPDATE users SET role='ADMIN' WHERE user_id=$1", actor); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Retry(ctx, actor, cert, failed.ID, nil); !errors.Is(err, issuance.ErrIssuerForbidden) {
		t.Fatal("downgraded super admin used competent signer", err)
	}
	// Own abandonment remains possible even after losing super-admin signer selection.
	abandoned, err := service.Abandon(ctx, actor, cert, failed.ID)
	if err != nil || abandoned.State != "ABANDONED" {
		t.Fatal(abandoned, err)
	}
}

func TestGeneratedRenewalRecoveryLeaseAndReferencedFilesAreProtected(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	if _, err := h.pool.Exec(ctx, "UPDATE certificate_issuances SET state='PROCESSING',lease_until=NOW()+INTERVAL '1 minute' WHERE issuance_id=$1", failed.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Abandon(ctx, actor, cert, failed.ID); !errors.Is(err, issuance.ErrIssuanceBusy) {
		t.Fatal(err)
	}
	processing, err := service.Retry(ctx, actor, cert, failed.ID, nil)
	if err != nil || processing.State != "PROCESSING" {
		t.Fatal(processing, err)
	}
	if _, err = h.pool.Exec(ctx, "UPDATE certificate_issuances SET lease_until=NOW()-INTERVAL '1 minute' WHERE issuance_id=$1", failed.ID); err != nil {
		t.Fatal(err)
	}
	row, _ := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	if _, err = h.pool.Exec(ctx, "UPDATE certificates SET certificate_file=$2 WHERE certificate_id=$1", cert, row.FileKey); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Abandon(ctx, actor, cert, failed.ID); !errors.Is(err, issuance.ErrIssuanceCompleted) {
		t.Fatal(err)
	}
	if documents.deletes != 0 {
		t.Fatal("current file deleted")
	}
	if _, err = h.pool.Exec(ctx, "UPDATE certificates SET certificate_file='' WHERE certificate_id=$1", cert); err != nil {
		t.Fatal(err)
	}
	abandoned, err := service.Abandon(ctx, actor, cert, failed.ID)
	if err != nil || abandoned.CleanupState != "DELETED" {
		t.Fatal(abandoned, err)
	}
}

type recoveryBlockedPut struct {
	*issuanceMemoryDocuments
	entered chan struct{}
	release chan struct{}
}

type recoveryDelayedDeleteAcknowledgement struct {
	*issuanceMemoryDocuments
	mu      sync.Mutex
	first   bool
	entered chan struct{}
	release chan struct{}
}

func (s *recoveryDelayedDeleteAcknowledgement) Delete(ctx context.Context, key string) error {
	s.mu.Lock()
	first := !s.first
	s.first = true
	s.mu.Unlock()
	err := s.issuanceMemoryDocuments.Delete(ctx, key)
	if first {
		close(s.entered)
		<-s.release
	}
	return err
}

type recoveryBlockedPutAndDelete struct {
	recoveryBlockedPut
	deletion *recoveryDelayedDeleteAcknowledgement
}

func (s recoveryBlockedPutAndDelete) Delete(ctx context.Context, key string) error {
	return s.deletion.Delete(ctx, key)
}

func TestGeneratedRenewalRecoveryLateWriteFencesOlderCleanupAcknowledgement(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	writing := recoveryBlockedPut{documents, make(chan struct{}), make(chan struct{})}
	deletion := &recoveryDelayedDeleteAcknowledgement{issuanceMemoryDocuments: documents, entered: make(chan struct{}), release: make(chan struct{})}
	service.Documents = recoveryBlockedPutAndDelete{writing, deletion}
	issued := make(chan error, 1)
	go func() { _, e := service.Approve(ctx, actor, cert, preview.Token); issued <- e }()
	defer func() {
		for _, ch := range []chan struct{}{writing.release, deletion.release} {
			select {
			case <-ch:
			default:
				close(ch)
			}
		}
	}()
	select {
	case <-writing.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("PUT did not start")
	}
	rows, err := db.New(h.pool).ListCertificateIssuances(ctx, db.ListCertificateIssuancesParams{CertificateID: cert, Limit: 1})
	if err != nil || len(rows) != 1 {
		t.Fatal(rows, err)
	}
	row := rows[0]
	if _, err = h.pool.Exec(ctx, "UPDATE certificate_issuances SET lease_until=NOW()-INTERVAL '1 minute' WHERE issuance_id=$1", row.IssuanceID); err != nil {
		t.Fatal(err)
	}
	abandoned := make(chan error, 1)
	go func() { _, e := service.Abandon(ctx, actor, cert, row.IssuanceID); abandoned <- e }()
	select {
	case <-deletion.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("DELETE acknowledgement did not pause")
	}
	close(writing.release)
	select {
	case err = <-issued:
		if !errors.Is(err, issuance.ErrIssuanceAbandoned) {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("late writer did not clean up")
	}
	close(deletion.release)
	select {
	case err = <-abandoned:
		if !errors.Is(err, issuance.ErrIssuanceCleanup) {
			t.Fatal("older cleanup should lose its generation claim", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("old cleanup did not finish")
	}
	latest, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: row.IssuanceID})
	if err != nil || latest.State != "ABANDONED" || latest.CleanupState != "DELETED" || latest.CleanupGeneration != 1 || len(documents.objects) != 0 || documents.deletes != 2 {
		t.Fatal(latest, err, documents.deletes)
	}
}

func (s recoveryBlockedPut) Put(ctx context.Context, key string, data []byte) error {
	close(s.entered)
	<-s.release
	return s.issuanceMemoryDocuments.Put(ctx, key, data)
}

func TestGeneratedRenewalRecoveryAbandonExpiredWriterDeletesLateObject(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	blocked := recoveryBlockedPut{documents, make(chan struct{}), make(chan struct{})}
	service.Documents = blocked
	done := make(chan error, 1)
	go func() { _, err := service.Approve(ctx, actor, cert, preview.Token); done <- err }()
	select {
	case <-blocked.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("PUT did not start")
	}
	// Always release the paused worker, including a failed assertion.
	defer func() {
		select {
		case <-blocked.release:
		default:
			close(blocked.release)
		}
	}()
	rows, err := db.New(h.pool).ListCertificateIssuances(ctx, db.ListCertificateIssuancesParams{CertificateID: cert, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatal("missing approved worker")
	}
	row := rows[0]
	if _, err = h.pool.Exec(ctx, "UPDATE certificate_issuances SET lease_until=NOW()-INTERVAL '1 minute' WHERE issuance_id=$1", row.IssuanceID); err != nil {
		t.Fatal(err)
	}
	abandoned, err := service.Abandon(ctx, actor, cert, row.IssuanceID)
	if err != nil || abandoned.CleanupState != "DELETED" {
		t.Fatal(abandoned, err)
	}
	close(blocked.release)
	select {
	case err = <-done:
		if !errors.Is(err, issuance.ErrIssuanceAbandoned) {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("late writer did not finish")
	}
	latest, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: row.IssuanceID})
	if err != nil || latest.State != "ABANDONED" || latest.CleanupState != "DELETED" || latest.CleanupGeneration != 1 || len(documents.objects) != 0 || documents.deletes != 2 {
		t.Fatal(latest, err, documents.deletes)
	}
}

func TestGeneratedRenewalRecoveryCleanupDatabaseFailureRetainsReference(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	_, err := h.pool.Exec(ctx, `CREATE FUNCTION controlled_cleanup_failure() RETURNS TRIGGER AS $$ BEGIN
 IF OLD.state='ABANDONED' AND NEW.cleanup_state='DELETED' THEN RAISE EXCEPTION 'controlled cleanup acknowledgement failure'; END IF;
 RETURN NEW; END; $$ LANGUAGE plpgsql;
 CREATE TRIGGER controlled_cleanup_failure BEFORE UPDATE ON certificate_issuances FOR EACH ROW EXECUTE FUNCTION controlled_cleanup_failure();`)
	if err != nil {
		t.Fatal(err)
	}
	defer h.pool.Exec(ctx, "DROP TRIGGER IF EXISTS controlled_cleanup_failure ON certificate_issuances; DROP FUNCTION IF EXISTS controlled_cleanup_failure()")
	abandoned, err := service.Abandon(ctx, actor, cert, failed.ID)
	if !errors.Is(err, issuance.ErrIssuanceCleanup) || abandoned.State != "ABANDONED" || abandoned.CleanupState != "PENDING" || len(documents.objects) != 0 {
		t.Fatal(abandoned, err)
	}
	row, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	if err != nil || row.FileKey == "" {
		t.Fatal(row, err)
	}
	if _, err = h.pool.Exec(ctx, "DROP TRIGGER controlled_cleanup_failure ON certificate_issuances; DROP FUNCTION controlled_cleanup_failure()"); err != nil {
		t.Fatal(err)
	}
	if _, err = h.pool.Exec(ctx, "UPDATE certificate_issuances SET lease_until=NOW()-INTERVAL '1 minute' WHERE issuance_id=$1", failed.ID); err != nil {
		t.Fatal(err)
	}
	deleted, err := service.RetryCleanup(ctx, actor, cert, failed.ID)
	if err != nil || deleted.CleanupState != "DELETED" || documents.deletes != 2 {
		t.Fatal(deleted, err)
	}
}

type recoveryBlockedDelete struct {
	*issuanceMemoryDocuments
	once    sync.Once
	entered chan struct{}
	release chan struct{}
}

func (s *recoveryBlockedDelete) Delete(ctx context.Context, key string) error {
	s.once.Do(func() { close(s.entered); <-s.release })
	return s.issuanceMemoryDocuments.Delete(ctx, key)
}

func TestGeneratedRenewalRecoveryCleanupLeasePreventsDuplicateActiveDeletion(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	blocked := &recoveryBlockedDelete{issuanceMemoryDocuments: documents, entered: make(chan struct{}), release: make(chan struct{})}
	service.Documents = blocked
	done := make(chan error, 1)
	go func() { _, err := service.Abandon(ctx, actor, cert, failed.ID); done <- err }()
	select {
	case <-blocked.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("DELETE did not start")
	}
	defer func() {
		select {
		case <-blocked.release:
		default:
			close(blocked.release)
		}
	}()
	pending, err := service.RetryCleanup(ctx, actor, cert, failed.ID)
	if err != nil || pending.CleanupState != "PENDING" || documents.deletes != 0 {
		t.Fatal(pending, err)
	}
	close(blocked.release)
	select {
	case err = <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("DELETE did not finish")
	}
	deleted, err := service.RetryCleanup(ctx, actor, cert, failed.ID)
	if err != nil || deleted.CleanupState != "DELETED" || documents.deletes != 1 {
		t.Fatal(deleted, err)
	}
}

func TestGeneratedRenewalRecoveryProtectsLegacyAndSignatureReferences(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, failed, documents := recoveryFailureFixture(t, h)
	row, _ := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	var snapshot issuance.Snapshot
	_ = json.Unmarshal(row.Snapshot, &snapshot)
	if _, err := h.pool.Exec(ctx, "INSERT INTO certificate_upload_audit (certificate_id,file_key,file_name,uploaded_by,competent_person_id,uploaded_at) VALUES ($1,$2,'protected-legacy.pdf',$3,$4,NOW())", cert, row.FileKey, actor.String(), snapshot.Signer.SignerID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Abandon(ctx, actor, cert, failed.ID); !errors.Is(err, issuance.ErrIssuanceCompleted) {
		t.Fatal(err)
	}
	if documents.deletes != 0 {
		t.Fatal("referenced legacy document deleted")
	}
	if _, err := h.pool.Exec(ctx, "DELETE FROM certificate_upload_audit WHERE file_key=$1", row.FileKey); err != nil {
		t.Fatal(err)
	}
	// Restore a failed approval's key as a retained historical Signature Version.
	var signatureID uuid.UUID
	if err := h.pool.QueryRow(ctx, `INSERT INTO certificate_signature_versions
 (owner_kind,owner_id,file_key,sha256,width,height,byte_size,created_by_user_id,storage_state)
 SELECT owner_kind,owner_id,$1,sha256,width,height,byte_size,created_by_user_id,storage_state FROM certificate_signature_versions WHERE signature_id=$2 RETURNING signature_id`, row.FileKey, row.SignatureID).Scan(&signatureID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Abandon(ctx, actor, cert, failed.ID); !errors.Is(err, issuance.ErrIssuanceCompleted) {
		t.Fatal(err)
	}
	if documents.deletes != 0 {
		t.Fatal("historical signature deleted")
	}
}

func externalInput(person uuid.UUID) issuance.ExternalInput {
	return issuance.ExternalInput{ApprovalID: uuid.New(), PersonID: person, IssueDate: "2026-10-04", ExpiryDate: "2027-10-04", FileName: "external.pdf", ContentType: "application/pdf", Data: []byte("%PDF-1.4 original external examination\n")}
}

func TestGeneratedRenewalExternalFailuresReplayAndImmutableBytes(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, preview, documents := generatedIssuanceFixture(t, h)
	renderer := &issuanceRecordingRenderer{failure: errors.New("external documents must never render")}
	service.Previews.Renderer = renderer
	input := externalInput(*preview.SignerID)
	original, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	before, _ := json.Marshal(original)
	documents.failPut = true
	failed, err := service.ApproveExternal(ctx, actor, cert, input)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || failed.State != "FAILED" || failed.Number != "" {
		t.Fatal(failed, err)
	}
	assertCertificateUnchanged(t, h, cert, before)
	documents.failPut = false
	documents.uncertainPut = true
	uncertain, err := service.ApproveExternal(ctx, actor, cert, input)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || uncertain.ID != failed.ID {
		t.Fatal(uncertain, err)
	}
	assertCertificateUnchanged(t, h, cert, before)
	puts := documents.puts
	row, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	if err != nil {
		t.Fatal(err)
	}
	documents.objects[row.FileKey] = []byte("corrupted stored external document")
	documents.uncertainPut = false
	corrupt, err := service.ApproveExternal(ctx, actor, cert, input)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || corrupt.FailureCode != "DOCUMENT_INTEGRITY" {
		t.Fatal(corrupt, err)
	}
	assertCertificateUnchanged(t, h, cert, before)
	documents.objects[row.FileKey] = bytes.Clone(input.Data)
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET full_name='Future name',organization='Future organization' WHERE competent_person_id=$1", input.PersonID); err != nil {
		t.Fatal(err)
	}
	completed, err := service.ApproveExternal(ctx, actor, cert, input)
	if err != nil || completed.State != "COMPLETED" || completed.ID != failed.ID || documents.puts != puts || renderer.calls != 0 {
		t.Fatal(completed, err)
	}
	var snapshot map[string]any
	if err := json.Unmarshal(completed.Snapshot, &snapshot); err != nil {
		t.Fatal(err)
	}
	signer := snapshot["signer"].(map[string]any)
	if signer["full_name"] != "Issued Examiner" || signer["signature"] != nil {
		t.Fatal("external snapshot was reconstructed or a signature was imposed", signer)
	}
	digest := sha256.Sum256(input.Data)
	if completed.SHA256 != hex.EncodeToString(digest[:]) || completed.Size != int64(len(input.Data)) {
		t.Fatal("external bytes changed")
	}
	for _, change := range []string{"bytes", "filename", "mime", "dates", "person", "actor", "certificate"} {
		altered := input
		alteredActor, alteredCert := actor, cert
		switch change {
		case "bytes":
			altered.Data = []byte("different bytes")
		case "filename":
			altered.FileName = "different.pdf"
		case "mime":
			altered.ContentType = "image/png"
		case "dates":
			altered.ExpiryDate = "2028-10-04"
		case "person":
			altered.PersonID = uuid.New()
		case "actor":
			alteredActor = uuid.New()
		case "certificate":
			alteredCert = uuid.MustParse(stringField(t, createCertificate(t, h, certificatePayload(original.ComponentID.String(), original.TestID.String(), 166)), "certificate_id"))
		}
		_, err := service.ApproveExternal(ctx, alteredActor, alteredCert, altered)
		if change == "actor" {
			if !errors.Is(err, issuance.ErrIssuerForbidden) {
				t.Fatal(change, err)
			}
		} else if !errors.Is(err, issuance.ErrApprovalMismatch) {
			t.Fatal(change, err)
		}
	}
	duplicate, err := service.ApproveExternal(ctx, actor, cert, input)
	if err != nil || duplicate.ID != completed.ID || documents.puts != puts {
		t.Fatal("duplicate external approval changed history", err)
	}
	var audits, counters int64
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_upload_audit WHERE issuance_id=$1", completed.ID).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_number_counters").Scan(&counters); err != nil {
		t.Fatal(err)
	}
	if audits != 1 || counters != 0 {
		t.Fatal("external retry duplicated audit or allocated a PMS number", audits, counters)
	}
	for _, sql := range []string{"UPDATE certificate_issuances SET file_name='forged.pdf' WHERE issuance_id=$1", "UPDATE certificate_issuances SET content_type='image/png' WHERE issuance_id=$1"} {
		if _, err := h.pool.Exec(ctx, sql, completed.ID); err == nil {
			t.Fatal("approved file metadata changed", sql)
		}
	}
}

func TestGeneratedRenewalExternalPublicationRollbackAndFences(t *testing.T) {
	for _, fault := range []string{"audit", "completion", "newer certificate", "revoked issuer"} {
		t.Run(fault, func(t *testing.T) {
			h := setupIntegrationTest(t)
			ctx := context.Background()
			service, actor, cert, preview, documents := generatedIssuanceFixture(t, h)
			input := externalInput(*preview.SignerID)
			original, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
			before, _ := json.Marshal(original)
			table, event, body := "certificate_upload_audit", "INSERT", "RAISE EXCEPTION 'controlled audit failure';"
			if fault == "completion" {
				table, event, body = "certificate_issuances", "UPDATE", "IF NEW.state='COMPLETED' THEN RAISE EXCEPTION 'controlled completion failure'; END IF;"
			}
			if fault == "audit" || fault == "completion" {
				_, err := h.pool.Exec(ctx, "CREATE FUNCTION reject_external_publication() RETURNS TRIGGER AS $$ BEGIN "+body+" RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_external_publication BEFORE "+event+" ON "+table+" FOR EACH ROW EXECUTE FUNCTION reject_external_publication();")
				if err != nil {
					t.Fatal(err)
				}
				defer h.pool.Exec(context.Background(), "DROP TRIGGER IF EXISTS reject_external_publication ON "+table+"; DROP FUNCTION IF EXISTS reject_external_publication();")
			} else {
				documents.afterPut = func() {
					statement := "UPDATE users SET role='USER' WHERE user_id=$1"
					id := actor
					if fault == "newer certificate" {
						statement = "UPDATE certificates SET certificate_file='newer-document' WHERE certificate_id=$1"
						id = cert
					}
					if _, err := h.pool.Exec(ctx, statement, id); err != nil {
						t.Fatal(err)
					}
				}
			}
			failed, err := service.ApproveExternal(ctx, actor, cert, input)
			if !errors.Is(err, issuance.ErrIssuanceFailed) || failed.State != "FAILED" {
				t.Fatal(failed, err)
			}
			var audits int64
			if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_upload_audit WHERE issuance_id=$1", failed.ID).Scan(&audits); err != nil {
				t.Fatal(err)
			}
			if audits != 0 {
				t.Fatal("failed publication left a completed upload audit")
			}
			if fault == "newer certificate" {
				current, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
				if current.CertificateFile != "newer-document" {
					t.Fatal("newer document overwritten")
				}
				_, err = service.ApproveExternal(ctx, actor, cert, input)
				if !errors.Is(err, issuance.ErrIssuanceConflict) {
					t.Fatal("stale approval resumed", err)
				}
			} else {
				assertCertificateUnchanged(t, h, cert, before)
				if fault == "revoked issuer" {
					_, err = service.ApproveExternal(ctx, actor, cert, input)
					if !errors.Is(err, issuance.ErrIssuerForbidden) {
						t.Fatal("revoked issuer resumed", err)
					}
				} else {
					if _, err := h.pool.Exec(ctx, "DROP TRIGGER reject_external_publication ON "+table); err != nil {
						t.Fatal(err)
					}
					puts := documents.puts
					completed, err := service.ApproveExternal(ctx, actor, cert, input)
					if err != nil || completed.State != "COMPLETED" || completed.ID != failed.ID || documents.puts != puts {
						t.Fatal("retry failed to reuse original object", completed, err)
					}
				}
			}
		})
	}
}

func TestGeneratedRenewalExternalValidationAndNoExpiry(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, preview, documents := generatedIssuanceFixture(t, h)
	input := externalInput(*preview.SignerID)
	for _, invalid := range []string{"empty", "oversize", "mime", "filename", "approval", "person", "date", "equal expiry", "missing expiry", "before expiry"} {
		bad := input
		switch invalid {
		case "empty":
			bad.Data = nil
		case "oversize":
			bad.Data = bytes.Repeat([]byte{'x'}, issuance.MaxExternalBytes+1)
		case "mime":
			bad.ContentType = "text/plain"
		case "filename":
			bad.FileName = ""
		case "approval":
			bad.ApprovalID = uuid.Nil
		case "person":
			bad.PersonID = uuid.New()
		case "date":
			bad.IssueDate = "2026-02-30"
		case "equal expiry":
			bad.ExpiryDate = bad.IssueDate
		case "missing expiry":
			bad.ExpiryDate = ""
		case "before expiry":
			bad.ExpiryDate = "2026-01-01"
		}
		if _, err := service.ApproveExternal(ctx, actor, cert, bad); !errors.Is(err, issuance.ErrExternalInput) {
			t.Fatal(invalid, err)
		}
	}
	person, _ := db.New(h.pool).GetCompetentPersonByID(ctx, input.PersonID)
	for _, condition := range []string{"inactive person", "inactive category", "restricted category"} {
		sql := "UPDATE competent_persons SET active=false WHERE competent_person_id=$1"
		id := input.PersonID
		if condition == "inactive category" {
			sql = "UPDATE competency_categories SET active=false WHERE competency_category_id=$1"
			id = person.CompetencyCategoryID
		}
		if condition == "restricted category" {
			id = signingCategory(t, h, "DIFFERENT_EXTERNAL", true)
			sql = "INSERT INTO certificate_competency_categories(certificate_id,competency_category_id) VALUES ('" + cert.String() + "',$1)"
		}
		if _, err := h.pool.Exec(ctx, sql, id); err != nil {
			t.Fatal(err)
		}
		if _, err := service.ApproveExternal(ctx, actor, cert, input); !errors.Is(err, issuance.ErrExternalInput) {
			t.Fatal(condition, err)
		}
		if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET active=true WHERE competent_person_id=$1", input.PersonID); err != nil {
			t.Fatal(err)
		}
		if _, err := h.pool.Exec(ctx, "UPDATE competency_categories SET active=true WHERE competency_category_id=$1", person.CompetencyCategoryID); err != nil {
			t.Fatal(err)
		}
	}
	var approvals int64
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_issuances").Scan(&approvals); err != nil {
		t.Fatal(err)
	}
	if approvals != 0 || documents.puts != 0 {
		t.Fatal("invalid renewal created approval/object")
	}
	if _, err := h.pool.Exec(ctx, "DELETE FROM certificate_competency_categories WHERE certificate_id=$1", cert); err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE test_types SET requires_renewal=false,validity_duration=NULL WHERE test_id=$1", uuid.MustParse(previewTestID(t, h, cert))); err != nil {
		t.Fatal(err)
	}
	if _, err := service.ApproveExternal(ctx, actor, cert, input); !errors.Is(err, issuance.ErrExternalInput) {
		t.Fatal("expiry imposed on non-expiring test", err)
	}
	input.ExpiryDate = ""
	input.Data = append(input.Data, make([]byte, issuance.MaxExternalBytes-len(input.Data))...)
	completed, err := service.ApproveExternal(ctx, actor, cert, input)
	if err != nil || completed.State != "COMPLETED" || completed.ExpiryDate != "" || completed.Size != issuance.MaxExternalBytes {
		t.Fatal(completed, err)
	}
	current, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	if current.ExpiryDate != nil || current.Status != "VALID" {
		t.Fatal("non-expiring publication incomplete")
	}
}

func previewTestID(t *testing.T, h *integrationHarness, certificate uuid.UUID) string {
	t.Helper()
	row, err := db.New(h.pool).GetCertificateByID(context.Background(), certificate)
	if err != nil {
		t.Fatal(err)
	}
	return row.TestID.String()
}

func TestGeneratedRenewalExternalConcurrentDuplicateApproval(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, preview, documents := generatedIssuanceFixture(t, h)
	input := externalInput(*preview.SignerID)
	start := make(chan struct{})
	results := make(chan issuance.Issuance, 2)
	errorsOut := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			<-start
			result, err := service.ApproveExternal(ctx, actor, cert, input)
			results <- result
			errorsOut <- err
		}()
	}
	close(start)
	first, second := <-results, <-results
	if err := <-errorsOut; err != nil {
		t.Fatal(err)
	}
	if err := <-errorsOut; err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatal("duplicate allocated two approvals")
	}
	completed, err := service.ApproveExternal(ctx, actor, cert, input)
	if err != nil || completed.State != "COMPLETED" {
		t.Fatal(completed, err)
	}
	if documents.puts != 1 {
		t.Fatal("duplicate overwrote external bytes", documents.puts)
	}
	var count int64
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_upload_audit WHERE issuance_id=$1", completed.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("concurrent approval duplicated upload history", count)
	}
	// Different certificate locks must not allow one shared approval ID to publish twice.
	current, err := db.New(h.pool).GetCertificateByID(ctx, cert)
	if err != nil {
		t.Fatal(err)
	}
	other := uuid.MustParse(stringField(t, createCertificate(t, h, certificatePayload(current.ComponentID.String(), current.TestID.String(), 168)), "certificate_id"))
	input.ApprovalID = uuid.New()
	start = make(chan struct{})
	for _, id := range []uuid.UUID{cert, other} {
		go func(certificate uuid.UUID) {
			<-start
			result, err := service.ApproveExternal(ctx, actor, certificate, input)
			results <- result
			errorsOut <- err
		}(id)
	}
	close(start)
	<-results
	<-results
	err1, err2 := <-errorsOut, <-errorsOut
	if !((err1 == nil && errors.Is(err2, issuance.ErrApprovalMismatch)) || (err2 == nil && errors.Is(err1, issuance.ErrApprovalMismatch))) {
		t.Fatal("cross-certificate approval collision was not rejected", err1, err2)
	}
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_issuances WHERE approval_id=$1", input.ApprovalID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("one approval ID published twice")
	}
}

func TestGeneratedRenewalExternalHTTPFormatsRolesAndCombinedHistory(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)
	ctx := context.Background()
	component, testID := createComponentFixture(t, h, "Mixed Examination History")
	cert := stringField(t, createCertificate(t, h, certificatePayload(component, testID, 170)), "certificate_id")
	other := stringField(t, createCertificate(t, h, certificatePayload(component, testID, 171)), "certificate_id")
	person := signingPerson(t, h, "External Examiner", signingCategory(t, h, "EXTERNAL_HTTP", true), true)
	path := "/v1/certificate/" + cert
	adminToken := createIntegrationUserToken(t, h.pool, "External", "Admin", "external-admin@example.com", "external-admin-password", "ADMIN")
	input := externalInput(person)
	fields := map[string]string{"approval_id": input.ApprovalID.String(), "competent_person_id": person.String(), "issue_date": input.IssueDate, "expiry_date": input.ExpiryDate}
	for _, role := range []string{"USER", "CLIENT"} {
		token := createIntegrationUserToken(t, h.pool, "External", role, "external-"+role+"@example.com", "external-password", role)
		performMultipartRequest(t, h.router, token, path+"/external-renewal", "file", "external.pdf", input.Data, fields, 401)
		performJSONRequest(t, h.router, token, http.MethodGet, path+"/history", nil, map[string]int{"USER": 200, "CLIENT": 403}[role])
	}
	performMultipartRequest(t, h.router, "", path+"/external-renewal", "file", "external.pdf", input.Data, fields, 401)
	performJSONRequest(t, h.router, "", http.MethodGet, path+"/history", nil, 401)
	for _, extra := range []string{"document_number", "signature_id", "certificate_file"} {
		fields[extra] = "forged"
		performMultipartRequest(t, h.router, adminToken, path+"/external-renewal", "file", "external.pdf", input.Data, fields, 400)
		delete(fields, extra)
	}
	performMultipartRequest(t, h.router, adminToken, path+"/external-renewal", "file", "external.txt", []byte("text"), fields, 400)
	performMultipartRequest(t, h.router, adminToken, path+"/external-renewal", "file", "external.pdf", nil, fields, 400)
	performMultipartRequest(t, h.router, adminToken, path+"/external-renewal", "file", "external.pdf", bytes.Repeat([]byte{'x'}, issuance.MaxExternalBytes+1), fields, 413)
	// A real old upload has no approved snapshot. Keep it accessible without inventing one.
	legacy := []byte("%PDF-1.4 legacy original\n")
	original, err := db.New(h.pool).GetCertificateByID(ctx, uuid.MustParse(cert))
	if err != nil {
		t.Fatal(err)
	}
	before, _ := json.Marshal(original)
	if _, err := h.pool.Exec(ctx, `CREATE FUNCTION reject_legacy_upload() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'controlled legacy audit failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_legacy_upload BEFORE INSERT ON certificate_upload_audit FOR EACH ROW EXECUTE FUNCTION reject_legacy_upload();`); err != nil {
		t.Fatal(err)
	}
	defer h.pool.Exec(context.Background(), "DROP TRIGGER IF EXISTS reject_legacy_upload ON certificate_upload_audit; DROP FUNCTION IF EXISTS reject_legacy_upload();")
	performMultipartRequest(t, h.router, h.adminToken, path+"/file", "file", "legacy.pdf", legacy, map[string]string{"competent_person_id": person.String()}, 500)
	assertCertificateUnchanged(t, h, uuid.MustParse(cert), before)
	if _, err := h.pool.Exec(ctx, "DROP TRIGGER reject_legacy_upload ON certificate_upload_audit"); err != nil {
		t.Fatal(err)
	}
	performMultipartRequest(t, h.router, h.adminToken, path+"/file", "file", "legacy.pdf", legacy, map[string]string{"competent_person_id": person.String()}, 200)
	types := []struct {
		name, mime string
		data       []byte
	}{{"external.pdf", "application/pdf", input.Data}, {"external.png", "image/png", signingImage(t, false)}, {"external.jpg", "image/jpeg", signingImage(t, true)}, {"external.webp", "image/webp", []byte{'R', 'I', 'F', 'F', 12, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' ', 0, 0, 0, 0}}}
	for _, file := range types {
		fields["approval_id"] = uuid.NewString()
		token := adminToken
		if file.mime == "image/png" {
			token = h.adminToken
		}
		var completed issuance.Issuance
		if err := json.Unmarshal(performMultipartRequest(t, h.router, token, path+"/external-renewal", "file", file.name, file.data, fields, 200), &completed); err != nil {
			t.Fatal(err)
		}
		if completed.Source != "EXTERNAL" || completed.State != "COMPLETED" || completed.Number != "" || completed.ContentType != file.mime || completed.FileName != file.name {
			t.Fatal(completed)
		}
		var duplicate issuance.Issuance
		json.Unmarshal(performMultipartRequest(t, h.router, token, path+"/external-renewal", "file", file.name, file.data, fields, 200), &duplicate)
		if duplicate.ID != completed.ID {
			t.Fatal("HTTP duplicate changed identity")
		}
		performMultipartRequest(t, h.router, token, "/v1/certificate/"+other+"/external-renewal", "file", file.name, file.data, fields, 409)
		performJSONRequest(t, h.router, token, http.MethodGet, "/v1/certificate/"+other+"/history/"+completed.ID.String()+"/file", nil, 404)
		link := decodeObject(t, performJSONRequest(t, h.router, token, http.MethodGet, path+"/history/"+completed.ID.String()+"/file", nil, 200))
		response, err := http.Get(stringField(t, link, "url"))
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 || !bytes.Equal(data, file.data) || response.Header.Get("Content-Type") != file.mime {
			t.Fatal("uploaded bytes/type were rewritten", file.name, err)
		}
		row, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: uuid.MustParse(cert), IssuanceID: completed.ID})
		if err != nil {
			t.Fatal(err)
		}
		journal, err := os.ReadFile(os.Getenv("AMS_TEST_STORAGE_MANIFEST"))
		if err != nil || !strings.HasPrefix(row.FileKey, os.Getenv("AMS_TEST_STORAGE_PREFIX")) || !bytes.Contains(journal, []byte(row.FileKey+"\n")) {
			t.Fatal("external document escaped cleanup scope", err)
		}
	}
	// Generated and external publication share one history, but external renewals consume no PMS numbers.
	performMultipartRequest(t, h.router, h.adminToken, "/v1/competent-person/"+person.String()+"/signing-profile/signature", "file", "signature.png", signingImage(t, false), nil, 200)
	var preview issuance.PreviewResponse
	json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-preview", map[string]any{"signer_id": person, "issue_date": "2026-10-04"}, 200), &preview)
	var generated issuance.Issuance
	json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-issuance", map[string]any{"preview_token": preview.Token}, 200), &generated)
	if !strings.HasSuffix(generated.Number, "-01") {
		t.Fatal("external uploads consumed a generated sequence", generated.Number)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET full_name='Future examiner' WHERE competent_person_id=$1", person); err != nil {
		t.Fatal(err)
	}
	history := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/history?limit=20", nil, 200))
	rows := history["data"].([]any)
	if len(rows) != 6 {
		t.Fatal("history missing records or duplicates linked audits", len(rows))
	}
	sources := map[string]int{}
	for _, value := range rows {
		row := value.(map[string]any)
		source := stringField(t, row, "source")
		sources[source]++
		if source == "LEGACY" {
			if row["snapshot_available"] != false || row["issue_date"] != nil || row["expiry_date"] != nil || row["signer_name"] != "" {
				t.Fatal("legacy details were invented", row)
			}
			link := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/history/"+stringField(t, row, "history_id")+"/file", nil, 200))
			response, err := http.Get(stringField(t, link, "url"))
			if err != nil {
				t.Fatal(err)
			}
			data, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil || response.StatusCode != 200 || !bytes.Equal(data, legacy) {
				t.Fatal("legacy bytes lost", err)
			}
		} else if row["snapshot_available"] != true || row["signer_name"] != "External Examiner" {
			t.Fatal("snapshot reconstructed from current profile", row)
		}
		if row["file_key"] != nil {
			t.Fatal("history leaked private storage key")
		}
	}
	if sources["GENERATED"] != 1 || sources["EXTERNAL"] != 4 || sources["LEGACY"] != 1 {
		t.Fatal(sources)
	}
	first := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/history?page=1&limit=1", nil, 200))
	second := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/history?page=2&limit=1", nil, 200))
	if len(first["data"].([]any)) != 1 || len(second["data"].([]any)) != 1 || first["data"].([]any)[0].(map[string]any)["history_id"] == second["data"].([]any)[0].(map[string]any)["history_id"] {
		t.Fatal("history pagination repeated an item")
	}
}

type issuanceRecordingRenderer struct {
	before    func()
	failure   error
	snapshot  issuance.Snapshot
	number    string
	signature []byte
	calls     int
}

func (r *issuanceRecordingRenderer) Render(_ context.Context, snapshot issuance.Snapshot, number string, signature []byte) ([]byte, error) {
	r.calls++
	r.snapshot = snapshot
	r.number = number
	r.signature = bytes.Clone(signature)
	if r.before != nil {
		r.before()
	}
	data, _ := json.Marshal(snapshot)
	return append([]byte("%PDF-controlled-final "+number+"\n"), data...), r.failure
}
func generatedIssuanceFixture(t *testing.T, h *integrationHarness) (issuance.Issuances, uuid.UUID, uuid.UUID, issuance.PreviewInput, *issuanceMemoryDocuments) {
	t.Helper()
	ctx := context.Background()
	actor := signingActor(t, h)
	component, testID := createComponentFixture(t, h, "Issued Pressure Gauge")
	cert := uuid.MustParse(stringField(t, createCertificate(t, h, certificatePayload(component, testID, 101)), "certificate_id"))
	person := signingPerson(t, h, "Issued Examiner", signingCategory(t, h, "ISSUED", true), true)
	signatures := &signingMemoryStore{objects: map[string][]byte{}}
	manager := issuance.SignerManagement{Pool: h.pool, Store: signatures}
	if _, err := manager.ReplacePersonSignature(ctx, actor, person, bytes.NewReader(signingImage(t, false))); err != nil {
		t.Fatal(err)
	}
	previews := issuance.Previews{Management: manager, Secret: []byte(os.Getenv("SECRET_KEY")), Renderer: previewControlledRenderer{}}
	documents := &issuanceMemoryDocuments{objects: map[string][]byte{}}
	service := issuance.Issuances{Pool: h.pool, Previews: previews, Documents: documents}
	return service, actor, cert, issuance.PreviewInput{SignerID: &person, IssueDate: "2026-10-04", Remarks: "Reviewed examination", Measurements: "10 bar"}, documents
}
func assertCertificateUnchanged(t *testing.T, h *integrationHarness, id uuid.UUID, expected []byte) {
	t.Helper()
	row, err := db.New(h.pool).GetCertificateByID(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(row)
	if !bytes.Equal(data, expected) {
		t.Fatal("failed approval changed the current certificate")
	}
}
func TestGeneratedRenewalApprovedFailuresRetainNumberAndImmutableDocument(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	original, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	originalJSON, _ := json.Marshal(original)
	renderer := &issuanceRecordingRenderer{failure: errors.New("controlled render failure")}
	service.Previews.Renderer = renderer
	failed, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || failed.State != "FAILED" || !strings.HasSuffix(failed.Number, "-01") {
		t.Fatal(failed, err)
	}
	assertCertificateUnchanged(t, h, cert, originalJSON)
	renderer.failure = nil
	documents.failPut = true
	again, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || again.ID != failed.ID || again.Number != failed.Number {
		t.Fatal("retry allocated another identity/number", again, err)
	}
	assertCertificateUnchanged(t, h, cert, originalJSON)
	documents.failPut = false
	documents.uncertainPut = true
	uncertain, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || uncertain.ID != failed.ID {
		t.Fatal(uncertain, err)
	}
	assertCertificateUnchanged(t, h, cert, originalJSON)
	renders, puts := renderer.calls, documents.puts
	// A change after approval must not alter its as-reviewed content/signature.
	if _, err := h.pool.Exec(ctx, "UPDATE competent_persons SET full_name='Future signer' WHERE competent_person_id=$1", *input.SignerID); err != nil {
		t.Fatal(err)
	}
	documents.uncertainPut = false
	// Persisted approval identity survives review-token expiry; an unapproved expired token is rejected in a separate test.
	var expiredClaims issuance.PreviewClaims
	mac := hmac.New(sha256.New, service.Previews.Secret)
	mac.Write([]byte("AMS/generated-certificate-preview/v1"))
	key := mac.Sum(nil)
	if _, err := jwt.ParseWithClaims(preview.Token, &expiredClaims, func(*jwt.Token) (any, error) { return key, nil }); err != nil {
		t.Fatal(err)
	}
	expiredClaims.IssuedAt = jwt.NewNumericDate(time.Now().Add(-31 * time.Minute))
	expiredClaims.NotBefore = expiredClaims.IssuedAt
	expiredClaims.ExpiresAt = jwt.NewNumericDate(expiredClaims.IssuedAt.Time.Add(issuance.PreviewTTL))
	expiredToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims).SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	completed, err := service.Approve(ctx, actor, cert, expiredToken)
	if err != nil || completed.State != "COMPLETED" || completed.ID != failed.ID || completed.Number != failed.Number {
		t.Fatal(completed, err)
	}
	if renderer.calls != renders || documents.puts != puts {
		t.Fatal("retry regenerated/overwrote an existing PDF")
	}
	a, _ := json.Marshal(preview.Snapshot)
	b, _ := json.Marshal(renderer.snapshot)
	if !bytes.Equal(a, b) || renderer.number != completed.Number {
		t.Fatal("final render differed from reviewed snapshot beyond number")
	}
	row, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: completed.ID})
	if err != nil {
		t.Fatal(err)
	}
	saved, _ := documents.Read(ctx, row.FileKey)
	digest := sha256.Sum256(saved)
	if hex.EncodeToString(digest[:]) != completed.SHA256 || int64(len(saved)) != completed.Size {
		t.Fatal("document integrity metadata incorrect")
	}
	current, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	if current.CertificateFile != row.FileKey || current.IssueDate.Format("2006-01-02") != input.IssueDate {
		t.Fatal("publication incomplete")
	}
	duplicate, err := service.Approve(ctx, actor, cert, preview.Token)
	if err != nil || duplicate.ID != completed.ID || documents.puts != puts {
		t.Fatal("duplicate changed completed issuance", duplicate, err)
	}
	var count, sequence int64
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_issuances").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if err := h.pool.QueryRow(ctx, "SELECT last_sequence FROM certificate_number_counters").Scan(&sequence); err != nil {
		t.Fatal(err)
	}
	if count != 1 || sequence != 1 {
		t.Fatal("duplicate approval consumed a sequence", count, sequence)
	}
	for _, sql := range []string{"UPDATE certificate_issuances SET snapshot='{}' WHERE issuance_id=$1", "UPDATE certificate_issuances SET document_sha256=repeat('a',64) WHERE issuance_id=$1", "UPDATE certificate_issuances SET document_number='forged' WHERE issuance_id=$1", "UPDATE certificate_issuances SET state='FAILED' WHERE issuance_id=$1"} {
		if _, err := h.pool.Exec(ctx, sql, completed.ID); err == nil {
			t.Fatal("immutable completed content changed", sql)
		}
	}
}
func TestGeneratedRenewalApprovalPublicationRollbackAndStaleFence(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	original, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	originalJSON, _ := json.Marshal(original)
	renderer := &issuanceRecordingRenderer{}
	service.Previews.Renderer = renderer
	// Fail after the certificate UPDATE but before completion, forcing the whole publication transaction to roll back.
	_, err = h.pool.Exec(ctx, `CREATE FUNCTION reject_test_completion() RETURNS TRIGGER AS $$ BEGIN IF NEW.state='COMPLETED' THEN RAISE EXCEPTION 'controlled completion failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_test_completion BEFORE UPDATE ON certificate_issuances FOR EACH ROW EXECUTE FUNCTION reject_test_completion();`)
	if err != nil {
		t.Fatal(err)
	}
	defer h.pool.Exec(context.Background(), "DROP TRIGGER IF EXISTS reject_test_completion ON certificate_issuances; DROP FUNCTION IF EXISTS reject_test_completion();")
	failed, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || failed.State != "FAILED" {
		t.Fatal(failed, err)
	}
	assertCertificateUnchanged(t, h, cert, originalJSON)
	if _, err := h.pool.Exec(ctx, "DROP TRIGGER reject_test_completion ON certificate_issuances"); err != nil {
		t.Fatal(err)
	}
	documents.failRead = true
	if _, err := service.Approve(ctx, actor, cert, preview.Token); !errors.Is(err, issuance.ErrIssuanceFailed) {
		t.Fatal("read failure was ignored", err)
	}
	documents.failRead = false
	// A newer legacy update increments the publication fence too.
	if _, err := h.pool.Exec(ctx, "UPDATE certificates SET certificate_file='newer-document',updated_at=NOW() WHERE certificate_id=$1", cert); err != nil {
		t.Fatal(err)
	}
	fenced, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceConflict) || fenced.ID != failed.ID {
		t.Fatal("old approved work overwrote a newer document", fenced, err)
	}
	current, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	if current.CertificateFile != "newer-document" {
		t.Fatal("publication fence failed")
	}
	newer, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	issued, err := service.Approve(ctx, actor, cert, newer.Token)
	if err != nil || !strings.HasSuffix(issued.Number, "-02") {
		t.Fatal("failed approval number was reused", issued, err)
	}
	var historyCount int64
	h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_issuances WHERE certificate_id=$1", cert).Scan(&historyCount)
	if historyCount != 2 {
		t.Fatal("failed approval audit disappeared")
	}
}
func TestGeneratedRenewalConcurrentDuplicateAndComponentDateAllocation(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	started, release := make(chan struct{}), make(chan struct{})
	renderer := &issuanceRecordingRenderer{before: func() { close(started); <-release }}
	service.Previews.Renderer = renderer
	type outcome struct {
		result issuance.Issuance
		err    error
	}
	first := make(chan outcome, 1)
	go func() { result, err := service.Approve(ctx, actor, cert, preview.Token); first <- outcome{result, err} }()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("approval did not reach rendering")
	}
	duplicate, err := service.Approve(ctx, actor, cert, preview.Token)
	if err != nil || duplicate.State != "PROCESSING" || !strings.HasSuffix(duplicate.Number, "-01") {
		close(release)
		t.Fatal(duplicate, err)
	}
	close(release)
	done := <-first
	if done.err != nil || done.result.ID != duplicate.ID || done.result.State != "COMPLETED" || documents.puts != 1 {
		t.Fatal("concurrent duplicate processed twice", done)
	}
	// Different tests/certificates for one component share a date counter; a new date starts at 01.
	base, _ := db.New(h.pool).GetCertificateByID(ctx, cert)
	service.Previews.Renderer = previewControlledRenderer{}
	previews := make([]issuance.PreviewResponse, 4)
	ids := make([]uuid.UUID, 4)
	for i := range ids {
		ids[i] = uuid.MustParse(stringField(t, createCertificate(t, h, certificatePayload(base.ComponentID.String(), base.TestID.String(), 110+i)), "certificate_id"))
		previews[i], err = service.Previews.Prepare(ctx, actor, ids[i], input)
		if err != nil {
			t.Fatal(err)
		}
	}
	outcomes := make(chan outcome, 4)
	for i := range ids {
		go func(i int) {
			result, err := service.Approve(ctx, actor, ids[i], previews[i].Token)
			outcomes <- outcome{result, err}
		}(i)
	}
	numbers := map[string]bool{}
	for range ids {
		got := <-outcomes
		if got.err != nil || got.result.State != "COMPLETED" || numbers[got.result.Number] {
			t.Fatal("nonunique concurrent number", got)
		}
		numbers[got.result.Number] = true
	}
	for i := 2; i <= 5; i++ {
		number := issuance.DocumentNumber(preview.Snapshot, fmt.Sprintf("%02d", i))
		if !numbers[number] {
			t.Fatal("counter gap or duplicate", numbers)
		}
	}
	input.IssueDate = "2026-10-05"
	nextDay, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	next, err := service.Approve(ctx, actor, cert, nextDay.Token)
	if err != nil || !strings.HasSuffix(next.Number, "-01") {
		t.Fatal("date counter was global", next, err)
	}
}
func TestGeneratedRenewalApprovalRejectsStaleAndExpiredBeforeAllocation(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, _ := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	old, err := issuance.SignPreview(service.Previews.Secret, actor, preview.Snapshot, time.Now().Add(-31*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Approve(ctx, actor, cert, old); !errors.Is(err, issuance.ErrPreviewExpired) {
		t.Fatal("expired unapproved preview accepted", err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE components SET name=name||' changed' WHERE component_id=$1", preview.Snapshot.ComponentID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Approve(ctx, actor, cert, preview.Token); !errors.Is(err, issuance.ErrPreviewChanged) {
		t.Fatal("stale approval accepted", err)
	}
	var approvals, counters int64
	h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_issuances").Scan(&approvals)
	h.pool.QueryRow(ctx, "SELECT count(*) FROM certificate_number_counters").Scan(&counters)
	if approvals != 0 || counters != 0 {
		t.Fatal("invalid previews consumed numbers")
	}
}
func TestGeneratedRenewalApprovalHTTPStoredHistoryAndRoleBoundaries(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)
	ctx := context.Background()
	component, testID := createComponentFixture(t, h, "Final Pressure Gauge")
	cert := stringField(t, createCertificate(t, h, certificatePayload(component, testID, 120)), "certificate_id")
	other := stringField(t, createCertificate(t, h, certificatePayload(component, testID, 121)), "certificate_id")
	category := signingCategory(t, h, "FINAL_HTTP", true)
	person := signingPerson(t, h, "Final Examiner", category, true)
	performMultipartRequest(t, h.router, h.adminToken, "/v1/competent-person/"+person.String()+"/signing-profile/signature", "file", "signature.jpg", signingImage(t, true), nil, 200)
	path := "/v1/certificate/" + cert
	var preview issuance.PreviewResponse
	json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-preview", map[string]any{"signer_id": person, "issue_date": "2026-10-04", "remarks": "Final examination — Ω"}, 200), &preview)
	input := map[string]any{"preview_token": preview.Token}
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/certificate/"+other+"/generated-issuance", input, 400)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-issuance", map[string]any{"preview_token": preview.Token, "document_number": "FORGED"}, 400)
	for _, role := range []string{"USER", "CLIENT", "ADMIN", "SUPER_ADMIN"} {
		token := createIntegrationUserToken(t, h.pool, "Issue", role, "issue-"+role+"@example.com", "issue-password", role)
		status := 403
		if role == "ADMIN" || role == "SUPER_ADMIN" {
			status = 400
		}
		performJSONRequest(t, h.router, token, http.MethodPost, path+"/generated-issuance", input, status)
		if role == "CLIENT" {
			performJSONRequest(t, h.router, token, http.MethodGet, path+"/issuances", nil, 403)
		}
	}
	var issued issuance.Issuance
	json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-issuance", input, 200), &issued)
	if issued.State != "COMPLETED" || !strings.HasSuffix(issued.Number, "-01") || issued.Size <= 0 {
		t.Fatal(issued)
	}
	var duplicate issuance.Issuance
	json.Unmarshal(performJSONRequest(t, h.router, h.adminToken, http.MethodPost, path+"/generated-issuance", input, 200), &duplicate)
	if duplicate.ID != issued.ID || duplicate.Number != issued.Number {
		t.Fatal("HTTP duplicate allocated again")
	}
	statusBody := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/issuances/"+issued.ID.String(), nil, 200))
	assertField(t, statusBody, "state", "COMPLETED")
	assertField(t, statusBody, "document_number", issued.Number)
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+other+"/issuances/"+issued.ID.String(), nil, 404)
	history := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/issuances", nil, 200))
	if len(history["data"].([]any)) != 1 {
		t.Fatal("history incomplete")
	}
	link := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, path+"/issuances/"+issued.ID.String()+"/file", nil, 200))
	response, err := http.Get(stringField(t, link, "url"))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	document, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != 200 || !bytes.HasPrefix(document, []byte("%PDF-")) {
		t.Fatal("issued R2 document unavailable", err)
	}
	digest := sha256.Sum256(document)
	if hex.EncodeToString(digest[:]) != issued.SHA256 || int64(len(document)) != issued.Size {
		t.Fatal("stored historical document digest mismatch")
	}
	originalDocument := bytes.Clone(document)
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+other+"/issuances/"+issued.ID.String()+"/file", nil, 404)
	// Replace the profile image and change current source labels; history must return the old stored PDF.
	performMultipartRequest(t, h.router, h.adminToken, "/v1/competent-person/"+person.String()+"/signing-profile/signature", "file", "replacement.png", signingImage(t, false), nil, 200)
	if _, err := h.pool.Exec(ctx, "UPDATE components SET name='Future component name' WHERE component_id=$1", uuid.MustParse(component)); err != nil {
		t.Fatal(err)
	}
	row, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: uuid.MustParse(cert), IssuanceID: issued.ID})
	if err != nil {
		t.Fatal(err)
	}
	if err := (issuance.R2Documents{}).Put(ctx, row.FileKey, []byte("%PDF-forged overwrite")); err == nil {
		t.Fatal("R2 accepted overwrite of issued object")
	}
	retained, err := issuance.R2Documents{}.Read(ctx, row.FileKey)
	if err != nil || !bytes.Equal(originalDocument, retained) {
		t.Fatal("profile/source changes altered issued history", err)
	}
	current, _ := db.New(h.pool).GetCertificateByID(ctx, uuid.MustParse(cert))
	if current.CertificateFile != row.FileKey {
		t.Fatal("current document was not published")
	}
	journal, err := os.ReadFile(os.Getenv("AMS_TEST_STORAGE_MANIFEST"))
	if err != nil || !strings.HasPrefix(row.FileKey, os.Getenv("AMS_TEST_STORAGE_PREFIX")) || !bytes.Contains(journal, []byte(row.FileKey+"\n")) {
		t.Fatal("issued PDF escaped cleanup journal")
	}
	if directory := os.Getenv("AMS_CERTIFICATE_PREVIEW_EVIDENCE_DIR"); directory != "" {
		if err := os.MkdirAll(directory, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, "approved-examination-preview.pdf"), preview.PDF, 0600); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, "issued-examination.pdf"), document, 0600); err != nil {
			t.Fatal(err)
		}
	}
	// Ordinary ADMIN issuance is bound to its own account; non-expiring publication stores NULL expiry.
	ownToken := createIntegrationUserToken(t, h.pool, "Own", "Issuer", "own-issuer@example.com", "issue-password", "ADMIN")
	own := mustGetIntegrationUserByEmail(t, h.pool, "own-issuer@example.com")
	management := issuance.SignerManagement{Pool: h.pool, Store: issuance.R2Signatures{}}
	if _, err := management.AssignCategory(ctx, signingActor(t, h), own.UserID, &category); err != nil {
		t.Fatal(err)
	}
	performMultipartRequest(t, h.router, ownToken, "/v1/account/signing-profile/signature", "file", "own.png", signingImage(t, false), nil, 200)
	if _, err := h.pool.Exec(ctx, "UPDATE test_types SET requires_renewal=FALSE,validity_duration=NULL WHERE test_id=$1", uuid.MustParse(testID)); err != nil {
		t.Fatal(err)
	}
	var ownPreview issuance.PreviewResponse
	json.Unmarshal(performJSONRequest(t, h.router, ownToken, http.MethodPost, "/v1/certificate/"+other+"/generated-preview", map[string]any{"issue_date": "2026-10-04"}, 200), &ownPreview)
	ownIssued := decodeObject(t, performJSONRequest(t, h.router, ownToken, http.MethodPost, "/v1/certificate/"+other+"/generated-issuance", map[string]any{"preview_token": ownPreview.Token}, 200))
	assertField(t, ownIssued, "expiry_date", "")
	assertField(t, ownIssued["snapshot"].(map[string]any)["signer"].(map[string]any), "signer_id", own.UserID.String())
	nonExpiring, _ := db.New(h.pool).GetCertificateByID(ctx, uuid.MustParse(other))
	if nonExpiring.ExpiryDate != nil {
		t.Fatal("non-expiring issuance retained old expiry")
	}
}

func TestGeneratedRenewalPublicationFencesChangesDuringRendering(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, _ := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	renderer := &issuanceRecordingRenderer{before: func() {
		if _, err := h.pool.Exec(ctx, "UPDATE certificates SET certificate_file='newer-during-render',updated_at=NOW() WHERE certificate_id=$1", cert); err != nil {
			t.Fatal(err)
		}
	}}
	service.Previews.Renderer = renderer
	failed, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceConflict) || failed.State != "FAILED" {
		t.Fatal("in-flight old render published", failed, err)
	}
	current, err := db.New(h.pool).GetCertificateByID(ctx, cert)
	if err != nil {
		t.Fatal(err)
	}
	if current.CertificateFile != "newer-during-render" {
		t.Fatal("old render overwrote current file")
	}
	stored, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	if err != nil {
		t.Fatal(err)
	}
	if stored.DocumentSize <= 0 || stored.DocumentSha256 == "" {
		t.Fatal("failed rendered approval lost stored document metadata")
	}
}
func TestGeneratedRenewalStoredIntegrityAndProcessingLease(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, input, documents := generatedIssuanceFixture(t, h)
	preview, err := service.Previews.Prepare(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	renderer := &issuanceRecordingRenderer{}
	service.Previews.Renderer = renderer
	documents.uncertainPut = true
	failed, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) {
		t.Fatal(err)
	}
	row, err := db.New(h.pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: cert, IssuanceID: failed.ID})
	if err != nil {
		t.Fatal(err)
	}
	original, _ := documents.Read(ctx, row.FileKey)
	documents.objects[row.FileKey] = []byte("%PDF-corrupt stored object")
	documents.uncertainPut = false
	renders, puts := renderer.calls, documents.puts
	corrupt, err := service.Approve(ctx, actor, cert, preview.Token)
	if !errors.Is(err, issuance.ErrIssuanceFailed) || corrupt.FailureCode != "DOCUMENT_INTEGRITY" || renderer.calls != renders || documents.puts != puts {
		t.Fatal("corrupt object was overwritten/published", corrupt, err)
	}
	documents.objects[row.FileKey] = original
	if _, err := h.pool.Exec(ctx, "UPDATE certificate_issuances SET state='PROCESSING',attempt_id=$2,lease_until=NOW()+INTERVAL '5 minutes' WHERE issuance_id=$1", row.IssuanceID, uuid.New()); err != nil {
		t.Fatal(err)
	}
	processing, err := service.Approve(ctx, actor, cert, preview.Token)
	if err != nil || processing.State != "PROCESSING" || documents.puts != puts {
		t.Fatal("active processor lease was stolen", processing, err)
	}
	if _, err := h.pool.Exec(ctx, "UPDATE certificate_issuances SET lease_until=NOW()-INTERVAL '1 second' WHERE issuance_id=$1", row.IssuanceID); err != nil {
		t.Fatal(err)
	}
	completed, err := service.Approve(ctx, actor, cert, preview.Token)
	if err != nil || completed.State != "COMPLETED" || completed.ID != row.IssuanceID || renderer.calls != renders || documents.puts != puts {
		t.Fatal("expired lease did not reuse stored PDF", completed, err)
	}
}

func TestGeneratedRenewalActorPermissionChangesDuringRendering(t *testing.T) {
	for _, role := range []string{"USER", "ADMIN"} {
		t.Run(role, func(t *testing.T) {
			h := setupIntegrationTest(t)
			ctx := context.Background()
			service, actor, cert, input, _ := generatedIssuanceFixture(t, h)
			preview, err := service.Previews.Prepare(ctx, actor, cert, input)
			if err != nil {
				t.Fatal(err)
			}
			original, err := db.New(h.pool).GetCertificateByID(ctx, cert)
			if err != nil {
				t.Fatal(err)
			}
			before, _ := json.Marshal(original)
			renderer := &issuanceRecordingRenderer{before: func() {
				if _, err := h.pool.Exec(ctx, "UPDATE users SET role=$2 WHERE user_id=$1", actor, role); err != nil {
					t.Fatal(err)
				}
			}}
			service.Previews.Renderer = renderer
			failed, err := service.Approve(ctx, actor, cert, preview.Token)
			if !errors.Is(err, issuance.ErrIssuanceFailed) || failed.State != "FAILED" {
				t.Fatal("revoked issuer published", failed, err)
			}
			assertCertificateUnchanged(t, h, cert, before)
			if _, err := service.Approve(ctx, actor, cert, preview.Token); !errors.Is(err, issuance.ErrIssuerForbidden) {
				t.Fatal("revoked issuer resumed approval", err)
			}
		})
	}
}
