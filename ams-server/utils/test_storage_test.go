package utils

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
)

func scopedTestStorage(t *testing.T) (string, string) {
	t.Helper()
	prefix := "ams-e2e/" + uuid.NewString() + "/"
	manifest := filepath.Join(t.TempDir(), "objects.txt")
	t.Setenv("APP_ENV", "test")
	t.Setenv("DATABASE_URL", "postgres://localhost/ams_e2e_storage")
	t.Setenv("AMS_TEST_STORAGE_PREFIX", prefix)
	t.Setenv("AMS_TEST_STORAGE_MANIFEST", manifest)
	return prefix, manifest
}

func TestTestStorageScopeRejectsUnsafeConfiguration(t *testing.T) {
	cases := []struct{ name, variable, value string }{
		{"production environment", "APP_ENV", "production"},
		{"normal database", "DATABASE_URL", "postgres://localhost/ams"},
		{"missing database", "DATABASE_URL", ""},
		{"query database override", "DATABASE_URL", "postgres://localhost/ams_e2e_storage?dbname=ams"},
		{"alternate database override", "DATABASE_URL", "postgres://localhost/ams_e2e_storage?database=ams"},
		{"prefix traversal", "AMS_TEST_STORAGE_PREFIX", "ams-e2e/../"},
		{"broad prefix", "AMS_TEST_STORAGE_PREFIX", "certificate-files/"},
		{"missing manifest", "AMS_TEST_STORAGE_MANIFEST", ""},
		{"relative manifest", "AMS_TEST_STORAGE_MANIFEST", "objects.txt"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			scopedTestStorage(t)
			t.Setenv(tc.variable, tc.value)
			if _, _, err := testStorageScope(); err == nil {
				t.Fatal("expected unsafe scope to be rejected")
			}
		})
	}
}

func TestTestStorageDisabledLeavesNormalObjectKeyUntouched(t *testing.T) {
	t.Setenv("AMS_TEST_STORAGE_PREFIX", "")
	t.Setenv("AMS_TEST_STORAGE_MANIFEST", "")
	key := "certificate-files/document.pdf"
	actual, err := journalTestStorageObject(key)
	if err != nil || actual != key {
		t.Fatalf("normal upload changed: key=%q err=%v", actual, err)
	}
}

func TestTestStorageCleanupValidatesWholeManifestBeforeDeletion(t *testing.T) {
	prefix, manifest := scopedTestStorage(t)
	for _, unsafe := range []string{"unrelated/document.pdf", prefix + "../document.pdf", prefix} {
		if err := os.WriteFile(manifest, []byte(prefix+"owned.pdf\n"+unsafe+"\n"), 0600); err != nil {
			t.Fatal(err)
		}
		if count, err := CleanupTestStorageObjects(context.Background()); err == nil || count != 0 {
			t.Fatalf("expected rejection before any deletion: count=%d err=%v", count, err)
		}
	}
}

func TestTestStorageUploadIntentSurvivesFailureAndCleanupIsRepeatable(t *testing.T) {
	prefix, manifest := scopedTestStorage(t)
	var deleted []string
	var deletionLock sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimPrefix(r.URL.Path, "/bucket/")
		switch r.Method {
		case http.MethodPut:
			entries, err := os.ReadFile(manifest)
			if err != nil || !strings.Contains(string(entries), key+"\n") {
				t.Error("upload was not journaled before the storage request")
			}
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`<Error><Code>InvalidRequest</Code></Error>`))
		case http.MethodDelete:
			deletionLock.Lock()
			deleted = append(deleted, key)
			deletionLock.Unlock()
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Errorf("unexpected storage operation: %s", r.Method)
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer server.Close()
	t.Setenv("R2_S3_ENDPOINT", server.URL)
	t.Setenv("R2_S3_REGION", "auto")
	t.Setenv("R2_S3_BUCKET", "bucket")
	t.Setenv("R2_S3_ACCESS_KEY_ID", "test")
	t.Setenv("R2_S3_SECRET_ACCESS_KEY", "test")
	// multipart.File requires ReaderAt and Seek as well as Read and Close.
	file, err := os.CreateTemp(t.TempDir(), "upload")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if _, err := file.Write([]byte("%PDF-test")); err != nil {
		t.Fatal(err)
	}
	if _, err := file.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	header := &multipart.FileHeader{Size: 9, Header: textproto.MIMEHeader{"Content-Type": {"application/pdf"}}}
	if _, err := UploadFile(context.Background(), file, header); err == nil {
		t.Fatal("expected failed upload")
	}
	entries, err := os.ReadFile(manifest)
	if err != nil {
		t.Fatal(err)
	}
	key := strings.TrimSpace(string(entries))
	if !strings.HasPrefix(key, prefix) {
		t.Fatalf("unscoped upload: %q", key)
	}
	// Duplicate journal lines and repeat cleanup must not expand its scope.
	if err := os.WriteFile(manifest, bytes.Repeat(entries, 2), 0600); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		count, err := CleanupTestStorageObjects(context.Background())
		if err != nil || count != 1 {
			t.Fatalf("cleanup: count=%d err=%v", count, err)
		}
	}
	deletionLock.Lock()
	defer deletionLock.Unlock()
	if len(deleted) != 2 || deleted[0] != key || deleted[1] != key {
		t.Fatalf("unexpected deletion keys: %v", deleted)
	}
}

func TestTestStorageCleanupReportsPartialFailureAndRetainsJournal(t *testing.T) {
	prefix, manifest := scopedTestStorage(t)
	entries := []byte(prefix + "failed.pdf\n" + prefix + "succeeded.pdf\n")
	if err := os.WriteFile(manifest, entries, 0600); err != nil {
		t.Fatal(err)
	}
	var lock sync.Mutex
	failDeletion := true
	var requested []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lock.Lock()
		defer lock.Unlock()
		if r.Method != http.MethodDelete {
			t.Errorf("unexpected %s", r.Method)
		}
		requested = append(requested, r.URL.Path)
		if failDeletion && strings.HasSuffix(r.URL.Path, "failed.pdf") {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`<Error><Code>AccessDenied</Code></Error>`))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	t.Setenv("R2_S3_ENDPOINT", server.URL)
	t.Setenv("R2_S3_REGION", "auto")
	t.Setenv("R2_S3_BUCKET", "bucket")
	t.Setenv("R2_S3_ACCESS_KEY_ID", "test")
	t.Setenv("R2_S3_SECRET_ACCESS_KEY", "test")
	count, err := CleanupTestStorageObjects(context.Background())
	if count != 1 || err == nil {
		t.Fatalf("partial cleanup: count=%d err=%v", count, err)
	}
	remaining, err := os.ReadFile(manifest)
	if err != nil || !bytes.Equal(remaining, entries) {
		t.Fatal("partial cleanup lost its retry journal")
	}
	lock.Lock()
	failDeletion = false
	lock.Unlock()
	count, err = CleanupTestStorageObjects(context.Background())
	if count != 2 || err != nil {
		t.Fatalf("retry cleanup: count=%d err=%v", count, err)
	}
	lock.Lock()
	defer lock.Unlock()
	if len(requested) != 4 {
		t.Fatalf("expected both keys on both cleanup attempts, got %v", requested)
	}
}
