package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func ApproveGeneratedCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
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
		var input struct {
			Token string `json:"preview_token"`
		}
		if !decodePreviewInput(c, &input) {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()
		service := issuance.Issuances{Pool: pool, Previews: previewService(pool), Documents: issuance.R2Documents{}}
		result, err := service.Approve(ctx, actor, certificate, input.Token)
		if err != nil {
			if errors.Is(err, issuance.ErrIssuanceFailed) && result.ID != uuid.Nil {
				logger.Log.Error().Err(err).Str("issuance_id", result.ID.String()).Msg("approved certificate issuance failed")
				status := http.StatusServiceUnavailable
				message := issuance.ErrIssuanceFailed.Error()
				if errors.Is(err, issuance.ErrIssuanceConflict) {
					status = http.StatusConflict
					message = issuance.ErrIssuanceConflict.Error()
				}
				c.JSON(status, gin.H{"error": message, "issuance": result})
				return
			}
			if errors.Is(err, issuance.ErrIssuanceFailed) {
				logger.Log.Error().Err(err).Msg("certificate approval could not be saved")
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "could not save the certificate approval; retry this preview"})
				return
			}
			previewError(c, err)
			return
		}
		status := http.StatusOK
		if result.State == "PROCESSING" || result.State == "APPROVED" {
			status = http.StatusAccepted
		}
		c.JSON(status, result)
	}
}

// Staff access matches the existing certificate/current-file/upload-history routes.
func GetCertificateIssuances(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		q := db.New(pool)
		if _, err := q.GetCertificateByID(ctx, certificate); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(404, gin.H{"error": "certificate not found"})
			} else {
				c.JSON(500, gin.H{"error": "could not load certificate"})
			}
			return
		}
		limit, offset, query := utils.ParsePagination(c)
		rows, err := q.ListCertificateIssuances(ctx, db.ListCertificateIssuancesParams{CertificateID: certificate, Limit: limit, Offset: offset})
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load issuance history"})
			return
		}
		result := make([]issuance.Issuance, 0, len(rows))
		for _, row := range rows {
			item, err := issuance.PublicIssuance(row)
			if err != nil {
				c.JSON(500, gin.H{"error": "could not read issuance history"})
				return
			}
			result = append(result, item)
		}
		total, err := q.CountCertificateIssuances(ctx, certificate)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not count issuance history"})
			return
		}
		c.JSON(200, dto.PaginatedResponse{Data: result, Meta: utils.BuildMeta(query, total)})
	}
}
func GetCertificateIssuanceFile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		id, ok := utils.ParseUUIDParam(c, "issuance_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		row, err := db.New(pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: certificate, IssuanceID: id})
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.State != "COMPLETED") {
			c.JSON(404, gin.H{"error": "issued document not found"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load issued document"})
			return
		}
		url, err := utils.GenerateSignedURL(ctx, row.FileKey, row.DocumentNumber.String+".pdf")
		if err != nil {
			c.JSON(503, gin.H{"error": "could not open issued document"})
			return
		}
		c.JSON(200, gin.H{"url": url})
	}
}

func GetCertificateIssuance(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		id, ok := utils.ParseUUIDParam(c, "issuance_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		row, err := db.New(pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: certificate, IssuanceID: id})
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(404, gin.H{"error": "issuance not found"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "could not read issuance status"})
			return
		}
		result, err := issuance.PublicIssuance(row)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not read approved details"})
			return
		}
		c.JSON(200, result)
	}
}
