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
)

type CertificateInput struct {
	ComponentID      string    `json:"component_id" validate:"required"`
	CertificateName  string    `json:"certificate_name" validate:"required,min=2,max=200"`
	IssueDate        time.Time `json:"issue_date" validate:"required"`
	ExpiryDate       time.Time `json:"expiry_date" validate:"required"`
	CertificateFile  string    `json:"certificate_file" validate:"omitempty,url"`
	IssuingAuthority string    `json:"issuing_authority" validate:"required,min=2,max=200"`
}

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

		queries := db.New(pool)

		certificates, err := queries.GetAllCertificates(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificates"})
			return
		}

		c.JSON(http.StatusOK, certificates)
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

		queries := db.New(pool)

		certificates, err := queries.GetCertificatesByComponentID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificates"})
			return
		}

		c.JSON(http.StatusOK, certificates)
	}
}

func AddCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input CertificateInput
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

		// Verify the component exists before adding a certificate to it
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

		c.JSON(http.StatusCreated, certificate)
	}
}

func UpdateCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		var input CertificateInput
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

		rows, err := queries.UpdateCertificate(ctx, db.UpdateCertificateParams{
			ComponentID:      input.ComponentID,
			CertificateName:  input.CertificateName,
			IssueDate:        input.IssueDate,
			ExpiryDate:       input.ExpiryDate,
			CertificateFile:  input.CertificateFile,
			IssuingAuthority: input.IssuingAuthority,
			Status:           computeCertificateStatus(input.ExpiryDate),
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

		c.JSON(http.StatusOK, gin.H{"message": "certificate updated successfully"})
	}
}

func DeleteCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certificateID := c.Param("certificate_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		rows, err := queries.DeleteCertificate(ctx, certificateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete certificate"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

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
