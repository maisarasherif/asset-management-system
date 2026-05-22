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

func GetEquipmentTypes(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		equipmentTypes, err := queries.GetAllEquipmentTypesPaginated(ctx, db.GetAllEquipmentTypesPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch equipment types"})
			return
		}

		total, err := queries.CountEquipmentTypes(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count equipment types"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: equipmentTypes,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetEquipmentType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		equipmentTypeID, ok := utils.ParseUUIDParam(c, "equipment_type_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		equipmentType, err := db.New(pool).GetEquipmentTypeByID(ctx, equipmentTypeID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "equipment type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch equipment type"})
			return
		}

		c.JSON(http.StatusOK, equipmentType)
	}
}

func AddEquipmentType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.EquipmentTypeInput
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

		equipmentType, err := db.New(pool).CreateEquipmentType(ctx, db.CreateEquipmentTypeParams{
			SortOrder:         input.SortOrder,
			EquipmentTypeName: input.EquipmentTypeName,
			Description:       input.Description,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "equipment type sort order is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add equipment type"})
			return
		}

		c.JSON(http.StatusCreated, equipmentType)
	}
}

func UpdateEquipmentType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		equipmentTypeID, ok := utils.ParseUUIDParam(c, "equipment_type_id")
		if !ok {
			return
		}

		var input dto.EquipmentTypeInput
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

		rows, err := db.New(pool).UpdateEquipmentType(ctx, db.UpdateEquipmentTypeParams{
			SortOrder:         input.SortOrder,
			EquipmentTypeName: input.EquipmentTypeName,
			Description:       input.Description,
			EquipmentTypeID:   equipmentTypeID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "equipment type sort order is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update equipment type"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "equipment type not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "equipment type updated successfully"})
	}
}

func PatchEquipmentType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		equipmentTypeID, ok := utils.ParseUUIDParam(c, "equipment_type_id")
		if !ok {
			return
		}

		var input dto.PatchEquipmentTypeInput
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
		existing, err := queries.GetEquipmentTypeByID(ctx, equipmentTypeID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "equipment type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch equipment type"})
			return
		}

		sortOrder := existing.SortOrder
		equipmentTypeName := existing.EquipmentTypeName
		description := existing.Description

		if input.SortOrder != nil {
			sortOrder = *input.SortOrder
		}
		if input.EquipmentTypeName != nil {
			equipmentTypeName = *input.EquipmentTypeName
		}
		if input.Description != nil {
			description = *input.Description
		}

		rows, err := queries.UpdateEquipmentType(ctx, db.UpdateEquipmentTypeParams{
			SortOrder:         sortOrder,
			EquipmentTypeName: equipmentTypeName,
			Description:       description,
			EquipmentTypeID:   equipmentTypeID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "equipment type sort order is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update equipment type"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "equipment type not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "equipment type updated successfully"})
	}
}

func DeleteEquipmentType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		equipmentTypeID, ok := utils.ParseUUIDParam(c, "equipment_type_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)
		_, err := queries.GetEquipmentTypeByID(ctx, equipmentTypeID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "equipment type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch equipment type"})
			return
		}

		count, err := queries.CountSingleAssetEquipmentByEquipmentTypeID(ctx, equipmentTypeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check equipment assignments"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "equipment type is assigned to single-asset equipment"})
			return
		}

		rows, err := queries.DeleteEquipmentType(ctx, equipmentTypeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete equipment type"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "equipment type not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "equipment type deleted successfully"})
	}
}

func GetSingleAssetEquipment(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		equipment, err := db.New(pool).GetSingleAssetEquipmentByAssetID(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "single-asset equipment not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch single-asset equipment"})
			return
		}

		c.JSON(http.StatusOK, equipment)
	}
}
