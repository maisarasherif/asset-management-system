package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	//"github.com/go-playground/validator/v10"
	database "github.com/maisarasherif/asset-management-system/ams-server/database"
	"github.com/maisarasherif/asset-management-system/ams-server/models"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

//var validate = validator.New()

func GetCategories(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var categoryCollection *mongo.Collection = database.OpenCollection("Categories", client)

		var categories []models.Category

		cursor, err := categoryCollection.Find(ctx, bson.M{})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch categories."})
			return
		}
		defer cursor.Close(ctx)

		if err = cursor.All(ctx, &categories); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode categories."})
			return

		}

		c.JSON(http.StatusOK, categories)
	}
}

func GetCategory(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		categoryID := c.Param("category_id")

		if categoryID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "category id is required"})
			return
		}
		var categoryStruct models.Category

		var categoryCollection *mongo.Collection = database.OpenCollection("Categories", client)

		err := categoryCollection.FindOne(ctx, bson.M{"category_id": categoryID}).Decode(&categoryStruct)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		c.JSON(http.StatusOK, categoryStruct)
	}
}

func AddCategory(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {

		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to add category"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var category models.Category
		if err := c.ShouldBindJSON(&category); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(category); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed!", "details": err.Error()})
			return
		}

		category.CreatedAt = time.Now()
		category.UpdatedAt = time.Now()

		var categoryCollection *mongo.Collection = database.OpenCollection("Categories", client)

		result, err := categoryCollection.InsertOne(ctx, category)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add category"})
			return
		}

		c.JSON(http.StatusCreated, result)

	}
}

func UpdateCategory(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to update category"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		categoryID := c.Param("category_id")
		if categoryID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "category id is required"})
			return
		}

		var category models.Category
		if err := c.ShouldBindJSON(&category); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		category.UpdatedAt = time.Now()

		updateData := bson.M{
			"$set": bson.M{
				"category_name": category.CategoryName,
				"description":   category.Description,
				"updated_at":    category.UpdatedAt,
			},
		}

		var categoryCollection *mongo.Collection = database.OpenCollection("Categories", client)

		result, err := categoryCollection.UpdateOne(ctx, bson.M{"category_id": categoryID}, updateData)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update category"})
			return
		}

		if result.MatchedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "category updated successfully"})
	}
}

func DeleteCategory(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}

		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to delete category"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		categoryID := c.Param("category_id")
		if categoryID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "category id is required"})
			return
		}

		var categoryCollection *mongo.Collection = database.OpenCollection("Categories", client)

		result, err := categoryCollection.DeleteOne(ctx, bson.M{"category_id": categoryID})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete category"})
			return
		}

		if result.DeletedCount == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "category deleted successfully"})
	}
}
