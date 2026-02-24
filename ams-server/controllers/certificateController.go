package controllers

import (
	"context"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		c.JSON(http.StatusOK, certificate)
	}
}

func GetCertificatesByComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

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

		certificate, err := queries.CreateCertificate(ctx, db.CreateCertificateParams{
			CertificateID:    uuid.New().String(),
			ComponentID:      input.ComponentID,
			CertificateName:  input.CertificateName,
			IssueDate:        input.IssueDate,
			ExpiryDate:       input.ExpiryDate,
			CertificateFile:  input.CertificateFile,
			IssuingAuthority: input.IssuingAuthority,
			Status:           computeCertificateStatus(input.ExpiryDate),
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

		newStatus := computeCertificateStatus(input.ExpiryDate)

		rows, err := queries.UpdateCertificate(ctx, db.UpdateCertificateParams{
			ComponentID:      input.ComponentID,
			CertificateName:  input.CertificateName,
			IssueDate:        input.IssueDate,
			ExpiryDate:       input.ExpiryDate,
			CertificateFile:  input.CertificateFile,
			IssuingAuthority: input.IssuingAuthority,
			Status:           newStatus,
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

		if expiryDate.Before(issueDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expiry date must be after issue date"})
			return
		}

		_, err = queries.GetComponentByID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
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
