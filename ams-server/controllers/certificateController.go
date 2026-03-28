package controllers

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func computeCertificateStatus(expiryDate time.Time) string {
	daysUntilExpiry := int(time.Until(expiryDate).Hours() / 24)
	if daysUntilExpiry < 0 {
		return "EXPIRED"
	} else if daysUntilExpiry <= 30 {
		return "EXPIRING_SOON"
	}
	return "VALID"
}

func GetCertificates(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		certificates, err := queries.GetAllCertificatesPaginated(ctx, db.GetAllCertificatesPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificates"})
			return
		}

		total, err := queries.CountCertificates(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count certificates"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: certificates,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		certificate, err := queries.GetCertificateByID(ctx, certificateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate"})
			return
		}

		c.JSON(http.StatusOK, certificate)
	}
}

func GetTestTypes(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		testTypes, err := queries.GetAllTestTypes(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test types"})
			return
		}

		c.JSON(http.StatusOK, testTypes)
	}
}

func GetCertificatesByComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		_, err := queries.GetComponentByID(ctx, componentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch component"})
			return
		}

		certificates, err := queries.GetCertificatesByComponentIDPaginated(ctx, db.GetCertificatesByComponentIDPaginatedParams{
			ComponentID: componentID,
			Limit:       limit,
			Offset:      offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificates"})
			return
		}

		total, err := queries.CountCertificatesByComponentID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count certificates"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: certificates,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func AddCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.CertificateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		if input.ExpiryDate.Before(input.IssueDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expiry date must be after issue date"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetComponentByID(ctx, input.ComponentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		_, err = queries.GetTestTypeByID(ctx, input.TestID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
			return
		}

		certificateID, err := generateCertificateID(ctx, queries, input.ComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate certificate id"})
			return
		}

		certificate, err := queries.CreateCertificate(ctx, db.CreateCertificateParams{
			CertificateID:    certificateID,
			ComponentID:      input.ComponentID,
			CertificateName:  input.CertificateName,
			IssueDate:        input.IssueDate,
			ExpiryDate:       input.ExpiryDate,
			CertificateFile:  input.CertificateFile,
			IssuingAuthority: input.IssuingAuthority,
			Status:           computeCertificateStatus(input.ExpiryDate),
			TestID:           input.TestID,
			ImcaRef:          input.IMCARef,
			ImcaD018:         input.IMCAD018,
			MaintenanceNotes: input.MaintenanceNotes,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add certificate"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("certificate_id", certificate.CertificateID).
			Str("certificate_name", certificate.CertificateName).
			Str("component_id", certificate.ComponentID).
			Str("test_id", certificate.TestID).
			Str("status", certificate.Status).
			Str("expiry_date", certificate.ExpiryDate.Format("2006-01-02")).
			Str("created_by", userID).
			Msg("certificate added successfully")

		c.JSON(http.StatusCreated, certificate)
	}
}

func UpdateCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		var input dto.CertificateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		if input.ExpiryDate.Before(input.IssueDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expiry date must be after issue date"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetCertificateByID(ctx, certificateID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		_, err = queries.GetComponentByID(ctx, input.ComponentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		_, err = queries.GetTestTypeByID(ctx, input.TestID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
			return
		}

		newStatus := computeCertificateStatus(input.ExpiryDate)

		rows, err := queries.UpdateCertificate(ctx, db.UpdateCertificateParams{
			ComponentID:      input.ComponentID,
			CertificateName:  input.CertificateName,
			IssueDate:        input.IssueDate,
			ExpiryDate:       input.ExpiryDate,
			CertificateFile:  input.CertificateFile,
			IssuingAuthority: input.IssuingAuthority,
			Status:           newStatus,
			TestID:           input.TestID,
			ImcaRef:          input.IMCARef,
			ImcaD018:         input.IMCAD018,
			MaintenanceNotes: input.MaintenanceNotes,
			CertificateID:    certificateID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update certificate"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("certificate_id", certificateID).
			Str("certificate_name", existing.CertificateName).
			Str("old_status", existing.Status).
			Str("new_status", newStatus).
			Str("updated_by", userID).
			Msg("certificate updated")

		c.JSON(http.StatusOK, gin.H{"message": "certificate updated successfully"})
	}
}

func DeleteCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetCertificateByID(ctx, certificateID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		rows, err := queries.DeleteCertificate(ctx, certificateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete certificate"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Warn().
			Str("certificate_id", certificateID).
			Str("certificate_name", existing.CertificateName).
			Str("component_id", existing.ComponentID).
			Str("deleted_by", userID).
			Msg("certificate deleted")

		c.JSON(http.StatusOK, gin.H{"message": "certificate deleted successfully"})
	}
}

func GetExpiringCertificates(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		daysThreshold := 30
		if daysThresholdStr := os.Getenv("EXPIRY_ALERT_DAYS"); daysThresholdStr != "" {
			if threshold, err := strconv.Atoi(daysThresholdStr); err == nil {
				daysThreshold = threshold
			}
		}

		thresholdDate := time.Now().AddDate(0, 0, daysThreshold)

		queries := db.New(pool)

		certificates, err := queries.GetExpiringCertificates(ctx, thresholdDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch expiring certificates"})
			return
		}

		c.JSON(http.StatusOK, certificates)
	}
}

func PatchCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		var input dto.PatchCertificateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetCertificateByID(ctx, certificateID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		componentID := existing.ComponentID
		certificateName := existing.CertificateName
		issueDate := existing.IssueDate
		expiryDate := existing.ExpiryDate
		certificateFile := existing.CertificateFile
		issuingAuthority := existing.IssuingAuthority
		testID := existing.TestID
		imcaRef := existing.ImcaRef
		imcaD018 := existing.ImcaD018
		maintenanceNotes := existing.MaintenanceNotes

		if input.ComponentID != nil {
			componentID = *input.ComponentID
		}
		if input.CertificateName != nil {
			certificateName = *input.CertificateName
		}
		if input.IssueDate != nil {
			issueDate = *input.IssueDate
		}
		if input.ExpiryDate != nil {
			expiryDate = *input.ExpiryDate
		}
		if input.CertificateFile != nil {
			certificateFile = *input.CertificateFile
		}
		if input.IssuingAuthority != nil {
			issuingAuthority = *input.IssuingAuthority
		}
		if input.TestID != nil {
			testID = *input.TestID
		}
		if input.IMCARef != nil {
			imcaRef = *input.IMCARef
		}
		if input.IMCAD018 != nil {
			imcaD018 = *input.IMCAD018
		}
		if input.MaintenanceNotes != nil {
			maintenanceNotes = *input.MaintenanceNotes
		}

		if expiryDate.Before(issueDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expiry date must be after issue date"})
			return
		}

		_, err = queries.GetComponentByID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		if input.TestID != nil {
			_, err = queries.GetTestTypeByID(ctx, testID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
				return
			}
		}

		newStatus := computeCertificateStatus(expiryDate)

		rows, err := queries.UpdateCertificate(ctx, db.UpdateCertificateParams{
			ComponentID:      componentID,
			CertificateName:  certificateName,
			IssueDate:        issueDate,
			ExpiryDate:       expiryDate,
			CertificateFile:  certificateFile,
			IssuingAuthority: issuingAuthority,
			Status:           newStatus,
			TestID:           testID,
			ImcaRef:          imcaRef,
			ImcaD018:         imcaD018,
			MaintenanceNotes: maintenanceNotes,
			CertificateID:    certificateID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update certificate"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("certificate_id", certificateID).
			Str("certificate_name", existing.CertificateName).
			Str("old_status", existing.Status).
			Str("new_status", newStatus).
			Str("updated_by", userID).
			Msg("certificate patched")

		c.JSON(http.StatusOK, gin.H{"message": "certificate updated successfully"})
	}
}

func UploadCertificateFile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetCertificateByID(ctx, certificateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate"})
			return
		}

		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
			return
		}
		defer file.Close()

		const maxFileSize = 10 * 1024 * 1024 // 10 MB
		if header.Size > maxFileSize {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file too large, maximum size is 10MB"})
			return
		}

		allowedTypes := map[string]bool{
			"application/pdf": true,
			"image/jpeg":      true,
			"image/png":       true,
			"image/webp":      true,
		}
		contentType := header.Header.Get("Content-Type")
		if !allowedTypes[contentType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file type, only PDF, JPEG, PNG, and WEBP are allowed"})
			return
		}

		key, err := utils.UploadFile(ctx, file, header, certificateID)
		if err != nil {
			logger.Log.Error().Err(err).Msg("failed to upload certificate file")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload file"})
			return
		}

		rows, err := queries.UpdateCertificateFile(ctx, db.UpdateCertificateFileParams{
			CertificateFile: key,
			CertificateID:   certificateID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update certificate file"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		_, err = pool.Exec(ctx, `
				INSERT INTO certificate_upload_audit (certificate_id, file_key, file_name, uploaded_by, uploaded_at)
				VALUES ($1, $2, $3, $4, NOW())
			`, certificateID, key, header.Filename, userID)
		if err != nil {
			logger.Log.Error().Err(err).Msg("failed to write certificate upload audit log")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write upload audit log"})
			return
		}

		logger.Log.Info().
			Str("certificate_id", certificateID).
			Str("file_key", key).
			Str("uploaded_by", userID).
			Msg("certificate file uploaded")
		c.JSON(http.StatusOK, gin.H{"message": "file uploaded successfully"})
	}
}

func GetCertificateUploadAudit(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		auditEntries, err := queries.GetCertificateUploadAuditByCertificateIDPaginated(ctx, db.GetCertificateUploadAuditByCertificateIDPaginatedParams{
			CertificateID: certificateID,
			Limit:         limit,
			Offset:        offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate upload audit"})
			return
		}

		total, err := queries.CountCertificateUploadAuditByCertificateID(ctx, certificateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count certificate upload audit"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: auditEntries,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetCertificateFile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		certificate, err := queries.GetCertificateByID(ctx, certificateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate"})
			return
		}

		if certificate.CertificateFile == "" {
			c.JSON(http.StatusNotFound, gin.H{"error": "no file uploaded for this certificate"})
			return
		}

		signedURL, err := utils.GenerateSignedURL(ctx, certificate.CertificateFile)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate download URL"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"url": signedURL})
	}
}

func GetCertificatesWithContext(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		certificates, err := queries.GetAllCertificatesWithContextPaginated(ctx, db.GetAllCertificatesWithContextPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificates"})
			return
		}

		total, err := queries.CountAllCertificatesWithContext(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count certificates"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: certificates,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetCertificatesReportPDF(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		queries := db.New(pool)

		total, err := queries.CountAllCertificatesWithContext(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count certificates"})
			return
		}

		var certificates []db.GetAllCertificatesWithContextPaginatedRow
		if total > 0 {
			limit := int32(total)
			if total > math.MaxInt32 {
				limit = math.MaxInt32
			}

			certificates, err = queries.GetAllCertificatesWithContextPaginated(ctx, db.GetAllCertificatesWithContextPaginatedParams{
				Limit:  limit,
				Offset: 0,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificates"})
				return
			}
		}

		generatedAt := time.Now()
		reportRows := make([]utils.CertificateReportRow, 0, len(certificates))
		for _, certificate := range certificates {
			reportRows = append(reportRows, utils.CertificateReportRow{
				CertificateName:    certificate.CertificateName,
				CertificateID:      certificate.CertificateID,
				ComponentName:      certificate.ComponentName,
				ComponentID:        certificate.ComponentID,
				AssetName:          certificate.AssetName,
				AssetID:            certificate.AssetID,
				LastInspectionDate: certificate.IssueDate.Format("2006-01-02"),
				NextInspectionDate: certificate.ExpiryDate.Format("2006-01-02"),
				Status:             certificate.Status,
				IssuingAuthority:   certificate.IssuingAuthority,
			})
		}

		pdfBytes, err := utils.BuildCertificateReportPDF(generatedAt, reportRows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate certificate report"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("generated_by", userID).
			Int("certificate_count", len(certificates)).
			Msg("certificate report generated")

		filename := fmt.Sprintf("certificate-report-%s.pdf", generatedAt.Format("20060102-150405"))
		c.Header("Content-Type", "application/pdf")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		c.Data(http.StatusOK, "application/pdf", pdfBytes)
	}
}
