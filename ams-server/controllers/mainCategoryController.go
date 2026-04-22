package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func GetMainCategories(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		mainCategories, err := queries.GetAllMainCategoriesPaginated(ctx, db.GetAllMainCategoriesPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main categories"})
			return
		}

		total, err := queries.CountMainCategories(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count main categories"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: mainCategories,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		mainCategoryID, ok := utils.ParseUUIDParam(c, "main_category_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		mainCategory, err := queries.GetMainCategoryByID(ctx, mainCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main category"})
			return
		}

		c.JSON(http.StatusOK, mainCategory)
	}
}

func AddMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.MainCategoryInput
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

		mainCategory, err := queries.CreateMainCategory(ctx, db.CreateMainCategoryParams{
			SortOrder:        input.SortOrder,
			MainCategoryName: input.MainCategoryName,
			Description:      input.Description,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "main category sort order is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add main category"})
			return
		}

		c.JSON(http.StatusCreated, mainCategory)
	}
}

func UpdateMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		mainCategoryID, ok := utils.ParseUUIDParam(c, "main_category_id")
		if !ok {
			return
		}

		var input dto.MainCategoryInput
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

		rows, err := queries.UpdateMainCategory(ctx, db.UpdateMainCategoryParams{
			SortOrder:        input.SortOrder,
			MainCategoryName: input.MainCategoryName,
			Description:      input.Description,
			MainCategoryID:   mainCategoryID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "main category sort order is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update main category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "main category updated successfully"})
	}
}

func PatchMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		mainCategoryID, ok := utils.ParseUUIDParam(c, "main_category_id")
		if !ok {
			return
		}

		var input dto.PatchMainCategoryInput
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

		existing, err := queries.GetMainCategoryByID(ctx, mainCategoryID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
			return
		}

		mainCategoryName := existing.MainCategoryName
		description := existing.Description
		sortOrder := existing.SortOrder

		if input.MainCategoryName != nil {
			mainCategoryName = *input.MainCategoryName
		}
		if input.Description != nil {
			description = *input.Description
		}
		if input.SortOrder != nil {
			sortOrder = *input.SortOrder
		}

		rows, err := queries.UpdateMainCategory(ctx, db.UpdateMainCategoryParams{
			SortOrder:        sortOrder,
			MainCategoryName: mainCategoryName,
			Description:      description,
			MainCategoryID:   mainCategoryID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "main category sort order is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update main category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "main category updated successfully"})
	}
}

func DeleteMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		mainCategoryID, ok := utils.ParseUUIDParam(c, "main_category_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

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

		count, err := queries.CountCategoriesByMainCategoryID(ctx, &mainCategoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check categories"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "main category has categories assigned to it"})
			return
		}

		rows, err := queries.DeleteMainCategory(ctx, mainCategoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete main category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "main category deleted successfully"})
	}
}
