package controllers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func testTypeRenewalValues(input dto.TestTypeInput) (bool, *int32, error) {
	requiresRenewal := true
	if input.RequiresRenewal != nil {
		requiresRenewal = *input.RequiresRenewal
	}
	return validateTestTypeRenewal(requiresRenewal, input.ValidityDuration)
}

func validateTestTypeRenewal(requiresRenewal bool, validityDuration *int32) (bool, *int32, error) {
	if requiresRenewal {
		if validityDuration == nil {
			return requiresRenewal, validityDuration, fmt.Errorf("validity duration is required for renewable test/certificate types")
		}
		return requiresRenewal, validityDuration, nil
	}
	if validityDuration != nil {
		return requiresRenewal, validityDuration, fmt.Errorf("validity duration must be omitted for one-time test/certificate types")
	}
	return requiresRenewal, nil, nil
}

func AddTestType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.TestTypeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		requiresRenewal, validityDuration, err := testTypeRenewalValues(input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		testType, err := queries.CreateTestType(ctx, db.CreateTestTypeParams{
			TestName:         input.TestName,
			ValidityDuration: validityDuration,
			RequiresRenewal:  requiresRenewal,
			Description:      input.Description,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add test type"})
			return
		}

		c.JSON(http.StatusCreated, testType)
	}
}

func UpdateTestType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		testID, ok := utils.ParseUUIDParam(c, "test_id")
		if !ok {
			return
		}

		var input dto.TestTypeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		requiresRenewal, validityDuration, err := testTypeRenewalValues(input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		rows, err := queries.UpdateTestType(ctx, db.UpdateTestTypeParams{
			TestName:         input.TestName,
			ValidityDuration: validityDuration,
			RequiresRenewal:  requiresRenewal,
			Description:      input.Description,
			TestID:           testID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update test type"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "test type updated successfully"})
	}
}

func PatchTestType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		testID, ok := utils.ParseUUIDParam(c, "test_id")
		if !ok {
			return
		}

		var input dto.PatchTestTypeInput
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin test type transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		existing, err := queries.GetTestTypeByID(ctx, testID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test type"})
			return
		}

		testName := existing.TestName
		validityDuration := existing.ValidityDuration
		requiresRenewal := existing.RequiresRenewal
		description := existing.Description

		if input.TestName != nil {
			testName = *input.TestName
		}
		if input.ValidityDuration != nil {
			validityDuration = input.ValidityDuration
		}
		if input.RequiresRenewal != nil {
			requiresRenewal = *input.RequiresRenewal
			if !requiresRenewal && input.ValidityDuration == nil {
				validityDuration = nil
			}
		}
		if input.Description != nil {
			description = *input.Description
		}
		requiresRenewal, validityDuration, err = validateTestTypeRenewal(requiresRenewal, validityDuration)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		rows, err := queries.UpdateTestType(ctx, db.UpdateTestTypeParams{
			TestName:         testName,
			ValidityDuration: validityDuration,
			RequiresRenewal:  requiresRenewal,
			Description:      description,
			TestID:           testID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update test type"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
			return
		}
		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit test type"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "test type updated successfully"})
	}
}

func DeleteTestType(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		testID, ok := utils.ParseUUIDParam(c, "test_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetTestTypeByID(ctx, testID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test type"})
			return
		}

		count, err := queries.CountCertificatesByTestID(ctx, testID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check certificates"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "test type has certificates assigned to it"})
			return
		}

		templateTestCount, err := queries.CountTemplateComponentTestsByTestID(ctx, testID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check template tests"})
			return
		}
		if templateTestCount > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "test type is assigned to template components"})
			return
		}

		rows, err := queries.DeleteTestType(ctx, testID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete test type"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "test type deleted successfully"})
	}
}
