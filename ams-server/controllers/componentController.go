package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	database "github.com/maisarasherif/asset-management-system/ams-server/database"
	"github.com/maisarasherif/asset-management-system/ams-server/models"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func GetComponents(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		var components []models.Component

		cursor, err := componentCollection.Find(ctx, bson.M{})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch components."})
			return
		}
		defer cursor.Close(ctx)

		if err = cursor.All(ctx, &components); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode components."})
			return

		}

		c.JSON(http.StatusOK, components)
	}
}

func GetComponent(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		componentID := c.Param("component_id")

		if componentID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "component id is required"})
			return
		}
		var componentStruct models.Component

		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		err := componentCollection.FindOne(ctx, bson.M{"component_id": componentID}).Decode(&componentStruct)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		c.JSON(http.StatusOK, componentStruct)
	}
}

func GetComponentsByAsset(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		assetID := c.Param("asset_id")

		if assetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "asset id is required"})
			return
		}

		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		var components []models.Component

		cursor, err := componentCollection.Find(ctx, bson.M{"asset_id": assetID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch components."})
			return
		}
		defer cursor.Close(ctx)

		if err = cursor.All(ctx, &components); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode components."})
			return
		}

		c.JSON(http.StatusOK, components)
	}
}

func AddComponent(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {

		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to add component"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var component models.Component
		if err := c.ShouldBindJSON(&component); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(component); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed!", "details": err.Error()})
			return
		}

		component.CreatedAt = time.Now()
		component.UpdatedAt = time.Now()

		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		result, err := componentCollection.InsertOne(ctx, component)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add component"})
			return
		}

		c.JSON(http.StatusCreated, result)

	}
}

func UpdateComponent(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to update component"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		componentID := c.Param("component_id")
		if componentID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "component id is required"})
			return
		}

		var component models.Component
		if err := c.ShouldBindJSON(&component); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		component.UpdatedAt = time.Now()

		updateData := bson.M{
			"$set": bson.M{
				"asset_id":      component.AssetID,
				"name":          component.Name,
				"serial_number": component.SerialNumber,
				"manufacturer":  component.Manufacturer,
				"description":   component.Description,
				"certificates":  component.Certificates,
				"updated_at":    component.UpdatedAt,
			},
		}

		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		result, err := componentCollection.UpdateOne(ctx, bson.M{"component_id": componentID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update component"})
			return
		}

		if result.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "component updated successfully"})
	}
}

func DeleteComponent(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to delete component"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		componentID := c.Param("component_id")
		if componentID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "component id is required"})
			return
		}

		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

		result, err := componentCollection.DeleteOne(ctx, bson.M{"component_id": componentID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete component"})
			return
		}

		if result.DeletedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "component deleted successfully"})
	}
}
