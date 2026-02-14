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
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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

		// Determine status based on expiry date BEFORE validation
		now := time.Now()
		daysUntilExpiry := int(certificate.ExpiryDate.Sub(now).Hours() / 24)

		if daysUntilExpiry < 0 {
			certificate.Status = "EXPIRED"
		} else if daysUntilExpiry <= 30 {
			certificate.Status = "EXPIRING_SOON"
		} else {
			certificate.Status = "VALID"
		}

		certificate.CreatedAt = time.Now()
		certificate.UpdatedAt = time.Now()

		if err := validate.Struct(certificate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed!", "details": err.Error()})
			return
		}

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

		result, err := certificateCollection.InsertOne(ctx, certificate)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add certificate"})
			return
		}

		// Automatically update the component to include this certificate in its certificates array
		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		// First, ensure the certificates field is an array (not null)
		initData := bson.M{
			"$set": bson.M{
				"certificates": bson.A{},
			},
		}
		componentCollection.UpdateOne(ctx, bson.M{
			"component_id": certificate.ComponentID,
			"certificates": nil,
		}, initData)

		// Now push the certificate
		updateData := bson.M{
			"$push": bson.M{
				"certificates": certificate,
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
		}

		updateResult, err := componentCollection.UpdateOne(ctx, bson.M{"component_id": certificate.ComponentID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "certificate added but failed to update component", "details": err.Error()})
			return
		}

		if updateResult.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate added but component not found", "component_id": certificate.ComponentID})
			return
		}

		// Also update the component in the asset's components array
		// First, get the component to know which asset it belongs to
		var component models.Component
		err = componentCollection.FindOne(ctx, bson.M{"component_id": certificate.ComponentID}).Decode(&component)

		if err == nil && component.AssetID != "" {
			var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

			// Initialize certificates array in the component within asset if null
			initAssetData := bson.M{
				"$set": bson.M{
					"components.$[elem].certificates": bson.A{},
				},
			}

			arrayFiltersInit := bson.A{
				bson.M{
					"elem.component_id": certificate.ComponentID,
					"elem.certificates": nil,
				},
			}

			optsInit := options.UpdateOne().SetArrayFilters(arrayFiltersInit)
			assetCollection.UpdateOne(ctx, bson.M{"asset_id": component.AssetID}, initAssetData, optsInit)

			// Now push the certificate to the component's certificates array within the asset
			assetUpdateData := bson.M{
				"$push": bson.M{
					"components.$[elem].certificates": certificate,
				},
				"$set": bson.M{
					"updated_at": time.Now(),
				},
			}

			arrayFilters := bson.A{
				bson.M{"elem.component_id": certificate.ComponentID},
			}

			opts := options.UpdateOne().SetArrayFilters(arrayFilters)

			assetCollection.UpdateOne(ctx, bson.M{"asset_id": component.AssetID}, assetUpdateData, opts)
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

		var certificateCollection *mongo.Collection = database.OpenCollection("Certificates", client)

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

		result, err := certificateCollection.UpdateOne(ctx, bson.M{"certificate_id": certificateID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update certificate"})
			return
		}

		if result.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		// Also update the certificate in the component's certificates array in place
		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		componentUpdateData := bson.M{
			"$set": bson.M{
				"certificates.$[elem].certificate_name":  certificate.CertificateName,
				"certificates.$[elem].issue_date":        certificate.IssueDate,
				"certificates.$[elem].expiry_date":       certificate.ExpiryDate,
				"certificates.$[elem].certificate_file":  certificate.CertificateFile,
				"certificates.$[elem].issuing_authority": certificate.IssuingAuthority,
				"certificates.$[elem].status":            certificate.Status,
				"certificates.$[elem].updated_at":        certificate.UpdatedAt,
				"updated_at":                             time.Now(),
			},
		}

		arrayFilters := bson.A{
			bson.M{"elem.certificate_id": certificateID},
		}

		opts := options.UpdateOne().SetArrayFilters(arrayFilters)

		_, err = componentCollection.UpdateOne(ctx, bson.M{"component_id": certificate.ComponentID}, componentUpdateData, opts)

		if err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "certificate updated successfully", "warning": "failed to sync with component"})
			return
		}

		// Also update the certificate in the asset's component's certificates array
		var component models.Component
		componentCollection.FindOne(ctx, bson.M{"component_id": certificate.ComponentID}).Decode(&component)

		if component.AssetID != "" {
			var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

			assetUpdateData := bson.M{
				"$set": bson.M{
					"components.$[comp].certificates.$[cert].certificate_name":  certificate.CertificateName,
					"components.$[comp].certificates.$[cert].issue_date":        certificate.IssueDate,
					"components.$[comp].certificates.$[cert].expiry_date":       certificate.ExpiryDate,
					"components.$[comp].certificates.$[cert].certificate_file":  certificate.CertificateFile,
					"components.$[comp].certificates.$[cert].issuing_authority": certificate.IssuingAuthority,
					"components.$[comp].certificates.$[cert].status":            certificate.Status,
					"components.$[comp].certificates.$[cert].updated_at":        certificate.UpdatedAt,
					"updated_at": time.Now(),
				},
			}

			assetArrayFilters := bson.A{
				bson.M{"comp.component_id": certificate.ComponentID},
				bson.M{"cert.certificate_id": certificateID},
			}

			assetOpts := options.UpdateOne().SetArrayFilters(assetArrayFilters)

			assetCollection.UpdateOne(ctx, bson.M{"asset_id": component.AssetID}, assetUpdateData, assetOpts)
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

		// First, get the certificate to know which component it belongs to
		var certificate models.Certificate
		err = certificateCollection.FindOne(ctx, bson.M{"certificate_id": certificateID}).Decode(&certificate)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		// Delete from Certificates collection
		result, err := certificateCollection.DeleteOne(ctx, bson.M{"certificate_id": certificateID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete certificate"})
			return
		}

		if result.DeletedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
			return
		}

		// Remove the certificate from the component's certificates array
		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		pullData := bson.M{
			"$pull": bson.M{
				"certificates": bson.M{"certificate_id": certificateID},
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
		}

		_, err = componentCollection.UpdateOne(ctx, bson.M{"component_id": certificate.ComponentID}, pullData)

		if err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "certificate deleted successfully", "warning": "failed to sync with component"})
			return
		}

		// Also remove the certificate from the asset's component's certificates array
		var component models.Component
		componentCollection.FindOne(ctx, bson.M{"component_id": certificate.ComponentID}).Decode(&component)

		if component.AssetID != "" {
			var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

			assetPullData := bson.M{
				"$pull": bson.M{
					"components.$[elem].certificates": bson.M{"certificate_id": certificateID},
				},
				"$set": bson.M{
					"updated_at": time.Now(),
				},
			}

			assetArrayFilters := bson.A{
				bson.M{"elem.component_id": certificate.ComponentID},
			}

			assetOpts := options.UpdateOne().SetArrayFilters(assetArrayFilters)

			assetCollection.UpdateOne(ctx, bson.M{"asset_id": component.AssetID}, assetPullData, assetOpts)
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
