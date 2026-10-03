package main_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

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
