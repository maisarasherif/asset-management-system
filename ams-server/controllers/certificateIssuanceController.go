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
		service := issuanceServiceForRequest(c, pool, issuance.R2Documents{})
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
		filename := row.FileName
		if filename == "" {
			filename = row.DocumentNumber.String + ".pdf"
		}
		url, err := utils.GenerateSignedURL(ctx, row.FileKey, filename)
		if err != nil {
			c.JSON(503, gin.H{"error": "could not open issued document"})
			return
		}
		c.JSON(200, gin.H{"url": url})
	}
}

func RenewExternalCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
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
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxCertificateUploadRequestSize)
		if err := c.Request.ParseMultipartForm(issuance.MaxExternalBytes); err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				c.JSON(413, gin.H{"error": "file too large, maximum size is 10MB"})
			} else {
				c.JSON(400, gin.H{"error": "provide a multipart renewal file and dates"})
			}
			return
		}
		defer c.Request.MultipartForm.RemoveAll()
		for name, values := range c.Request.MultipartForm.Value {
			if (name != "approval_id" && name != "competent_person_id" && name != "issue_date" && name != "expiry_date") || len(values) != 1 {
				c.JSON(400, gin.H{"error": "unsupported or duplicate renewal field"})
				return
			}
		}
		if len(c.Request.MultipartForm.File) != 1 || len(c.Request.MultipartForm.File["file"]) != 1 {
			c.JSON(400, gin.H{"error": "provide exactly one renewal file"})
			return
		}
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(400, gin.H{"error": "file is required"})
			return
		}
		defer file.Close()
		if header.Size > issuance.MaxExternalBytes {
			c.JSON(413, gin.H{"error": "file too large, maximum size is 10MB"})
			return
		}
		approval, err := uuid.Parse(c.PostForm("approval_id"))
		if err != nil {
			c.JSON(400, gin.H{"error": "approval_id must be a UUID"})
			return
		}
		person, err := uuid.Parse(c.PostForm("competent_person_id"))
		if err != nil {
			c.JSON(400, gin.H{"error": "competent person is required"})
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, issuance.MaxExternalBytes+1))
		if err != nil {
			c.JSON(400, gin.H{"error": "could not read renewal file"})
			return
		}
		contentType := header.Header.Get("Content-Type")
		ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()
		service := issuanceServiceForRequest(c, pool, issuance.R2ExternalDocuments{ContentType: contentType})
		result, err := service.ApproveExternal(ctx, actor, certificate, issuance.ExternalInput{ApprovalID: approval, PersonID: person, IssueDate: c.PostForm("issue_date"), ExpiryDate: c.PostForm("expiry_date"), FileName: header.Filename, ContentType: contentType, Data: data})
		if err != nil {
			switch {
			case errors.Is(err, issuance.ErrExternalInput):
				c.JSON(400, gin.H{"error": err.Error()})
			case errors.Is(err, issuance.ErrApprovalMismatch):
				c.JSON(409, gin.H{"error": err.Error()})
			case errors.Is(err, issuance.ErrIssuanceFailed):
				logger.Log.Error().Err(err).Str("issuance_id", result.ID.String()).Msg("external renewal failed")
				if result.ID == uuid.Nil {
					c.JSON(503, gin.H{"error": "could not save the renewal approval; retry with the same file and dates"})
					return
				}
				code := 503
				if errors.Is(err, issuance.ErrIssuanceConflict) {
					code = 409
				}
				c.JSON(code, gin.H{"error": issuance.ErrIssuanceFailed.Error(), "issuance": result})
			default:
				previewError(c, err)
			}
			return
		}
		code := 200
		if result.State == "PROCESSING" || result.State == "APPROVED" {
			code = 202
		}
		c.JSON(code, result)
	}
}

func GetCertificateHistory(pool *pgxpool.Pool) gin.HandlerFunc {
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
		rows, err := q.GetCertificateHistory(ctx, db.GetCertificateHistoryParams{CertificateID: certificate, PageLimit: limit, PageOffset: offset})
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load certificate history"})
			return
		}
		total, err := q.CountCertificateHistory(ctx, certificate)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not count history"})
			return
		}
		if rows == nil {
			rows = []db.GetCertificateHistoryRow{}
		}
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		signingActor, err := q.GetSigningActor(ctx, actor)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load recovery permissions"})
			return
		}
		role := signingActor.Role
		if signingActor.Status != "ACTIVE" {
			role = ""
		}
		c.JSON(200, dto.PaginatedResponse{Data: recoveryHistory(rows, actor, role), Meta: utils.BuildMeta(query, total)})
	}
}
func GetCertificateHistoryFile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		id, ok := utils.ParseUUIDParam(c, "history_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		q := db.New(pool)
		row, err := q.GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: certificate, IssuanceID: id})
		var key, filename string
		if err == nil {
			if row.State != "COMPLETED" {
				c.JSON(404, gin.H{"error": "completed document not found"})
				return
			}
			key = row.FileKey
			filename = row.FileName
			if filename == "" {
				filename = row.DocumentNumber.String + ".pdf"
			}
		} else if errors.Is(err, pgx.ErrNoRows) {
			legacy, e := q.GetCertificateUploadAuditFileByID(ctx, db.GetCertificateUploadAuditFileByIDParams{CertificateID: certificate, Uuid: id})
			if errors.Is(e, pgx.ErrNoRows) {
				c.JSON(404, gin.H{"error": "history document not found"})
				return
			}
			if e != nil {
				c.JSON(500, gin.H{"error": "could not load history document"})
				return
			}
			key = legacy.FileKey
			filename = legacy.FileName
		} else {
			c.JSON(500, gin.H{"error": "could not load history document"})
			return
		}
		url, err := utils.GenerateSignedURL(ctx, key, filename)
		if err != nil {
			c.JSON(503, gin.H{"error": "could not open history document"})
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
