package controllers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

// ==================== Asset Templates ====================

func AddTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.AssetTemplateInput
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

		template, err := queries.CreateAssetTemplate(ctx, db.CreateAssetTemplateParams{
			TemplateName: input.TemplateName,
			Description:  input.Description,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create template"})
			return
		}

		c.JSON(http.StatusCreated, template)
	}
}

func GetTemplates(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		templates, err := queries.GetAllAssetTemplates(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch templates"})
			return
		}

		c.JSON(http.StatusOK, templates)
	}
}

func GetTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID, ok := utils.ParseUUIDParam(c, "template_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		template, err := queries.GetAssetTemplateByID(ctx, templateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		c.JSON(http.StatusOK, template)
	}
}

func UpdateTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID, ok := utils.ParseUUIDParam(c, "template_id")
		if !ok {
			return
		}

		var input dto.AssetTemplateInput
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

		rows, err := queries.UpdateAssetTemplate(ctx, db.UpdateAssetTemplateParams{
			TemplateName: input.TemplateName,
			Description:  input.Description,
			TemplateID:   templateID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update template"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "template updated successfully"})
	}
}

func ConfigureTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID, ok := utils.ParseUUIDParam(c, "template_id")
		if !ok {
			return
		}

		var input dto.ConfigureTemplateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		categoryIDs, testIDs, err := collectConfigureReferenceIDs(input.Components)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		categoryUUIDs, err := utils.ParseUUIDSlice(categoryIDs, "category_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		testUUIDs, err := utils.ParseUUIDSlice(testIDs, "test_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin template configuration transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		_, err = queries.GetAssetTemplateByID(ctx, templateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		existingCategoryIDs, err := queries.GetExistingCategoryIDs(ctx, categoryUUIDs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate categories"})
			return
		}
		missingCategoryIDs := missingIDs(categoryUUIDs, existingCategoryIDs)
		if len(missingCategoryIDs) > 0 {
			c.JSON(http.StatusNotFound, gin.H{
				"error":                "one or more categories were not found",
				"missing_category_ids": missingCategoryIDs,
			})
			return
		}

		existingTestIDs, err := queries.GetExistingTestTypeIDs(ctx, testUUIDs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test types"})
			return
		}
		missingTestIDs := missingIDs(testUUIDs, existingTestIDs)
		if len(missingTestIDs) > 0 {
			c.JSON(http.StatusNotFound, gin.H{
				"error":            "one or more test types were not found",
				"missing_test_ids": missingTestIDs,
			})
			return
		}

		if _, err := queries.DeleteTemplateComponentsByTemplateID(ctx, templateID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear existing template configuration"})
			return
		}

		totalTests := 0
		for _, componentInput := range input.Components {
			categoryID, err := utils.ParseUUID(componentInput.CategoryID, "category_id")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			component, err := queries.CreateTemplateComponent(ctx, db.CreateTemplateComponentParams{
				TemplateID:      templateID,
				CategoryID:      categoryID,
				Name:            componentInput.Name,
				Description:     componentInput.Description,
				SerialNumber:    componentInput.SerialNumber,
				Manufacturer:    componentInput.Manufacturer,
				Location:        componentInput.Location,
				AssignedProject: componentInput.AssignedProject,
				EquipmentType:   componentInput.EquipmentType,
				Structure:       componentInput.Structure,
				Model:           componentInput.Model,
				Class:           componentInput.Class,
				ClassCode:       componentInput.ClassCode,
				SafetyCritical:  componentInput.SafetyCritical,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create template component"})
				return
			}

			for _, testIDValue := range componentInput.TestIDs {
				testID, err := utils.ParseUUID(testIDValue, "test_id")
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				if _, err := queries.CreateTemplateComponentTest(ctx, db.CreateTemplateComponentTestParams{
					TemplateComponentID: component.TemplateComponentID,
					TestID:              testID,
				}); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to assign test to template component"})
					return
				}
				totalTests++
			}
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit template configuration"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":               "template configured successfully",
			"components_configured": len(input.Components),
			"tests_assigned":        totalTests,
		})
	}
}

func DeleteTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID, ok := utils.ParseUUIDParam(c, "template_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetAssetTemplateByID(ctx, templateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		assetCount, err := queries.CountAssetsByTemplateID(ctx, &templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check template usage"})
			return
		}
		if assetCount > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "template is in use by existing assets"})
			return
		}

		rows, err := queries.DeleteAssetTemplate(ctx, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete template"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "template deleted successfully"})
	}
}

func collectConfigureReferenceIDs(components []dto.ConfigureTemplateComponentItem) ([]string, []string, error) {
	categoryIDs := make([]string, 0, len(components))
	testIDs := make([]string, 0)
	seenCategoryIDs := make(map[string]struct{}, len(components))
	seenTestIDs := make(map[string]struct{})

	for _, component := range components {
		if _, exists := seenCategoryIDs[component.CategoryID]; !exists {
			seenCategoryIDs[component.CategoryID] = struct{}{}
			categoryIDs = append(categoryIDs, component.CategoryID)
		}

		componentSeenTests := make(map[string]struct{}, len(component.TestIDs))
		for _, testID := range component.TestIDs {
			if _, exists := componentSeenTests[testID]; exists {
				return nil, nil, fmt.Errorf("duplicate test_id %q found in component %q", testID, component.Name)
			}
			componentSeenTests[testID] = struct{}{}

			if _, exists := seenTestIDs[testID]; !exists {
				seenTestIDs[testID] = struct{}{}
				testIDs = append(testIDs, testID)
			}
		}
	}

	return categoryIDs, testIDs, nil
}

