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

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		testType, err := queries.CreateTestType(ctx, db.CreateTestTypeParams{
			TestName:         input.TestName,
			ValidityDuration: input.ValidityDuration,
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

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		rows, err := queries.UpdateTestType(ctx, db.UpdateTestTypeParams{
			TestName:         input.TestName,
			ValidityDuration: input.ValidityDuration,
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

		queries := db.New(pool)

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
		description := existing.Description

		if input.TestName != nil {
			testName = *input.TestName
		}
		if input.ValidityDuration != nil {
			validityDuration = *input.ValidityDuration
		}
		if input.Description != nil {
			description = *input.Description
		}

		rows, err := queries.UpdateTestType(ctx, db.UpdateTestTypeParams{
			TestName:         testName,
			ValidityDuration: validityDuration,
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
