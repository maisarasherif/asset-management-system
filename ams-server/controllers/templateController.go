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
)

func GetAssetTemplates(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		templates, err := queries.GetAllActiveAssetTemplates(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch templates"})
			return
		}

		response := make([]dto.AssetTemplateResponse, 0, len(templates))
		for _, template := range templates {
			templateResponse, err := buildTemplateResponse(ctx, queries, template.TemplateID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build template response"})
				return
			}
			response = append(response, templateResponse)
		}

		c.JSON(http.StatusOK, response)
	}
}

func GetAssetTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		response, err := buildTemplateResponse(ctx, queries, templateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		c.JSON(http.StatusOK, response)
	}
}

func CreateAssetTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.AssetTemplateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.StructPartial(input, "Name"); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		templateID, err := createOrUpdateTemplate(ctx, queries, "", input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		response, err := buildTemplateResponse(ctx, queries, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build template response"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit template creation"})
			return
		}

		c.JSON(http.StatusCreated, response)
	}
}

func UpdateAssetTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")

		var input dto.AssetTemplateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.StructPartial(input, "Name"); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		if _, err := queries.GetActiveAssetTemplateByID(ctx, templateID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		if _, err := createOrUpdateTemplate(ctx, queries, templateID, input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := syncLinkedAssetsForTemplate(ctx, queries, templateID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sync linked assets"})
			return
		}

		response, err := buildTemplateResponse(ctx, queries, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build template response"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit template update"})
			return
		}

		c.JSON(http.StatusOK, response)
	}
}

func DeleteAssetTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		if _, err := queries.GetActiveAssetTemplateByID(ctx, templateID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		linkedAssets, err := queries.GetAssetsByTemplateID(ctx, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch linked assets"})
			return
		}

		for _, asset := range linkedAssets {
			if _, err := queries.UpdateAssetTemplateID(ctx, db.UpdateAssetTemplateIDParams{
				TemplateID: "",
				AssetID:    asset.AssetID,
			}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unlink linked assets"})
				return
			}
		}

		rows, err := queries.SoftDeleteAssetTemplate(ctx, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete template"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit template deletion"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":         "template deleted successfully",
			"unlinked_assets": len(linkedAssets),
		})
	}
}
