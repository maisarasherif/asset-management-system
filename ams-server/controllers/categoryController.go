package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func GetCategories(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		categories, err := queries.GetAllCategoriesPaginated(ctx, db.GetAllCategoriesPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch categories"})
			return
		}

		total, err := queries.CountCategories(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count categories"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: categories,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID := c.Param("category_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		category, err := queries.GetCategoryByID(ctx, categoryID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		c.JSON(http.StatusOK, category)
	}
}

func AddCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.CategoryInput
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

		category, err := queries.CreateCategory(ctx, db.CreateCategoryParams{
			CategoryID:   uuid.New().String(),
			CategoryName: input.CategoryName,
			Description:  input.Description,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add category"})
			return
		}

		c.JSON(http.StatusCreated, category)
	}
}

func UpdateCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID := c.Param("category_id")

		var input dto.CategoryInput
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

		rows, err := queries.UpdateCategory(ctx, db.UpdateCategoryParams{
			CategoryName: input.CategoryName,
			Description:  input.Description,
			CategoryID:   categoryID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "category updated successfully"})
	}
}

func DeleteCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID := c.Param("category_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		rows, err := queries.DeleteCategory(ctx, categoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "category deleted successfully"})
	}
}
