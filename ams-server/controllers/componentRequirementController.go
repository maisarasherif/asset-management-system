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

func GetComponentRequirements(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		if _, err := queries.GetComponentByID(ctx, componentID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch component"})
			return
		}

		rows, err := queries.GetActiveComponentRequirementsByComponentID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requirements"})
			return
		}

		c.JSON(http.StatusOK, mapRequirementRows(rows))
	}
}

func AddComponentRequirement(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		var input dto.ComponentRequirementInput
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

		component, err := queries.GetComponentByID(ctx, componentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch component"})
			return
		}

		asset, err := queries.GetAssetByID(ctx, component.AssetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}
		if asset.TemplateID != "" {
			c.JSON(http.StatusConflict, gin.H{"error": "template-linked assets can only be changed through their template"})
			return
		}

		if _, err := queries.GetTestTypeByID(ctx, input.TestID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
			return
		}

		sortOrder, err := queries.CountComponentRequirementsByComponentID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to compute requirement order"})
			return
		}

		requirementID, err := generateResourceID("req")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate requirement id"})
			return
		}

		if _, err := queries.CreateComponentRequirement(ctx, db.CreateComponentRequirementParams{
			RequirementID:               requirementID,
			ComponentID:                 componentID,
			SourceTemplateRequirementID: "",
			TestID:                      input.TestID,
			Label:                       input.Label,
			SortOrder:                   int32(sortOrder),
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add requirement"})
			return
		}

		rows, err := queries.GetActiveComponentRequirementsByComponentID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requirements"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit requirement creation"})
			return
		}

		c.JSON(http.StatusCreated, mapRequirementRows(rows))
	}
}

func UpdateComponentRequirement(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		requirementID := c.Param("requirement_id")

		var input dto.ComponentRequirementInput
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

		requirement, err := queries.GetComponentRequirementByID(ctx, requirementID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "requirement not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requirement"})
			return
		}

		component, err := queries.GetComponentByID(ctx, requirement.ComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch component"})
			return
		}

		asset, err := queries.GetAssetByID(ctx, component.AssetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}
		if asset.TemplateID != "" {
			c.JSON(http.StatusConflict, gin.H{"error": "template-linked assets can only be changed through their template"})
			return
		}

		if _, err := queries.GetTestTypeByID(ctx, input.TestID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
			return
		}

		if _, err := queries.UpdateComponentRequirement(ctx, db.UpdateComponentRequirementParams{
			ComponentID:   requirement.ComponentID,
			TestID:        input.TestID,
			Label:         input.Label,
			SortOrder:     requirement.SortOrder,
			RequirementID: requirementID,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update requirement"})
			return
		}

		rows, err := queries.GetActiveComponentRequirementsByComponentID(ctx, requirement.ComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requirements"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit requirement update"})
			return
		}

		c.JSON(http.StatusOK, mapRequirementRows(rows))
	}
}

func DeleteComponentRequirement(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		requirementID := c.Param("requirement_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		requirement, err := queries.GetComponentRequirementByID(ctx, requirementID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "requirement not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requirement"})
			return
		}

		component, err := queries.GetComponentByID(ctx, requirement.ComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch component"})
			return
		}

		asset, err := queries.GetAssetByID(ctx, component.AssetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}
		if asset.TemplateID != "" {
			c.JSON(http.StatusConflict, gin.H{"error": "template-linked assets can only be changed through their template"})
			return
		}

		rowsAffected, err := queries.ArchiveComponentRequirement(ctx, requirementID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete requirement"})
			return
		}
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "requirement not found"})
			return
		}

		rows, err := queries.GetActiveComponentRequirementsByComponentID(ctx, requirement.ComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requirements"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit requirement deletion"})
			return
		}

		c.JSON(http.StatusOK, mapRequirementRows(rows))
	}
}
