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
	return computeCertificateStatusAt(expiryDate, time.Now())
}

func computeCertificateStatusAt(expiryDate time.Time, now time.Time) string {
	expiryYear, expiryMonth, expiryDay := expiryDate.Date()
	nowYear, nowMonth, nowDay := now.Date()
	expiryCalendarDate := time.Date(expiryYear, expiryMonth, expiryDay, 0, 0, 0, 0, time.UTC)
	todayCalendarDate := time.Date(nowYear, nowMonth, nowDay, 0, 0, 0, 0, time.UTC)
	daysUntilExpiry := int(expiryCalendarDate.Sub(todayCalendarDate).Hours() / 24)
	if daysUntilExpiry < 0 {
		return "EXPIRED"
	} else if daysUntilExpiry <= 30 {
		return "EXPIRING_SOON"
	}
	return "VALID"
}

func currentCertificateStatus(storedStatus string, expiryDate *time.Time) string {
	if expiryDate == nil {
		if storedStatus == "" {
			return "PENDING"
		}
		return storedStatus
	}
	return computeCertificateStatus(*expiryDate)
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
		for i := range certificates {
			certificates[i].Status = currentCertificateStatus(certificates[i].Status, certificates[i].ExpiryDate)
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
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

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
		certificate.Status = currentCertificateStatus(certificate.Status, certificate.ExpiryDate)

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

		c.JSON(http.StatusOK, dto.NormalizeListData(testTypes))
	}
}

func GetCertificatesByComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID, ok := utils.ParseUUIDParam(c, "component_id")
		if !ok {
			return
		}

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
			PageLimit:   limit,
			PageOffset:  offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificates"})
			return
		}
		for i := range certificates {
			certificates[i].Status = currentCertificateStatus(certificates[i].Status, certificates[i].ExpiryDate)
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

		componentID, err := utils.ParseUUID(input.ComponentID, "component_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		testID, err := utils.ParseUUID(input.TestID, "test_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err = queries.GetComponentByID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		_, err = queries.GetTestTypeByID(ctx, testID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
			return
		}

		// dto uses time.Time, db expects *time.Time
		issueDate := input.IssueDate
		expiryDate := input.ExpiryDate

		certificate, err := queries.CreateCertificate(ctx, db.CreateCertificateParams{
			ComponentID:      componentID,
			CertificateName:  input.CertificateName,
			IssueDate:        &issueDate,
			ExpiryDate:       &expiryDate,
			CertificateFile:  "",
			IssuingAuthority: input.IssuingAuthority,
			Status:           computeCertificateStatus(input.ExpiryDate),
			TestID:           testID,
			ImcaRef:          input.IMCARef,
			ImcaD018:         input.IMCAD018,
			MaintenanceNotes: input.MaintenanceNotes,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add certificate"})
			return
		}

		expiryStr := ""
		if certificate.ExpiryDate != nil {
			expiryStr = certificate.ExpiryDate.Format("2006-01-02")
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("certificate_id", certificate.CertificateID.String()).
			Str("certificate_name", certificate.CertificateName).
			Str("component_id", certificate.ComponentID.String()).
			Str("test_id", certificate.TestID.String()).
			Str("status", certificate.Status).
			Str("expiry_date", expiryStr).
			Str("created_by", userID).
			Msg("certificate added successfully")

		c.JSON(http.StatusCreated, certificate)
	}
}

func UpdateCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

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

		componentID, err := utils.ParseUUID(input.ComponentID, "component_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		testID, err := utils.ParseUUID(input.TestID, "test_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err = queries.GetComponentByID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		_, err = queries.GetTestTypeByID(ctx, testID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
			return
		}

		issueDate := input.IssueDate
		expiryDate := input.ExpiryDate
		newStatus := computeCertificateStatus(input.ExpiryDate)

		rows, err := queries.UpdateCertificate(ctx, db.UpdateCertificateParams{
			ComponentID:      componentID,
			CertificateName:  input.CertificateName,
			IssueDate:        &issueDate,
			ExpiryDate:       &expiryDate,
			CertificateFile:  existing.CertificateFile,
			IssuingAuthority: input.IssuingAuthority,
			Status:           newStatus,
			TestID:           testID,
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
			Str("certificate_id", certificateID.String()).
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
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
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
			Str("certificate_id", certificateID.String()).
			Str("certificate_name", existing.CertificateName).
			Str("component_id", existing.ComponentID.String()).
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

		certificates, err := queries.GetExpiringCertificates(ctx, &thresholdDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch expiring certificates"})
			return
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(certificates))
	}
}

func PatchCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

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
		issueDate := existing.IssueDate   // *time.Time
		expiryDate := existing.ExpiryDate // *time.Time
		certificateFile := existing.CertificateFile
		issuingAuthority := existing.IssuingAuthority
		testID := existing.TestID
		imcaRef := existing.ImcaRef
		imcaD018 := existing.ImcaD018
		maintenanceNotes := existing.MaintenanceNotes

		if input.ComponentID != nil {
			parsedComponentID, err := utils.ParseUUID(*input.ComponentID, "component_id")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			componentID = parsedComponentID
		}
		if input.CertificateName != nil {
			certificateName = *input.CertificateName
		}
		if input.IssueDate != nil {
			issueDate = input.IssueDate
		}
		if input.ExpiryDate != nil {
			expiryDate = input.ExpiryDate
		}
		if input.IssuingAuthority != nil {
			issuingAuthority = *input.IssuingAuthority
		}
		if input.TestID != nil {
			parsedTestID, err := utils.ParseUUID(*input.TestID, "test_id")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			testID = parsedTestID
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

		// date validation — only if both are non-nil
		if issueDate != nil && expiryDate != nil && expiryDate.Before(*issueDate) {
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

		// compute status only if expiry date is set, otherwise keep PENDING
		newStatus := existing.Status
		if expiryDate != nil {
			newStatus = computeCertificateStatus(*expiryDate)
		}

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
			Str("certificate_id", certificateID.String()).
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
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

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

		const maxFileSize = 10 * 1024 * 1024
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

		competentPersonID, err := utils.ParseUUID(c.PostForm("competent_person_id"), "competent_person_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "competent person is required"})
			return
		}

		competentPerson, err := queries.GetCompetentPersonByID(ctx, competentPersonID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "competent person not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate competent person"})
			return
		}
		if !competentPerson.Active {
			c.JSON(http.StatusBadRequest, gin.H{"error": "competent person is inactive"})
			return
		}

		competencyCategory, err := queries.GetCompetencyCategoryByID(ctx, competentPerson.CompetencyCategoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate competency category"})
			return
		}
		if !competencyCategory.Active {
			c.JSON(http.StatusBadRequest, gin.H{"error": "competency category is inactive"})
			return
		}

		key, err := utils.UploadFile(ctx, file, header)
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
		rows, err = queries.CreateCertificateUploadAuditEntry(ctx, db.CreateCertificateUploadAuditEntryParams{
			CertificateID:     certificateID,
			FileKey:           key,
			FileName:          header.Filename,
			UploadedBy:        userID,
			CompetentPersonID: &competentPersonID,
		})
		if err != nil {
			logger.Log.Error().Err(err).Msg("failed to write certificate upload audit log")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write upload audit log"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		logger.Log.Info().
			Str("certificate_id", certificateID.String()).
			Str("file_key", key).
			Str("uploaded_by", userID).
			Msg("certificate file uploaded")

		c.JSON(http.StatusOK, gin.H{"message": "file uploaded successfully"})
	}
}

func GetCertificateUploadAudit(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		auditEntries, err := queries.GetCertificateUploadAuditByCertificateIDPaginated(ctx, db.GetCertificateUploadAuditByCertificateIDPaginatedParams{
			CertificateID: certificateID,
			PageLimit:     limit,
			PageOffset:    offset,
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

func GetCertificateUploadFile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		uploadID, ok := utils.ParseUUIDParam(c, "upload_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		uploadFile, err := db.New(pool).GetCertificateUploadAuditFileByID(ctx, db.GetCertificateUploadAuditFileByIDParams{
			CertificateID: certificateID,
			Uuid:          uploadID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "upload history entry not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch upload history entry"})
			return
		}

		signedURL, err := utils.GenerateSignedURL(ctx, uploadFile.FileKey, uploadFile.FileName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate download URL"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"url": signedURL})
	}
}

func GetCertificateFile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

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

		signedURL, err := utils.GenerateSignedURL(ctx, certificate.CertificateFile, "")
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
		for i := range certificates {
			certificates[i].Status = currentCertificateStatus(certificates[i].Status, certificates[i].ExpiryDate)
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
			for i := range certificates {
				certificates[i].Status = currentCertificateStatus(certificates[i].Status, certificates[i].ExpiryDate)
			}
		}

		generatedAt := time.Now()
		reportRows := make([]utils.CertificateReportRow, 0, len(certificates))
		for _, certificate := range certificates {
			// skip pending certificates from report — they have no real data
			if certificate.Status == "PENDING" {
				continue
			}

			issueDateStr := ""
			if certificate.IssueDate != nil {
				issueDateStr = certificate.IssueDate.Format("2006-01-02")
			}
			expiryDateStr := ""
			if certificate.ExpiryDate != nil {
				expiryDateStr = certificate.ExpiryDate.Format("2006-01-02")
			}

			reportRows = append(reportRows, utils.CertificateReportRow{
				CertificateName:    certificate.CertificateName,
				CertificateID:      certificate.CertificateID.String(),
				ComponentName:      certificate.ComponentName,
				ComponentID:        certificate.ComponentID.String(),
				AssetName:          certificate.AssetName,
				AssetID:            certificate.AssetID.String(),
				LastInspectionDate: issueDateStr,
				NextInspectionDate: expiryDateStr,
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
			Int("certificate_count", len(reportRows)).
			Msg("certificate report generated")

		filename := fmt.Sprintf("certificate-report-%s.pdf", generatedAt.Format("20060102-150405"))
		c.Header("Content-Type", "application/pdf")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		c.Data(http.StatusOK, "application/pdf", pdfBytes)
	}
}

func GetAssetComponentCertificateSheetPDF(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		queries := db.New(pool)

		asset, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}

		rows, err := queries.GetAssetComponentCertificateSheetRows(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset certificate sheet rows"})
			return
		}

		reportRows := make([]utils.AssetCertificateSheetRow, 0, len(rows))
		for _, row := range rows {
			issueDateStr := ""
			if row.IssueDate != nil {
				issueDateStr = row.IssueDate.Format("2006-01-02")
			}
			expiryDateStr := ""
			status := row.CertificateStatus
			if row.ExpiryDate != nil {
				expiryDateStr = row.ExpiryDate.Format("2006-01-02")
				status = computeCertificateStatus(*row.ExpiryDate)
			}
			if row.CertificateNumber == "" {
				status = "NO_CERTIFICATE"
			} else if status == "" {
				status = "PENDING"
			}

			reportRows = append(reportRows, utils.AssetCertificateSheetRow{
				ComponentName:         row.ComponentName,
				ComponentID:           row.ComponentDisplayID,
				ComponentSerialNumber: row.ComponentSerialNumber,
				CertificateNumber:     row.CertificateNumber,
				IssueDate:             issueDateStr,
				ExpiryDate:            expiryDateStr,
				IMCAD018Details:       row.ImcaD018,
				TestType:              row.TestType,
				Status:                status,
			})
		}

		generatedAt := time.Now()
		pdfBytes, err := utils.BuildAssetCertificateSheetPDF(generatedAt, asset.Name, asset.DisplayID, reportRows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate asset certificate sheet"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("generated_by", userID).
			Str("asset_id", assetID.String()).
			Int("row_count", len(reportRows)).
			Msg("asset component certificate sheet generated")

		filename := fmt.Sprintf("asset-%s-certificate-sheet-%s.pdf", asset.DisplayID, generatedAt.Format("20060102-150405"))
		c.Header("Content-Type", "application/pdf")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		c.Data(http.StatusOK, "application/pdf", pdfBytes)
	}
}

func ForceRenotifyCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)
		if _, err := queries.GetCertificateByID(ctx, certificateID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate"})
			return
		}

		keyPrefix := fmt.Sprintf("cert-expiry:%s:%%", certificateID.String())
		deleted, err := queries.DeleteCertificateNotificationDeliveriesByKeyPrefix(ctx, db.DeleteCertificateNotificationDeliveriesByKeyPrefixParams{
			SourceID:       certificateID,
			IdempotencyKey: keyPrefix,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear notification history"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("certificate_id", certificateID.String()).
			Int64("cleared_tasks", deleted).
			Str("triggered_by", userID).
			Msg("notification history cleared for certificate")

		c.JSON(http.StatusOK, gin.H{
			"message":       "notification history cleared; certificate will be re-notified on next scheduler run",
			"cleared_tasks": deleted,
		})
	}
}
