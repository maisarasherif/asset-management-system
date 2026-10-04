package controllers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

// Recovery uses the persisted approval. No preview token, dates or signer edits are accepted.
func RecoverCertificateIssuance(pool *pgxpool.Pool, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		id, ok := utils.ParseUUIDParam(c, "issuance_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()
		// A retry may upload the original external bytes, bounded independently of headers.
		var original []byte
		if c.Request.ContentLength != 0 {
			if action != "retry" || c.ContentType() != "multipart/form-data" {
				c.JSON(400, gin.H{"error": "recovery accepts only the original external file on retry"})
				return
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxCertificateUploadRequestSize)
			if err := c.Request.ParseMultipartForm(issuance.MaxExternalBytes); err != nil {
				var tooLarge *http.MaxBytesError
				if errors.As(err, &tooLarge) {
					c.JSON(413, gin.H{"error": "file too large, maximum size is 10MB"})
				} else {
					c.JSON(400, gin.H{"error": "provide one original renewal file"})
				}
				return
			}
			defer c.Request.MultipartForm.RemoveAll()
			if len(c.Request.MultipartForm.Value) != 0 || len(c.Request.MultipartForm.File) != 1 || len(c.Request.MultipartForm.File["file"]) != 1 {
				c.JSON(400, gin.H{"error": "provide only one original renewal file"})
				return
			}
			file, _, err := c.Request.FormFile("file")
			if err != nil {
				c.JSON(400, gin.H{"error": "could not read original file"})
				return
			}
			defer file.Close()
			original, err = io.ReadAll(io.LimitReader(file, issuance.MaxExternalBytes+1))
			if err != nil || len(original) == 0 {
				c.JSON(400, gin.H{"error": "could not read original file"})
				return
			}
			if len(original) > issuance.MaxExternalBytes {
				c.JSON(413, gin.H{"error": "file too large, maximum size is 10MB"})
				return
			}
		}
		row, err := db.New(pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: certificate, IssuanceID: id})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				previewError(c, issuance.ErrNotFound)
			} else {
				c.JSON(503, gin.H{"error": "could not load this approval; try again"})
			}
			return
		}
		var documents issuance.DocumentStore = issuance.R2Documents{}
		if row.Source == "EXTERNAL" {
			documents = issuance.R2ExternalDocuments{ContentType: row.ContentType}
		}
		service := issuanceServiceForRequest(c, pool, documents)
		var result issuance.Issuance
		switch action {
		case "retry":
			result, err = service.Retry(ctx, actor, certificate, id, original)
		case "abandon":
			result, err = service.Abandon(ctx, actor, certificate, id)
		case "cleanup":
			result, err = service.RetryCleanup(ctx, actor, certificate, id)
		default:
			c.JSON(404, gin.H{"error": "recovery action not found"})
			return
		}
		if err != nil {
			status, message := http.StatusServiceUnavailable, "could not recover this approval; refresh its history and try again"
			switch {
			case errors.Is(err, issuance.ErrIssuanceAbandoned):
				status, message = 409, issuance.ErrIssuanceAbandoned.Error()
			case errors.Is(err, issuance.ErrIssuanceCompleted):
				status, message = 409, issuance.ErrIssuanceCompleted.Error()
			case errors.Is(err, issuance.ErrIssuanceBusy):
				status, message = 409, issuance.ErrIssuanceBusy.Error()
			case errors.Is(err, issuance.ErrIssuanceConflict):
				status, message = 409, issuance.ErrIssuanceConflict.Error()
			case errors.Is(err, issuance.ErrApprovalMismatch):
				status, message = 409, issuance.ErrApprovalMismatch.Error()
			case errors.Is(err, issuance.ErrOriginalFileRequired):
				status, message = 400, issuance.ErrOriginalFileRequired.Error()
			case errors.Is(err, issuance.ErrIssuanceCleanup):
				message = issuance.ErrIssuanceCleanup.Error()
			case errors.Is(err, issuance.ErrIssuanceFailed):
				message = issuance.ErrIssuanceFailed.Error()
			default:
				previewError(c, err)
				return
			}
			logger.Log.Error().Err(err).Str("issuance_id", id.String()).Msg("certificate recovery failed")
			if result.ID == uuid.Nil {
				c.JSON(status, gin.H{"error": message})
			} else {
				c.JSON(status, gin.H{"error": message, "issuance": result})
			}
			return
		}
		status := 200
		if result.State == "PROCESSING" || result.State == "APPROVED" || result.CleanupState == "PENDING" {
			status = 202
		}
		c.JSON(status, result)
	}
}

type recoveryHistoryRow struct {
	db.GetCertificateHistoryRow
	CanRetry        bool `json:"can_retry"`
	CanAbandon      bool `json:"can_abandon"`
	CanRetryCleanup bool `json:"can_retry_cleanup"`
}

func recoveryHistory(rows []db.GetCertificateHistoryRow, actor uuid.UUID, role string) []recoveryHistoryRow {
	result := make([]recoveryHistoryRow, 0, len(rows))
	for _, row := range rows {
		item := recoveryHistoryRow{GetCertificateHistoryRow: row}
		permitted := role == "SUPER_ADMIN" || (role == "ADMIN" && row.ActorID == actor.String())
		idle := row.LeaseUntil == nil || !row.LeaseUntil.After(time.Now())
		unfinished := row.State == "APPROVED" || row.State == "FAILED" || row.State == "PROCESSING"
		item.CanAbandon = permitted && idle && unfinished
		ownSigner := row.Source != "GENERATED" || role == "SUPER_ADMIN" || (row.OwnerKind == "ACCOUNT" && row.SignerID == actor.String())
		item.CanRetry = item.CanAbandon && ownSigner && row.FailureCode != "STALE_CERTIFICATE"
		item.CanRetryCleanup = permitted && idle && row.State == "ABANDONED" && (row.CleanupState == "FAILED" || row.CleanupState == "PENDING")
		result = append(result, item)
	}
	return result
}
