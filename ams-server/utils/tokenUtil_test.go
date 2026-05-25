package utils

import (
	"testing"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"
)

func TestGenerateAccessTokenUsesSixHourTTL(t *testing.T) {
	t.Setenv("SECRET_KEY", "test-access-secret")

	token, expiresAt, err := GenerateAccessToken("user@example.com", "Test", "User", "USER", "user-id")
	if err != nil {
		t.Fatalf("GenerateAccessToken returned error: %v", err)
	}
	if expiresAt.IsZero() {
		t.Fatal("expected generated token expiry")
	}

	claims := &SignedDetails{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
		return getSecretKey(), nil
	})
	if err != nil {
		t.Fatalf("failed to parse generated token: %v", err)
	}
	if !parsed.Valid {
		t.Fatal("expected generated token to be valid")
	}
	if claims.IssuedAt == nil || claims.ExpiresAt == nil {
		t.Fatal("expected generated token to include issued-at and expiry claims")
	}

	if ttl := claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time); ttl != 6*time.Hour {
		t.Fatalf("expected access token TTL to be 6h, got %s", ttl)
	}
	if !claims.ExpiresAt.Time.Equal(expiresAt.Truncate(time.Second)) {
		t.Fatalf("expected returned expiry to match token expiry, got %s and %s", expiresAt, claims.ExpiresAt.Time)
	}
}
