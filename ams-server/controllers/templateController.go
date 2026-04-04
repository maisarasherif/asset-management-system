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

		templateID, err := utils.GenerateTemplateID(ctx, queries)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate template id"})
			return
		}

		template, err := queries.CreateAssetTemplate(ctx, db.CreateAssetTemplateParams{
			TemplateID:   templateID,
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
		templateID := c.Param("template_id")

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
		templateID := c.Param("template_id")

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

func DeleteTemplate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")

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

// ==================== Template Components ====================

func AddTemplateComponent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")

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

		_, err = queries.GetCategoryByID(ctx, input.CategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch category"})
			return
		}

		templateComponentID, err := utils.GenerateTemplateComponentID(ctx, queries, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate template component id"})
			return
		}

		component, err := queries.CreateTemplateComponent(ctx, db.CreateTemplateComponentParams{
			TemplateComponentID: templateComponentID,
			TemplateID:          templateID,
			CategoryID:          input.CategoryID,
			Name:                input.Name,
			Description:         input.Description,
			SerialNumber:        input.SerialNumber,
			Manufacturer:        input.Manufacturer,
			EquipmentType:       input.EquipmentType,
			Structure:           input.Structure,
			Model:               input.Model,
			Class:               input.Class,
			ClassCode:           input.ClassCode,
			SafetyCritical:      input.SafetyCritical,
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
		templateID := c.Param("template_id")

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
		templateComponentID := c.Param("template_component_id")

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

		_, err = queries.GetCategoryByID(ctx, input.CategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch category"})
			return
		}

		rows, err := queries.UpdateTemplateComponent(ctx, db.UpdateTemplateComponentParams{
			CategoryID:          input.CategoryID,
			Name:                input.Name,
			Description:         input.Description,
			SerialNumber:        input.SerialNumber,
			Manufacturer:        input.Manufacturer,
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
		templateComponentID := c.Param("template_component_id")

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
		templateComponentID := c.Param("template_component_id")

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

		_, err = queries.GetTestTypeByID(ctx, input.TestID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test type"})
			return
		}

		templateComponentTestID, err := utils.GenerateTemplateComponentTestID(ctx, queries, templateComponentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate template component test id"})
			return
		}

		tct, err := queries.CreateTemplateComponentTest(ctx, db.CreateTemplateComponentTestParams{
			TemplateComponentTestID: templateComponentTestID,
			TemplateComponentID:     templateComponentID,
			TestID:                  input.TestID,
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
		templateComponentID := c.Param("template_component_id")

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
		templateComponentTestID := c.Param("template_component_test_id")

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
