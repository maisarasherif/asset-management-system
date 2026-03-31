package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5"
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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		asset, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		if input.TemplateID != "" {
			if _, err := queries.GetActiveAssetTemplateByID(ctx, input.TemplateID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate template"})
				return
			}
		}

		assetID, err := generateAssetID(ctx, queries)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate asset id"})
			return
		}

		asset, err := queries.CreateAsset(ctx, db.CreateAssetParams{
			AssetID:         assetID,
			Name:            input.Name,
			Photo:           input.Photo,
			Datasheet:       input.Datasheet,
			Description:     input.Description,
			Status:          input.Status,
			Location:        input.Location,
			AssignedProject: input.AssignedProject,
			TemplateID:      input.TemplateID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
			return
		}

		if input.TemplateID != "" {
			if err := syncAssetStructureToTemplate(ctx, queries, asset.AssetID, input.TemplateID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to apply template"})
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset creation"})
			return
		}

		c.JSON(http.StatusCreated, asset)
	}
}

func AddAssetFromTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
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
		if input.TemplateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "template_id is required"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		if _, err := queries.GetActiveAssetTemplateByID(ctx, input.TemplateID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate template"})
			return
		}

		assetID, err := generateAssetID(ctx, queries)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate asset id"})
			return
		}

		asset, err := queries.CreateAsset(ctx, db.CreateAssetParams{
			AssetID:         assetID,
			Name:            input.Name,
			Photo:           input.Photo,
			Datasheet:       input.Datasheet,
			Description:     input.Description,
			Status:          input.Status,
			Location:        input.Location,
			AssignedProject: input.AssignedProject,
			TemplateID:      input.TemplateID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
			return
		}

		if err := syncAssetStructureToTemplate(ctx, queries, asset.AssetID, input.TemplateID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to apply template"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset creation"})
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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		existing, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}

		targetTemplateID := input.TemplateID
		if targetTemplateID != "" {
			if _, err := queries.GetActiveAssetTemplateByID(ctx, targetTemplateID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate template"})
				return
			}
		}

		templateChanged := existing.TemplateID != targetTemplateID
		if templateChanged && targetTemplateID != "" {
			if err := archiveActiveAssetStructure(ctx, queries, assetID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to archive existing asset structure"})
				return
			}
		}

		rows, err := queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:            input.Name,
			Photo:           input.Photo,
			Datasheet:       input.Datasheet,
			Description:     input.Description,
			Status:          input.Status,
			Location:        input.Location,
			AssignedProject: input.AssignedProject,
			TemplateID:      targetTemplateID,
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

		if templateChanged && targetTemplateID != "" {
			if err := syncAssetStructureToTemplate(ctx, queries, assetID, targetTemplateID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to apply template"})
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset update"})
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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		existing, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		name := existing.Name
		photo := existing.Photo
		datasheet := existing.Datasheet
		description := existing.Description
		status := existing.Status
		location := existing.Location
		assignedProject := existing.AssignedProject
		templateID := existing.TemplateID

		if input.Name != nil {
			name = *input.Name
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
		if input.TemplateID != nil {
			templateID = *input.TemplateID
		}

		if templateID != "" {
			if _, err := queries.GetActiveAssetTemplateByID(ctx, templateID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate template"})
				return
			}
		}

		templateChanged := existing.TemplateID != templateID
		if templateChanged && templateID != "" {
			if err := archiveActiveAssetStructure(ctx, queries, assetID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to archive existing asset structure"})
				return
			}
		}

		rows, err := queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:            name,
			Photo:           photo,
			Datasheet:       datasheet,
			Description:     description,
			Status:          status,
			Location:        location,
			AssignedProject: assignedProject,
			TemplateID:      templateID,
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

		if templateChanged && templateID != "" {
			if err := syncAssetStructureToTemplate(ctx, queries, assetID, templateID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to apply template"})
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset update"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}
