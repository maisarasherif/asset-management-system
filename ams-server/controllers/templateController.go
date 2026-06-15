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

		c.JSON(http.StatusOK, dto.NormalizeListData(templates))
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

		categoryIDs, testIDs, competencyCategoryIDs, err := collectConfigureReferenceIDs(input.Components)
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

		competencyCategoryUUIDs, err := utils.ParseUUIDSlice(competencyCategoryIDs, "competency_category_id")
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

		if err := validateActiveCompetencyCategoryIDs(ctx, queries, competencyCategoryUUIDs); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		existingComponents, err := queries.GetTemplateComponentsByTemplateID(ctx, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch existing template components"})
			return
		}

		existingComponentMap := make(map[uuid.UUID]db.GetTemplateComponentsByTemplateIDRow, len(existingComponents))
		for _, component := range existingComponents {
			existingComponentMap[component.TemplateComponentID] = component
		}

		keptComponentIDs := make(map[uuid.UUID]struct{}, len(input.Components))
		totalTests := 0
		for _, componentInput := range input.Components {
			categoryID, scopeCategoryID, err := resolveScopeCategoryReference(ctx, queries, componentInput.ScopeCategoryID, componentInput.CategoryID)
			if err != nil {
				writeScopeCategoryReferenceError(c, err)
				return
			}

			templateComponentID := uuid.Nil
			if componentInput.TemplateComponentID != "" {
				templateComponentID, err = utils.ParseUUID(componentInput.TemplateComponentID, "template_component_id")
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
			}

			if templateComponentID != uuid.Nil {
				if _, exists := keptComponentIDs[templateComponentID]; exists {
					c.JSON(http.StatusBadRequest, gin.H{"error": "duplicate template_component_id in configuration payload"})
					return
				}

				if _, exists := existingComponentMap[templateComponentID]; !exists {
					c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
					return
				}

				rows, err := queries.UpdateTemplateComponent(ctx, db.UpdateTemplateComponentParams{
					TemplateComponentID: templateComponentID,
					CategoryID:          categoryID,
					ScopeCategoryID:     scopeCategoryID,
					Name:                componentInput.Name,
					Description:         componentInput.Description,
					SerialNumber:        componentInput.SerialNumber,
					Manufacturer:        componentInput.Manufacturer,
					Location:            componentInput.Location,
					AssignedProject:     componentInput.AssignedProject,
					EquipmentType:       componentInput.EquipmentType,
					Structure:           componentInput.Structure,
					Model:               componentInput.Model,
					Class:               componentInput.Class,
					ClassCode:           componentInput.ClassCode,
					SafetyCritical:      componentInput.SafetyCritical,
				})
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update template component"})
					return
				}
				if rows == 0 {
					c.JSON(http.StatusNotFound, gin.H{"error": "template component not found"})
					return
				}

				if _, err := queries.DeleteTemplateComponentTestsByComponentID(ctx, templateComponentID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to replace template component tests"})
					return
				}
			} else {
				component, err := queries.CreateTemplateComponent(ctx, db.CreateTemplateComponentParams{
					TemplateID:      templateID,
					CategoryID:      categoryID,
					ScopeCategoryID: scopeCategoryID,
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
				templateComponentID = component.TemplateComponentID
			}
			keptComponentIDs[templateComponentID] = struct{}{}

			testItems, err := configureComponentTestItems(componentInput)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			for _, testItem := range testItems {
				testID, err := utils.ParseUUID(testItem.TestID, "test_id")
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				testCompetencyCategoryIDs, err := parseCompetencyCategoryIDs(testItem.CompetencyCategoryIDs)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				tct, err := queries.CreateTemplateComponentTest(ctx, db.CreateTemplateComponentTestParams{
					TemplateComponentID: templateComponentID,
					TestID:              testID,
				})
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to assign test to template component"})
					return
				}
				if err := setTemplateComponentTestCompetencyCategories(ctx, queries, tct.TemplateComponentTestID, testCompetencyCategoryIDs); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to set template test competency categories"})
					return
				}
				totalTests++
			}
		}

		for _, existingComponent := range existingComponents {
			if _, keep := keptComponentIDs[existingComponent.TemplateComponentID]; keep {
				continue
			}
			if _, err := queries.DeleteTemplateComponent(ctx, existingComponent.TemplateComponentID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove template component"})
				return
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

func configureComponentTestItems(component dto.ConfigureTemplateComponentItem) ([]dto.ConfigureTemplateComponentTestItem, error) {
	if len(component.Tests) > 0 {
		return component.Tests, nil
	}

	tests := make([]dto.ConfigureTemplateComponentTestItem, 0, len(component.TestIDs))
	for _, testID := range component.TestIDs {
		tests = append(tests, dto.ConfigureTemplateComponentTestItem{
			TestID:                testID,
			CompetencyCategoryIDs: []string{},
		})
	}
	return tests, nil
}

func collectConfigureReferenceIDs(components []dto.ConfigureTemplateComponentItem) ([]string, []string, []string, error) {
	categoryIDs := make([]string, 0, len(components))
	testIDs := make([]string, 0)
	competencyCategoryIDs := make([]string, 0)
	seenCategoryIDs := make(map[string]struct{}, len(components))
	seenTestIDs := make(map[string]struct{})
	seenCompetencyCategoryIDs := make(map[string]struct{})

	for _, component := range components {
		if _, exists := seenCategoryIDs[component.CategoryID]; !exists {
			seenCategoryIDs[component.CategoryID] = struct{}{}
			categoryIDs = append(categoryIDs, component.CategoryID)
		}

		testItems, err := configureComponentTestItems(component)
		if err != nil {
			return nil, nil, nil, err
		}
		if len(testItems) == 0 {
			return nil, nil, nil, fmt.Errorf("assign at least one test type to component %q", component.Name)
		}

		componentSeenTests := make(map[string]struct{}, len(testItems))
		for _, testItem := range testItems {
			testID := testItem.TestID
			if _, exists := componentSeenTests[testID]; exists {
				return nil, nil, nil, fmt.Errorf("duplicate test_id %q found in component %q", testID, component.Name)
			}
			componentSeenTests[testID] = struct{}{}

			if _, exists := seenTestIDs[testID]; !exists {
				seenTestIDs[testID] = struct{}{}
				testIDs = append(testIDs, testID)
			}
			for _, competencyCategoryID := range testItem.CompetencyCategoryIDs {
				if _, exists := seenCompetencyCategoryIDs[competencyCategoryID]; exists {
					continue
				}
				seenCompetencyCategoryIDs[competencyCategoryID] = struct{}{}
				competencyCategoryIDs = append(competencyCategoryIDs, competencyCategoryID)
			}
		}
	}

	return categoryIDs, testIDs, competencyCategoryIDs, nil
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

		categoryID, scopeCategoryID, err := resolveScopeCategoryReference(ctx, queries, input.ScopeCategoryID, input.CategoryID)
		if err != nil {
			writeScopeCategoryReferenceError(c, err)
			return
		}

		component, err := queries.CreateTemplateComponent(ctx, db.CreateTemplateComponentParams{
			TemplateID:      templateID,
			CategoryID:      categoryID,
			ScopeCategoryID: scopeCategoryID,
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

		c.JSON(http.StatusOK, dto.NormalizeListData(components))
	}
}

func GetTemplateConfiguration(pool *pgxpool.Pool) gin.HandlerFunc {
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

		tests, err := queries.GetTemplateComponentTestsWithDetailByTemplateID(ctx, templateID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template component tests"})
			return
		}

		testsByComponent := make(map[uuid.UUID][]dto.TemplateComponentTestDetailResponse, len(components))
		for _, test := range tests {
			competencyCategories, err := queries.GetCompetencyCategoriesByTemplateComponentTestID(ctx, test.TemplateComponentTestID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template test competency categories"})
				return
			}
			competencyCategoryIDs, allowedCompetencyCategories := buildCompetencyCategoryRules(competencyCategories)

			testsByComponent[test.TemplateComponentID] = append(
				testsByComponent[test.TemplateComponentID],
				dto.TemplateComponentTestDetailResponse{
					TemplateComponentTestID:        test.TemplateComponentTestID.String(),
					TemplateComponentTestDisplayID: test.TemplateComponentTestDisplayID,
					TemplateComponentID:            test.TemplateComponentID.String(),
					TestID:                         test.TestID.String(),
					Position:                       test.Position,
					CreatedAt:                      test.CreatedAt,
					TestName:                       test.TestName,
					ValidityDuration:               test.ValidityDuration,
					RequiresRenewal:                test.RequiresRenewal,
					Description:                    test.Description,
					CompetencyCategoryIDs:          competencyCategoryIDs,
					AllowedCompetencyCategories:    allowedCompetencyCategories,
				},
			)
		}

		response := make([]dto.TemplateConfigurationComponentResponse, 0, len(components))
		for _, component := range components {
			componentTests := testsByComponent[component.TemplateComponentID]
			if componentTests == nil {
				componentTests = []dto.TemplateComponentTestDetailResponse{}
			}

			response = append(response, dto.TemplateConfigurationComponentResponse{
				TemplateComponentID: component.TemplateComponentID.String(),
				DisplayID:           component.DisplayID,
				TemplateID:          component.TemplateID.String(),
				CategoryID:          component.CategoryID.String(),
				ScopeCategoryID:     component.ScopeCategoryID.String(),
				Position:            component.Position,
				Name:                component.Name,
				Description:         component.Description,
				SerialNumber:        component.SerialNumber,
				Manufacturer:        component.Manufacturer,
				EquipmentType:       component.EquipmentType,
				Structure:           component.Structure,
				Model:               component.Model,
				Class:               component.Class,
				ClassCode:           component.ClassCode,
				SafetyCritical:      component.SafetyCritical,
				CreatedAt:           component.CreatedAt,
				Location:            component.Location,
				AssignedProject:     component.AssignedProject,
				Tests:               templateComponentTestsOrEmpty(componentTests),
			})
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(response))
	}
}

func templateComponentTestsOrEmpty(tests []dto.TemplateComponentTestDetailResponse) []dto.TemplateComponentTestDetailResponse {
	if tests == nil {
		return []dto.TemplateComponentTestDetailResponse{}
	}
	return tests
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

		categoryID, scopeCategoryID, err := resolveScopeCategoryReference(ctx, queries, input.ScopeCategoryID, input.CategoryID)
		if err != nil {
			writeScopeCategoryReferenceError(c, err)
			return
		}

		rows, err := queries.UpdateTemplateComponent(ctx, db.UpdateTemplateComponentParams{
			CategoryID:          categoryID,
			ScopeCategoryID:     scopeCategoryID,
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

		categoryIDs, err := parseCompetencyCategoryIDs(input.CompetencyCategoryIDs)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin template component test transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)

		_, err = queries.GetTemplateComponentByID(ctx, templateComponentID)
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
		if err := validateActiveCompetencyCategoryIDs(ctx, queries, categoryIDs); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		if err := setTemplateComponentTestCompetencyCategories(ctx, queries, tct.TemplateComponentTestID, categoryIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to set template test competency categories"})
			return
		}
		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit template component test"})
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

		response := make([]dto.TemplateComponentTestDetailResponse, 0, len(tests))
		for _, test := range tests {
			competencyCategories, err := queries.GetCompetencyCategoriesByTemplateComponentTestID(ctx, test.TemplateComponentTestID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch template test competency categories"})
				return
			}
			competencyCategoryIDs, allowedCompetencyCategories := buildCompetencyCategoryRules(competencyCategories)
			response = append(response, dto.TemplateComponentTestDetailResponse{
				TemplateComponentTestID:        test.TemplateComponentTestID.String(),
				TemplateComponentTestDisplayID: test.TemplateComponentTestDisplayID,
				TemplateComponentID:            test.TemplateComponentID.String(),
				TestID:                         test.TestID.String(),
				Position:                       test.Position,
				CreatedAt:                      test.CreatedAt,
				TestName:                       test.TestName,
				ValidityDuration:               test.ValidityDuration,
				RequiresRenewal:                test.RequiresRenewal,
				Description:                    test.Description,
				CompetencyCategoryIDs:          competencyCategoryIDs,
				AllowedCompetencyCategories:    allowedCompetencyCategories,
			})
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(response))
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
