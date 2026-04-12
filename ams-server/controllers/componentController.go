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
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func GetComponents(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		components, err := queries.GetAllComponentsPaginated(ctx, db.GetAllComponentsPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch components"})
			return
		}

		total, err := queries.CountComponents(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count components"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: components,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		component, err := queries.GetComponentByID(ctx, componentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch component"})
			return
		}

		c.JSON(http.StatusOK, component)
	}
}

func GetComponentsByAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID := c.Param("asset_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		_, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}

		components, err := queries.GetComponentsByAssetIDPaginated(ctx, db.GetComponentsByAssetIDPaginatedParams{
			AssetID: assetID,
			Limit:   limit,
			Offset:  offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch components"})
			return
		}

		total, err := queries.CountComponentsByAssetID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count components"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: components,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func AddComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.ComponentInput
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

		_, err := queries.GetAssetByID(ctx, input.AssetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}
		_, err = queries.GetCategoryByID(ctx, input.CategoryID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		component, err := queries.CreateComponent(ctx, db.CreateComponentParams{
			AssetID:         input.AssetID,
			CategoryID:      input.CategoryID,
			Name:            input.Name,
			SerialNumber:    input.SerialNumber,
			Manufacturer:    input.Manufacturer,
			Description:     input.Description,
			Location:        input.Location,
			AssignedProject: input.AssignedProject,
			EquipmentType:   input.EquipmentType,
			Structure:       input.Structure,
			Model:           input.Model,
			Class:           input.Class,
			ClassCode:       input.ClassCode,
			SafetyCritical:  input.SafetyCritical,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add component"})
			return
		}

		c.JSON(http.StatusCreated, component)
	}
}

func UpdateComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		var input dto.ComponentInput
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

		_, err := queries.GetCategoryByID(ctx, input.CategoryID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		rows, err := queries.UpdateComponent(ctx, db.UpdateComponentParams{
			CategoryID:      input.CategoryID,
			Name:            input.Name,
			SerialNumber:    input.SerialNumber,
			Manufacturer:    input.Manufacturer,
			Description:     input.Description,
			Location:        input.Location,
			AssignedProject: input.AssignedProject,
			EquipmentType:   input.EquipmentType,
			Structure:       input.Structure,
			Model:           input.Model,
			Class:           input.Class,
			ClassCode:       input.ClassCode,
			SafetyCritical:  input.SafetyCritical,
			ComponentID:     componentID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update component"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "component updated successfully"})
	}
}

func DeleteComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetComponentByID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		rows, err := queries.DeleteComponent(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete component"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Warn().
			Str("component_id", componentID).
			Str("component_name", existing.Name).
			Str("asset_id", existing.AssetID).
			Str("deleted_by", userID).
			Msg("component deleted")

		c.JSON(http.StatusOK, gin.H{"message": "component deleted successfully"})
	}
}

func PatchComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		componentID := c.Param("component_id")

		var input dto.PatchComponentInput
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

		existing, err := queries.GetComponentByID(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		name := existing.Name
		categoryID := existing.CategoryID
		serialNumber := existing.SerialNumber
		manufacturer := existing.Manufacturer
		description := existing.Description
		location := existing.Location
		assignedProject := existing.AssignedProject
		equipmentType := existing.EquipmentType
		structure := existing.Structure
		model := existing.Model
		class := existing.Class
		classCode := existing.ClassCode
		safetyCritical := existing.SafetyCritical

		if input.CategoryID != nil {
			categoryID = *input.CategoryID
		}
		if input.Name != nil {
			name = *input.Name
		}
		if input.SerialNumber != nil {
			serialNumber = *input.SerialNumber
		}
		if input.Manufacturer != nil {
			manufacturer = *input.Manufacturer
		}
		if input.Description != nil {
			description = *input.Description
		}
		if input.Location != nil {
			location = *input.Location
		}
		if input.AssignedProject != nil {
			assignedProject = *input.AssignedProject
		}
		if input.EquipmentType != nil {
			equipmentType = *input.EquipmentType
		}
		if input.Structure != nil {
			structure = *input.Structure
		}
		if input.Model != nil {
			model = *input.Model
		}
		if input.Class != nil {
			class = *input.Class
		}
		if input.ClassCode != nil {
			classCode = *input.ClassCode
		}
		if input.SafetyCritical != nil {
			safetyCritical = *input.SafetyCritical
		}

		_, err = queries.GetCategoryByID(ctx, categoryID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}

		rows, err := queries.UpdateComponent(ctx, db.UpdateComponentParams{
			CategoryID:      categoryID,
			Name:            name,
			SerialNumber:    serialNumber,
			Manufacturer:    manufacturer,
			Description:     description,
			Location:        location,
			AssignedProject: assignedProject,
			EquipmentType:   equipmentType,
			Structure:       structure,
			Model:           model,
			Class:           class,
			ClassCode:       classCode,
			SafetyCritical:  safetyCritical,
			ComponentID:     componentID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update component"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "component updated successfully"})
	}
}
