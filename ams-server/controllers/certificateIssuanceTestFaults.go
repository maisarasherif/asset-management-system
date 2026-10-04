package controllers

import (
	"context"
	"crypto/subtle"
	"errors"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

// Faults are available only to the disposable test stack with a per-run secret.
// They neither add routes nor bypass normal authorization and approval checks.
func issuanceTestFault(c *gin.Context) string {
	secret := os.Getenv("AMS_ISSUANCE_TEST_FAULT_TOKEN")
	if os.Getenv("APP_ENV") != "test" || len(secret) < 32 || !utils.IsolatedTestStorageEnabled() || subtle.ConstantTimeCompare([]byte(secret), []byte(c.GetHeader("X-AMS-Issuance-Test-Token"))) != 1 {
		return ""
	}
	switch mode := c.GetHeader("X-AMS-Issuance-Test-Fault"); mode {
	case "render", "before-write", "after-write", "delete":
		return mode
	}
	return ""
}
func issuanceServiceForRequest(c *gin.Context, pool *pgxpool.Pool, documents issuance.DocumentStore) issuance.Issuances {
	service := issuance.Issuances{Pool: pool, Previews: previewService(pool), Documents: documents}
	mode := issuanceTestFault(c)
	if mode == "render" {
		service.Previews.Renderer = issuanceFaultRenderer{}
	}
	if mode != "" {
		service.Documents = issuanceFaultDocuments{DocumentStore: documents, mode: mode}
	}
	return service
}

type issuanceFaultRenderer struct{}

func (issuanceFaultRenderer) Render(context.Context, issuance.Snapshot, string, []byte) ([]byte, error) {
	return nil, errors.New("isolated issuance render fault")
}

type issuanceFaultDocuments struct {
	issuance.DocumentStore
	mode string
}

func (s issuanceFaultDocuments) Put(ctx context.Context, key string, data []byte) error {
	if s.mode == "before-write" {
		return errors.New("isolated issuance storage fault")
	}
	if err := s.DocumentStore.Put(ctx, key, data); err != nil {
		return err
	}
	if s.mode == "after-write" {
		return errors.New("isolated issuance lost storage acknowledgment")
	}
	return nil
}
func (s issuanceFaultDocuments) Delete(ctx context.Context, key string) error {
	if s.mode == "delete" {
		return errors.New("isolated issuance deletion fault")
	}
	return s.DocumentStore.Delete(ctx, key)
}
