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
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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

		// Automatically update the asset to include this component in its components array
		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		// First, ensure the components field is an array (not null)
		initData := bson.M{
			"$set": bson.M{
				"components": bson.A{},
			},
		}
		assetCollection.UpdateOne(ctx, bson.M{
			"asset_id":   component.AssetID,
			"components": nil,
		}, initData)

		// Now push the component
		updateData := bson.M{
			"$push": bson.M{
				"components": component,
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
		}

		updateResult, err := assetCollection.UpdateOne(ctx, bson.M{"asset_id": component.AssetID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "component added but failed to update asset", "details": err.Error()})
			return
		}

		if updateResult.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component added but asset not found", "asset_id": component.AssetID})
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

		var componentCollection *mongo.Collection = database.OpenCollection("Components", client)

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

		result, err := componentCollection.UpdateOne(ctx, bson.M{"component_id": componentID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update component"})
			return
		}

		if result.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		// Also update the component in the asset's components array in place
		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		assetUpdateData := bson.M{
			"$set": bson.M{
				"components.$[elem].name":          component.Name,
				"components.$[elem].serial_number": component.SerialNumber,
				"components.$[elem].manufacturer":  component.Manufacturer,
				"components.$[elem].description":   component.Description,
				"components.$[elem].updated_at":    component.UpdatedAt,
				"updated_at":                       time.Now(),
			},
		}

		arrayFilters := bson.A{
			bson.M{"elem.component_id": componentID},
		}

		opts := options.UpdateOne().SetArrayFilters(arrayFilters)

		_, err = assetCollection.UpdateOne(ctx, bson.M{"asset_id": component.AssetID}, assetUpdateData, opts)

		if err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "component updated successfully", "warning": "failed to sync with asset"})
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

		// First, get the component to know which asset it belongs to
		var component models.Component
		err = componentCollection.FindOne(ctx, bson.M{"component_id": componentID}).Decode(&component)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		// Delete from Components collection
		result, err := componentCollection.DeleteOne(ctx, bson.M{"component_id": componentID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete component"})
			return
		}

		if result.DeletedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		// Remove the component from the asset's components array
		var assetCollection *mongo.Collection = database.OpenCollection("Assets", client)

		pullData := bson.M{
			"$pull": bson.M{
				"components": bson.M{"component_id": componentID},
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
		}

		_, err = assetCollection.UpdateOne(ctx, bson.M{"asset_id": component.AssetID}, pullData)

		if err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "component deleted successfully", "warning": "failed to sync with asset"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "component deleted successfully"})
	}
}
