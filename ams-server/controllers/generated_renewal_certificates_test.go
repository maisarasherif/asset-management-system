package controllers

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

func TestGeneratedRenewalFaultsRequireIsolatedScopeAndSecret(t *testing.T) {
	const secret = "isolated-test-token-at-least-32-bytes"
	for _, tc := range []struct{ name, env, database, prefix, manifest, token, mode, want string }{
		{"enabled", "test", "postgres://localhost/ams_e2e_fault", "valid", "valid", secret, "after-write", "after-write"},
		{"production", "production", "postgres://localhost/ams_e2e_fault", "valid", "valid", secret, "after-write", ""},
		{"shared database", "test", "postgres://localhost/ams", "valid", "valid", secret, "after-write", ""},
		{"missing scope", "test", "postgres://localhost/ams_e2e_fault", "", "", secret, "after-write", ""},
		{"bad prefix", "test", "postgres://localhost/ams_e2e_fault", "other/", "valid", secret, "after-write", ""},
		{"relative manifest", "test", "postgres://localhost/ams_e2e_fault", "valid", "relative.txt", secret, "after-write", ""},
		{"wrong secret", "test", "postgres://localhost/ams_e2e_fault", "valid", "valid", "wrong-token", "after-write", ""},
		{"unknown fault", "test", "postgres://localhost/ams_e2e_fault", "valid", "valid", secret, "unknown", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			prefix, manifest := tc.prefix, tc.manifest
			if prefix == "valid" {
				prefix = "ams-e2e/" + uuid.NewString() + "/"
			}
			if manifest == "valid" {
				manifest = filepath.Join(t.TempDir(), "objects.txt")
			}
			t.Setenv("APP_ENV", tc.env)
			t.Setenv("DATABASE_URL", tc.database)
			t.Setenv("AMS_TEST_STORAGE_PREFIX", prefix)
			t.Setenv("AMS_TEST_STORAGE_MANIFEST", manifest)
			t.Setenv("AMS_ISSUANCE_TEST_FAULT_TOKEN", secret)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/", nil)
			c.Request.Header.Set("X-AMS-Issuance-Test-Token", tc.token)
			c.Request.Header.Set("X-AMS-Issuance-Test-Fault", tc.mode)
			if got := issuanceTestFault(c); got != tc.want {
				t.Fatalf("fault %q, want %q", got, tc.want)
			}
		})
	}
}

func TestGeneratedRenewalHistoryRecoveryPermissions(t *testing.T) {
	actor, other := uuid.New(), uuid.New()
	future := time.Now().Add(time.Minute)
	own := db.GetCertificateHistoryRow{ActorID: actor.String(), Source: "GENERATED", OwnerKind: "ACCOUNT", SignerID: actor.String(), State: "FAILED", CleanupState: "NONE"}
	otherApproval := own
	otherApproval.ActorID = other.String()
	otherApproval.SignerID = other.String()
	competent := own
	competent.OwnerKind = "COMPETENT_PERSON"
	competent.SignerID = other.String()
	stale := own
	stale.FailureCode = "STALE_CERTIFICATE"
	processing := own
	processing.State = "PROCESSING"
	processing.LeaseUntil = &future
	abandoned := own
	abandoned.State = "ABANDONED"
	abandoned.CleanupState = "FAILED"
	deleted := abandoned
	deleted.CleanupState = "DELETED"
	completed := own
	completed.State = "COMPLETED"
	legacy := db.GetCertificateHistoryRow{Source: "LEGACY", State: "LEGACY"}
	rows := []db.GetCertificateHistoryRow{own, otherApproval, competent, stale, processing, abandoned, deleted, completed, legacy}
	for _, role := range []string{"ADMIN", "SUPER_ADMIN", "USER", "CLIENT", ""} {
		got := recoveryHistory(rows, actor, role)
		for i, item := range got {
			retry, abandon, cleanup := false, false, false
			if role == "ADMIN" || role == "SUPER_ADMIN" {
				switch i {
				case 0:
					retry, abandon = true, true
				case 1:
					retry, abandon = role == "SUPER_ADMIN", role == "SUPER_ADMIN"
				case 2:
					retry, abandon = role == "SUPER_ADMIN", true
				case 3:
					abandon = true
				case 5:
					cleanup = true
				}
			}
			if item.CanRetry != retry || item.CanAbandon != abandon || item.CanRetryCleanup != cleanup {
				t.Fatalf("role %s row %d: %+v", role, i, item)
			}
		}
	}
}
