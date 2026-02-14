package controllers

import (
	"context"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	database "github.com/maisarasherif/asset-management-system/ams-server/database"
	"github.com/maisarasherif/asset-management-system/ams-server/models"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func GetCertificates(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		var certificates []models.Certificate

		cursor, err := certificateCollection.Find(ctx, bson.M{})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch certificates."})
			return
		}
		defer cursor.Close(ctx)

		if err = cursor.All(ctx, &certificates); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode certificates."})
			return

		}

		c.JSON(http.StatusOK, certificates)
	}
}

func GetCertificate(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		certificateID := c.Param("certificate_id")

		if certificateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "certificate id is required"})
			return
		}
		var certificateStruct models.Certificate

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		err := certificateCollection.FindOne(ctx, bson.M{"certificate_id": certificateID}).Decode(&certificateStruct)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		c.JSON(http.StatusOK, certificateStruct)
	}
}

func GetCertificatesByComponent(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		componentID := c.Param("component_id")

		if componentID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "component id is required"})
			return
		}

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		var certificates []models.Certificate

		cursor, err := certificateCollection.Find(ctx, bson.M{"component_id": componentID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch certificates."})
			return
		}
		defer cursor.Close(ctx)

		if err = cursor.All(ctx, &certificates); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode certificates."})
			return
		}

		c.JSON(http.StatusOK, certificates)
	}
}

func AddCertificate(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {

		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to add certificate"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var certificate models.Certificate
		if err := c.ShouldBindJSON(&certificate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(certificate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed!", "details": err.Error()})
			return
		}

		certificate.CreatedAt = time.Now()
		certificate.UpdatedAt = time.Now()

		// Determine status based on expiry date
		now := time.Now()
		daysUntilExpiry := int(certificate.ExpiryDate.Sub(now).Hours() / 24)

		if daysUntilExpiry < 0 {
			certificate.Status = "EXPIRED"
		} else if daysUntilExpiry <= 30 {
			certificate.Status = "EXPIRING_SOON"
		} else {
			certificate.Status = "VALID"
		}

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		result, err := certificateCollection.InsertOne(ctx, certificate)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add certificate"})
			return
		}

		c.JSON(http.StatusCreated, result)

	}
}

func UpdateCertificate(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to update certificate"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		certificateID := c.Param("certificate_id")
		if certificateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "certificate id is required"})
			return
		}

		var certificate models.Certificate
		if err := c.ShouldBindJSON(&certificate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		certificate.UpdatedAt = time.Now()

		// Determine status based on expiry date
		now := time.Now()
		daysUntilExpiry := int(certificate.ExpiryDate.Sub(now).Hours() / 24)

		if daysUntilExpiry < 0 {
			certificate.Status = "EXPIRED"
		} else if daysUntilExpiry <= 30 {
			certificate.Status = "EXPIRING_SOON"
		} else {
			certificate.Status = "VALID"
		}

		updateData := bson.M{
			"$set": bson.M{
				"component_id":      certificate.ComponentID,
				"certificate_name":  certificate.CertificateName,
				"issue_date":        certificate.IssueDate,
				"expiry_date":       certificate.ExpiryDate,
				"certificate_file":  certificate.CertificateFile,
				"issuing_authority": certificate.IssuingAuthority,
				"status":            certificate.Status,
				"updated_at":        certificate.UpdatedAt,
			},
		}

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		result, err := certificateCollection.UpdateOne(ctx, bson.M{"certificate_id": certificateID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update certificate"})
			return
		}

		if result.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "certificate updated successfully"})
	}
}

func DeleteCertificate(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to delete certificate"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		certificateID := c.Param("certificate_id")
		if certificateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "certificate id is required"})
			return
		}

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		result, err := certificateCollection.DeleteOne(ctx, bson.M{"certificate_id": certificateID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete certificate"})
			return
		}

		if result.DeletedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "certificate deleted successfully"})
	}
}

func GetExpiringCertificates(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		err := godotenv.Load(".env")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load .env file"})
			return
		}

		daysThresholdStr := os.Getenv("EXPIRY_ALERT_DAYS")
		var daysThreshold int = 30
		if daysThresholdStr != "" {
			if threshold, err := strconv.Atoi(daysThresholdStr); err == nil {
				daysThreshold = threshold
			}
		}

		thresholdDate := time.Now().AddDate(0, 0, daysThreshold)

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		filter := bson.M{
			"expiry_date": bson.M{
				"$lte": thresholdDate,
				"$gte": time.Now(),
			},
		}

		var certificates []models.Certificate

		cursor, err := certificateCollection.Find(ctx, filter)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch expiring certificates."})
			return
		}
		defer cursor.Close(ctx)

		if err = cursor.All(ctx, &certificates); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode certificates."})
			return
		}

		c.JSON(http.StatusOK, certificates)
	}
}
