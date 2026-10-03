package utils

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestPreparedSignatureUploadIsJournaledBeforeStorageAndRejectsUnscopedKeys(t *testing.T) {
	prefix, manifest := scopedTestStorage(t)
	var puts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		puts.Add(1)
		key := strings.TrimPrefix(r.URL.Path, "/bucket/")
		entries, err := os.ReadFile(manifest)
		if err != nil || !bytes.Contains(entries, []byte(key+"\n")) {
			t.Error("signature was not journaled before PUT")
		}
		data, err := io.ReadAll(r.Body)
		if err != nil || string(data) != "normalized-signature" || r.Header.Get("Content-Type") != "image/png" {
			t.Error("signature upload bytes or content type changed")
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`<Error><Code>InvalidRequest</Code></Error>`))
	}))
	defer server.Close()
	setSignatureStorageEndpoint(t, server.URL)
	key, err := PrepareObjectKey("signature-files/account/owner/version.png")
	if err != nil || !strings.HasPrefix(key, prefix) {
		t.Fatalf("prepare: %q, %v", key, err)
	}
	if err := UploadPreparedBytes(context.Background(), key, "image/png", []byte("normalized-signature")); err == nil {
		t.Fatal("storage failure was ignored")
	}
	if puts.Load() != 1 {
		t.Fatalf("expected one storage request, got %d", puts.Load())
	}
	for _, unsafe := range []string{"signature-files/unscoped.png", prefix, prefix + "../unrelated.png"} {
		if err := UploadPreparedBytes(context.Background(), unsafe, "image/png", nil); err == nil {
			t.Fatalf("accepted unsafe key %q", unsafe)
		}
	}
	if puts.Load() != 1 {
		t.Fatal("unsafe signature key reached storage")
	}
	entries, err := os.ReadFile(manifest)
	if err != nil || !bytes.Contains(entries, []byte(key+"\n")) {
		t.Fatal("failed signature upload lost its cleanup journal")
	}
}

func TestStoredSignatureReadsAreBounded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/bucket/signature.png" {
			t.Errorf("unexpected read %s %s", r.Method, r.URL.Path)
		}
		_, _ = w.Write([]byte("normalized-signature"))
	}))
	defer server.Close()
	setSignatureStorageEndpoint(t, server.URL)
	data, err := ReadStorageObject(context.Background(), "signature.png", 20)
	if err != nil || string(data) != "normalized-signature" {
		t.Fatalf("bounded read: %q, %v", data, err)
	}
	for _, limit := range []int64{0, -1, 19} {
		if _, err := ReadStorageObject(context.Background(), "signature.png", limit); err == nil {
			t.Fatalf("read limit %d was ignored", limit)
		}
	}
}

func setSignatureStorageEndpoint(t *testing.T, endpoint string) {
	t.Helper()
	t.Setenv("R2_S3_ENDPOINT", endpoint)
	t.Setenv("R2_S3_REGION", "auto")
	t.Setenv("R2_S3_BUCKET", "bucket")
	t.Setenv("R2_S3_ACCESS_KEY_ID", "test")
	t.Setenv("R2_S3_SECRET_ACCESS_KEY", "test")
}
