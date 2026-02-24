package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

var validate = validator.New()

func GetAssets(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		assets, err := queries.GetAllAssetsPaginated(ctx, db.GetAllAssetsPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch assets"})
			return
		}

		total, err := queries.CountAssets(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count assets"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: assets,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID := c.Param("asset_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		asset, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		c.JSON(http.StatusOK, asset)
	}
}

func AddAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.AssetInput
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

		asset, err := queries.CreateAsset(ctx, db.CreateAssetParams{
			AssetID:         uuid.New().String(),
			Name:            input.Name,
			CategoryID:      input.CategoryID,
			Photo:           input.Photo,
			Datasheet:       input.Datasheet,
			Description:     input.Description,
			Status:          input.Status,
			Location:        input.Location,
			AssignedProject: input.AssignedProject,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
			return
		}

		c.JSON(http.StatusCreated, asset)
	}
}

func UpdateAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID := c.Param("asset_id")

		var input dto.AssetInput
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

		rows, err := queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:            input.Name,
			CategoryID:      input.CategoryID,
			Photo:           input.Photo,
			Datasheet:       input.Datasheet,
			Description:     input.Description,
			Status:          input.Status,
			Location:        input.Location,
			AssignedProject: input.AssignedProject,
			AssetID:         assetID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}

func DeleteAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID := c.Param("asset_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		rows, err := queries.DeleteAsset(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete asset"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Warn().
			Str("asset_id", assetID).
			Str("asset_name", existing.Name).
			Str("deleted_by", userID).
			Msg("asset deleted")

		c.JSON(http.StatusOK, gin.H{"message": "asset deleted successfully"})
	}
}

func PatchAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID := c.Param("asset_id")

		var input dto.PatchAssetInput
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

		existing, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		name := existing.Name
		categoryID := existing.CategoryID
		photo := existing.Photo
		datasheet := existing.Datasheet
		description := existing.Description
		status := existing.Status
		location := existing.Location
		assignedProject := existing.AssignedProject

		if input.Name != nil {
			name = *input.Name
		}
		if input.CategoryID != nil {
			categoryID = *input.CategoryID
		}
		if input.Photo != nil {
			photo = *input.Photo
		}
		if input.Datasheet != nil {
			datasheet = *input.Datasheet
		}
		if input.Description != nil {
			description = *input.Description
		}
		if input.Status != nil {
			status = *input.Status
		}
		if input.Location != nil {
			location = *input.Location
		}
		if input.AssignedProject != nil {
			assignedProject = *input.AssignedProject
		}

		rows, err := queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:            name,
			CategoryID:      categoryID,
			Photo:           photo,
			Datasheet:       datasheet,
			Description:     description,
			Status:          status,
			Location:        location,
			AssignedProject: assignedProject,
			AssetID:         assetID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}
