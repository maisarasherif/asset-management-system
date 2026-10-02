package main_test

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
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