func missingIDs(requested []uuid.UUID, found []uuid.UUID) []string {
	foundSet := make(map[uuid.UUID]struct{}, len(found))
	for _, id := range found {
		foundSet[id] = struct{}{}
	}

	missing := make([]string, 0)
	for _, id := range requested {
		if _, exists := foundSet[id]; !exists {
			missing = append(missing, id.String())
		}
	}

	return missing
}

// ==================== Template Components ====================

func AddTemplateComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID, ok := utils.ParseUUIDParam(c, "template_id")
		if !ok {
			return
		}

		var input dto.TemplateComponentInput
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

		_, err := queries.GetAssetTemplateByID(ctx, templateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		categoryID, err := utils.ParseUUID(input.CategoryID, "category_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err = queries.GetCategoryByID(ctx, categoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch category"})
			return
		}

		component, err := queries.CreateTemplateComponent(ctx, db.CreateTemplateComponentParams{
			TemplateID:      templateID,
			CategoryID:      categoryID,
			Name:            input.Name,
			Description:     input.Description,
			SerialNumber:    input.SerialNumber,
			Manufacturer:    input.Manufacturer,
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create template component"})
			return
		}

		c.JSON(http.StatusCreated, component)
	}
}

func GetTemplateComponents(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID, ok := utils.ParseUUIDParam(c, "template_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetAssetTemplateByID(ctx, templateID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template"})
			return
		}

		components, err := queries.GetTemplateComponentsByTemplateID(ctx, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template components"})
			return
		}

		c.JSON(http.StatusOK, components)
	}
}

func UpdateTemplateComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateComponentID, ok := utils.ParseUUIDParam(c, "template_component_id")
		if !ok {
			return
		}

		var input dto.TemplateComponentInput
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

		_, err := queries.GetTemplateComponentByID(ctx, templateComponentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template component"})
			return
		}

		categoryID, err := utils.ParseUUID(input.CategoryID, "category_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err = queries.GetCategoryByID(ctx, categoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch category"})
			return
		}

		rows, err := queries.UpdateTemplateComponent(ctx, db.UpdateTemplateComponentParams{
			CategoryID:          categoryID,
			Name:                input.Name,
			Description:         input.Description,
			SerialNumber:        input.SerialNumber,
			Manufacturer:        input.Manufacturer,
			Location:            input.Location,
			AssignedProject:     input.AssignedProject,
			EquipmentType:       input.EquipmentType,
			Structure:           input.Structure,
			Model:               input.Model,
			Class:               input.Class,
			ClassCode:           input.ClassCode,
			SafetyCritical:      input.SafetyCritical,
			TemplateComponentID: templateComponentID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update template component"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "template component updated successfully"})
	}
}

func DeleteTemplateComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateComponentID, ok := utils.ParseUUIDParam(c, "template_component_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetTemplateComponentByID(ctx, templateComponentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template component"})
			return
		}

		rows, err := queries.DeleteTemplateComponent(ctx, templateComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete template component"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "template component deleted successfully"})
	}
}

// ==================== Template Component Tests ====================

func AddTemplateComponentTest(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateComponentID, ok := utils.ParseUUIDParam(c, "template_component_id")
		if !ok {
			return
		}

		var input dto.TemplateComponentTestInput
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

		_, err := queries.GetTemplateComponentByID(ctx, templateComponentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template component"})
			return
		}

		testID, err := utils.ParseUUID(input.TestID, "test_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err = queries.GetTestTypeByID(ctx, testID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test type"})
			return
		}

		tct, err := queries.CreateTemplateComponentTest(ctx, db.CreateTemplateComponentTestParams{
			TemplateComponentID: templateComponentID,
			TestID:              testID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add test to template component"})
			return
		}

		c.JSON(http.StatusCreated, tct)
	}
}

func GetTemplateComponentTests(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateComponentID, ok := utils.ParseUUIDParam(c, "template_component_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetTemplateComponentByID(ctx, templateComponentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template component"})
			return
		}

		tests, err := queries.GetTemplateComponentTestsWithDetail(ctx, templateComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template component tests"})
			return
		}

		c.JSON(http.StatusOK, tests)
	}
}

func DeleteTemplateComponentTest(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateComponentTestID, ok := utils.ParseUUIDParam(c, "template_component_test_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		_, err := queries.GetTemplateComponentTestByID(ctx, templateComponentTestID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "template component test not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template component test"})
			return
		}

		rows, err := queries.DeleteTemplateComponentTest(ctx, templateComponentTestID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete template component test"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "template component test not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "template component test removed successfully"})
	}
}
