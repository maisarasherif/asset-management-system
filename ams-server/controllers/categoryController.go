package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
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

func GetCategoriesByMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		mainCategoryID := c.Param("main_category_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		_, err := queries.GetMainCategoryByID(ctx, mainCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main category"})
			return
		}

		categories, err := queries.GetCategoriesByMainCategoryIDPaginated(ctx, db.GetCategoriesByMainCategoryIDPaginatedParams{
			MainCategoryID: &mainCategoryID,
			Limit:          limit,
			Offset:         offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch categories"})
			return
		}

		total, err := queries.CountCategoriesByMainCategoryIDPaginated(ctx, &mainCategoryID)
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
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch category"})
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

		_, err := queries.GetMainCategoryByID(ctx, input.MainCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main category"})
			return
		}

		categoryID, err := utils.GenerateCategoryID(ctx, queries)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate category id"})
			return
		}

		category, err := queries.CreateCategory(ctx, db.CreateCategoryParams{
			CategoryID:     categoryID,
			MainCategoryID: &input.MainCategoryID,
			CategoryName:   input.CategoryName,
			Description:    input.Description,
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

		_, err := queries.GetMainCategoryByID(ctx, input.MainCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main category"})
			return
		}

		rows, err := queries.UpdateCategory(ctx, db.UpdateCategoryParams{
			MainCategoryID: &input.MainCategoryID,
			CategoryName:   input.CategoryName,
			Description:    input.Description,
			CategoryID:     categoryID,
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

		_, err := queries.GetCategoryByID(ctx, categoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch category"})
			return
		}

		count, err := queries.CountComponentsByCategoryID(ctx, categoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check components"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "category has components assigned to it"})
			return
		}

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

func PatchCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID := c.Param("category_id")

		var input dto.PatchCategoryInput
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

		existing, err := queries.GetCategoryByID(ctx, categoryID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		mainCategoryID := existing.MainCategoryID
		categoryName := existing.CategoryName
		description := existing.Description

		if input.MainCategoryID != nil {
			mainCategoryID = input.MainCategoryID
		}
		if input.CategoryName != nil {
			categoryName = *input.CategoryName
		}
		if input.Description != nil {
			description = *input.Description
		}

		if mainCategoryID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "main category is required"})
			return
		}

		_, err = queries.GetMainCategoryByID(ctx, *mainCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main category"})
			return
		}

		rows, err := queries.UpdateCategory(ctx, db.UpdateCategoryParams{
			MainCategoryID: mainCategoryID,
			CategoryName:   categoryName,
			Description:    description,
			CategoryID:     categoryID,
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
