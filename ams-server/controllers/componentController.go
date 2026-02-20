package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

type ComponentInput struct {
	AssetID        string `json:"asset_id" validate:"required"`
	Name           string `json:"name" validate:"required,min=2,max=200"`
	SerialNumber   string `json:"serial_number"`
	Manufacturer   string `json:"manufacturer"`
	Description    string `json:"description"`
	EquipmentType  string `json:"equipment_type"`
	Structure      string `json:"structure"`
	Model          string `json:"model"`
	Class          string `json:"class"`
	ClassCode      string `json:"class_code"`
	SafetyCritical string `json:"safety_critical" validate:"required,oneof=YES NO"`
}

type PatchComponentInput struct {
	Name           *string `json:"name" validate:"omitempty,min=2,max=200"`
	SerialNumber   *string `json:"serial_number"`
	Manufacturer   *string `json:"manufacturer"`
	Description    *string `json:"description"`
	EquipmentType  *string `json:"equipment_type"`
	Structure      *string `json:"structure"`
	Model          *string `json:"model"`
	Class          *string `json:"class"`
	ClassCode      *string `json:"class_code"`
	SafetyCritical *string `json:"safety_critical" validate:"omitempty,oneof=YES NO"`
}

func GetComponents(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		components, err := queries.GetAllComponents(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch components"})
			return
		}

		c.JSON(http.StatusOK, components)
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
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
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

		queries := db.New(pool)

		components, err := queries.GetComponentsByAssetID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch components"})
			return
		}

		c.JSON(http.StatusOK, components)
	}
}

func AddComponent(pool *pgxpool.Pool) gin.HandlerFunc {
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

		var input ComponentInput
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

		// Verify the asset exists before adding a component to it
		_, err = queries.GetAssetByID(ctx, input.AssetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		component, err := queries.CreateComponent(ctx, db.CreateComponentParams{
			ComponentID:    uuid.New().String(),
			AssetID:        input.AssetID,
			Name:           input.Name,
			SerialNumber:   input.SerialNumber,
			Manufacturer:   input.Manufacturer,
			Description:    input.Description,
			EquipmentType:  input.EquipmentType,
			Structure:      input.Structure,
			Model:          input.Model,
			Class:          input.Class,
			ClassCode:      input.ClassCode,
			SafetyCritical: input.SafetyCritical,
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
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}
		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to update component"})
			return
		}

		componentID := c.Param("component_id")

		var input ComponentInput
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

		rows, err := queries.UpdateComponent(ctx, db.UpdateComponentParams{
			Name:           input.Name,
			SerialNumber:   input.SerialNumber,
			Manufacturer:   input.Manufacturer,
			Description:    input.Description,
			EquipmentType:  input.EquipmentType,
			Structure:      input.Structure,
			Model:          input.Model,
			Class:          input.Class,
			ClassCode:      input.ClassCode,
			SafetyCritical: input.SafetyCritical,
			ComponentID:    componentID,
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
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role not found in context"})
			return
		}
		if role != "ADMIN" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed to delete component"})
			return
		}

		componentID := c.Param("component_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		rows, err := queries.DeleteComponent(ctx, componentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete component"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "component not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "component deleted successfully"})
	}
}
