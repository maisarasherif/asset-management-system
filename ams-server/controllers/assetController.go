package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	database "github.com/maisarasherif/asset-management-system/ams-server/database"
	"github.com/maisarasherif/asset-management-system/ams-server/models"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

var validate = validator.New()

func GetAssets(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		var assets []models.Asset

		cursor, err := assetCollection.Find(ctx, bson.M{})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch assets."})
			return
		}
		defer cursor.Close(ctx)

		if err = cursor.All(ctx, &assets); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode assets."})
			return

		}

		c.JSON(http.StatusOK, assets)
	}
}

func GetAsset(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		assetID := c.Param("asset_id")

		if assetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "asset id is required"})
			return
		}
		var assetStruct models.Asset

		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		err := assetCollection.FindOne(ctx, bson.M{"asset_id": assetID}).Decode(&assetStruct)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		c.JSON(http.StatusOK, assetStruct)
	}
}

func AddAsset(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {

		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to add asset"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var asset models.Asset
		if err := c.ShouldBindJSON(&asset); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(asset); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed!", "details": err.Error()})
			return
		}

		asset.CreatedAt = time.Now()
		asset.UpdatedAt = time.Now()

		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		result, err := assetCollection.InsertOne(ctx, asset)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
			return
		}

		c.JSON(http.StatusCreated, result)

	}
}

func UpdateAsset(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to update asset"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		assetID := c.Param("asset_id")
		if assetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "asset id is required"})
			return
		}

		var asset models.Asset
		if err := c.ShouldBindJSON(&asset); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		asset.UpdatedAt = time.Now()

		updateData := bson.M{
			"$set": bson.M{
				"name":        asset.Name,
				"category_id": asset.CategoryID,
				"photo":       asset.Photo,
				"datasheet":   asset.Datasheet,
				"description": asset.Description,
				"status":      asset.Status,
				"components":  asset.Components,
				"updated_at":  asset.UpdatedAt,
			},
		}

		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		result, err := assetCollection.UpdateOne(ctx, bson.M{"asset_id": assetID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			return
		}

		if result.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}

func DeleteAsset(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to delete asset"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		assetID := c.Param("asset_id")
		if assetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "asset id is required"})
			return
		}

		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		result, err := assetCollection.DeleteOne(ctx, bson.M{"asset_id": assetID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete asset"})
			return
		}

		if result.DeletedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset deleted successfully"})
	}
}

// Add this function to your assetController.go

func PatchAsset(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to update asset"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		assetID := c.Param("asset_id")
		if assetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "asset id is required"})
			return
		}

		// Accept any fields in the request
		var updateFields map[string]interface{}
		if err := c.ShouldBindJSON(&updateFields); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		// Always update the updated_at field
		updateFields["updated_at"] = time.Now()

		updateData := bson.M{
			"$set": updateFields,
		}

		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		result, err := assetCollection.UpdateOne(ctx, bson.M{"asset_id": assetID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			return
		}

		if result.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}
