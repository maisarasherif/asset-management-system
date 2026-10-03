package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func decodePreviewInput(c *gin.Context, value any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 192*1024)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid preview request"})
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provide one preview request"})
		return false
	}
	return true
}
func previewError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, issuance.ErrPreviewInput), errors.Is(err, issuance.ErrPreviewText), errors.Is(err, issuance.ErrPreviewToken):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, issuance.ErrPreviewChanged):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, issuance.ErrPreviewExpired):
		c.JSON(http.StatusGone, gin.H{"error": err.Error()})
	case errors.Is(err, issuance.ErrForbidden), errors.Is(err, issuance.ErrIssuerForbidden), errors.Is(err, issuance.ErrManagementForbidden),
		errors.Is(err, issuance.ErrSigningProfileNotFound), errors.Is(err, issuance.ErrSignerIneligible), errors.Is(err, issuance.ErrNotFound), errors.Is(err, issuance.ErrStorage), errors.Is(err, issuance.ErrImage), errors.Is(err, issuance.ErrImageDimensions):
		signingError(c, err)
	default:
		logger.Log.Error().Err(err).Msg("certificate preview operation failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not prepare or validate the certificate preview; try again"})
	}
}
func previewService(pool *pgxpool.Pool) issuance.Previews {
	return issuance.Previews{Management: signerManagement(pool), Secret: []byte(os.Getenv("SECRET_KEY")), Renderer: issuance.PDFRenderer{}}
}
func PrepareCertificatePreview(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		var input issuance.PreviewInput
		if !decodePreviewInput(c, &input) {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		response, err := previewService(pool).Prepare(ctx, actor, certificate, input)
		if err != nil {
			previewError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, response)
	}
}

// Read-only validation is shared with approval in the next slice. It creates no draft or number.
func ValidateCertificatePreview(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		var input struct {
			Token string `json:"preview_token"`
		}
		if !decodePreviewInput(c, &input) {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		if _, err := previewService(pool).Validate(ctx, actor, certificate, input.Token); err != nil {
			previewError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.Status(http.StatusNoContent)
	}
}
