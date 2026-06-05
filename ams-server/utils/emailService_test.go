package utils

import "testing"

func TestCertificateExpiryIdempotencyKeys(t *testing.T) {
	tests := []struct {
		name     string
		channel  string
		expected string
	}{
		{
			name:     "email",
			channel:  "EMAIL",
			expected: "cert-expiry:232e05d7-9ec5-4ef7-ab3e-f48ad1446c72:2026-06-03:7d:EMAIL",
		},
		{
			name:     "clickup",
			channel:  "CLICKUP",
			expected: "cert-expiry:232e05d7-9ec5-4ef7-ab3e-f48ad1446c72:2026-06-03:7d:CLICKUP",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key := buildIdempotencyKey(
				"232e05d7-9ec5-4ef7-ab3e-f48ad1446c72",
				"2026-06-03",
				"7d",
				tt.channel,
			)
			if key != tt.expected {
				t.Fatalf("expected idempotency key %q, got %q", tt.expected, key)
			}
		})
	}
}
