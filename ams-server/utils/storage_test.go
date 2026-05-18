package utils

import (
	"regexp"
	"strings"
	"testing"
)

func TestCertificateObjectKeyIsOpaque(t *testing.T) {
	key := certificateObjectKey("application/pdf")

	keyPattern := regexp.MustCompile(`^certificate-files/\d{4}/\d{2}/\d{2}/cert_[0-9a-f]{32}\.pdf$`)
	if !keyPattern.MatchString(key) {
		t.Fatalf("expected opaque certificate object key, got %q", key)
	}

	for _, leakedValue := range []string{
		"232e05d7-9ec5-4ef7-ab3e-f48ad1446c72",
		"asset-048",
		"certification-tracker",
	} {
		if strings.Contains(key, leakedValue) {
			t.Fatalf("object key %q leaked value %q", key, leakedValue)
		}
	}
}

func TestSignedURLFileNameFallsBackToGenericName(t *testing.T) {
	fileName := SignedURLFileName("", "certificate-files/2026/05/18/cert_0123456789abcdef0123456789abcdef.pdf")
	if fileName != "certificate-file.pdf" {
		t.Fatalf("expected generic PDF filename, got %q", fileName)
	}
}
