package controllers

import (
	"context"
	"fmt"

	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
)

type templateTree struct {
	Template     db.AssetTemplate
	Categories   []db.AssetTemplateCategory
	Components   []db.AssetTemplateComponent
	Requirements []db.AssetTemplateTestRequirement
}

func validateTemplateInput(input dto.AssetTemplateInput) error {
	seenCategories := map[string]struct{}{}

	for categoryIndex, category := range input.Categories {
		if category.CategoryID == "" {
			return fmt.Errorf("category is required at position %d", categoryIndex+1)
		}
		if _, exists := seenCategories[category.CategoryID]; exists {
			return fmt.Errorf("category %s is duplicated in the template", category.CategoryID)
		}
		seenCategories[category.CategoryID] = struct{}{}

		for componentIndex, component := range category.Components {
			if component.Name == "" {
				return fmt.Errorf("component name is required at category %d component %d", categoryIndex+1, componentIndex+1)
			}

			seenLabels := map[string]struct{}{}
			for requirementIndex, requirement := range component.Requirements {
				if requirement.TestID == "" {
					return fmt.Errorf("test type is required at category %d component %d requirement %d", categoryIndex+1, componentIndex+1, requirementIndex+1)
				}
				if requirement.Label == "" {
					return fmt.Errorf("requirement label is required at category %d component %d requirement %d", categoryIndex+1, componentIndex+1, requirementIndex+1)
				}
				if _, exists := seenLabels[requirement.Label]; exists {
					return fmt.Errorf("requirement label %q is duplicated within component %q", requirement.Label, component.Name)
				}
				seenLabels[requirement.Label] = struct{}{}
			}
		}
	}

	return nil
}

func loadActiveTemplateTree(ctx context.Context, queries *db.Queries, templateID string) (templateTree, error) {
	template, err := queries.GetActiveAssetTemplateByID(ctx, templateID)
	if err != nil {
		return templateTree{}, err
	}

	categories, err := queries.GetActiveTemplateCategoriesByTemplateID(ctx, templateID)
	if err != nil {
		return templateTree{}, err
	}

	components, err := queries.GetActiveTemplateComponentsByTemplateID(ctx, templateID)
	if err != nil {
		return templateTree{}, err
	}

	requirements, err := queries.GetActiveTemplateRequirementsByTemplateID(ctx, templateID)
	if err != nil {
		return templateTree{}, err
	}

	return templateTree{
		Template:     template,
		Categories:   categories,
		Components:   components,
		Requirements: requirements,
	}, nil
}

func createOrUpdateTemplate(ctx context.Context, queries *db.Queries, templateID string, input dto.AssetTemplateInput) (string, error) {
	if err := validateTemplateInput(input); err != nil {
		return "", err
	}

	if templateID == "" {
		generatedID, err := generateResourceID("tpl")
		if err != nil {
			return "", err
		}
		templateID = generatedID

		if _, err := queries.CreateAssetTemplate(ctx, db.CreateAssetTemplateParams{
			TemplateID: templateID,
			Name:       input.Name,
		}); err != nil {
			return "", err
		}
	} else {
		rows, err := queries.UpdateAssetTemplate(ctx, db.UpdateAssetTemplateParams{
			Name:       input.Name,
			TemplateID: templateID,
		})
		if err != nil {
			return "", err
		}
		if rows == 0 {
			return "", fmt.Errorf("template not found")
		}
	}

	existingCategories, err := queries.GetAllTemplateCategoriesByTemplateID(ctx, templateID)
	if err != nil {
		return "", err
	}
	existingComponents, err := queries.GetAllTemplateComponentsByTemplateID(ctx, templateID)
	if err != nil {
		return "", err
	}
	existingRequirements, err := queries.GetAllTemplateRequirementsByTemplateID(ctx, templateID)
	if err != nil {
		return "", err
	}

	existingCategoryByID := make(map[string]db.AssetTemplateCategory, len(existingCategories))
	existingComponentByID := make(map[string]db.AssetTemplateComponent, len(existingComponents))
	existingRequirementByID := make(map[string]db.AssetTemplateTestRequirement, len(existingRequirements))

	for _, category := range existingCategories {
		existingCategoryByID[category.TemplateCategoryID] = category
	}
	for _, component := range existingComponents {
		existingComponentByID[component.TemplateComponentID] = component
	}
	for _, requirement := range existingRequirements {
		existingRequirementByID[requirement.TemplateRequirementID] = requirement
	}

	seenCategories := map[string]struct{}{}
	seenComponents := map[string]struct{}{}
	seenRequirements := map[string]struct{}{}

	for categoryIndex, category := range input.Categories {
		categoryID := category.TemplateCategoryID
		if categoryID == "" {
			generatedID, err := generateResourceID("tplcat")
			if err != nil {
				return "", err
			}
			categoryID = generatedID

			if _, err := queries.CreateTemplateCategory(ctx, db.CreateTemplateCategoryParams{
				TemplateCategoryID: categoryID,
				TemplateID:         templateID,
				CategoryID:         category.CategoryID,
				SortOrder:          int32(categoryIndex),
			}); err != nil {
				return "", err
			}
		} else {
			if _, exists := existingCategoryByID[categoryID]; !exists {
				return "", fmt.Errorf("template category %s does not belong to template %s", categoryID, templateID)
			}
			if _, err := queries.UpdateTemplateCategory(ctx, db.UpdateTemplateCategoryParams{
				CategoryID:         category.CategoryID,
				SortOrder:          int32(categoryIndex),
				TemplateCategoryID: categoryID,
			}); err != nil {
				return "", err
			}
		}
		seenCategories[categoryID] = struct{}{}

		for componentIndex, component := range category.Components {
			componentID := component.TemplateComponentID
			if componentID == "" {
				generatedID, err := generateResourceID("tplcmp")
				if err != nil {
					return "", err
				}
				componentID = generatedID

				if _, err := queries.CreateTemplateComponent(ctx, db.CreateTemplateComponentParams{
					TemplateComponentID: componentID,
					TemplateCategoryID:  categoryID,
					Name:                component.Name,
					SerialNumber:        component.SerialNumber,
					Manufacturer:        component.Manufacturer,
					Description:         component.Description,
					EquipmentType:       component.EquipmentType,
					Structure:           component.Structure,
					Model:               component.Model,
					Class:               component.Class,
					ClassCode:           component.ClassCode,
					SafetyCritical:      component.SafetyCritical,
					SortOrder:           int32(componentIndex),
				}); err != nil {
					return "", err
				}
			} else {
				if _, exists := existingComponentByID[componentID]; !exists {
					return "", fmt.Errorf("template component %s does not belong to template %s", componentID, templateID)
				}
				if _, err := queries.UpdateTemplateComponent(ctx, db.UpdateTemplateComponentParams{
					TemplateCategoryID:  categoryID,
					Name:                component.Name,
					SerialNumber:        component.SerialNumber,
					Manufacturer:        component.Manufacturer,
					Description:         component.Description,
					EquipmentType:       component.EquipmentType,
					Structure:           component.Structure,
					Model:               component.Model,
					Class:               component.Class,
					ClassCode:           component.ClassCode,
					SafetyCritical:      component.SafetyCritical,
					SortOrder:           int32(componentIndex),
					TemplateComponentID: componentID,
				}); err != nil {
					return "", err
				}
			}
			seenComponents[componentID] = struct{}{}

			for requirementIndex, requirement := range component.Requirements {
				requirementID := requirement.TemplateRequirementID
				if requirementID == "" {
					generatedID, err := generateResourceID("tplreq")
					if err != nil {
						return "", err
					}
					requirementID = generatedID

					if _, err := queries.CreateTemplateRequirement(ctx, db.CreateTemplateRequirementParams{
						TemplateRequirementID: requirementID,
						TemplateComponentID:   componentID,
						TestID:                requirement.TestID,
						Label:                 requirement.Label,
						SortOrder:             int32(requirementIndex),
					}); err != nil {
						return "", err
					}
				} else {
					if _, exists := existingRequirementByID[requirementID]; !exists {
						return "", fmt.Errorf("template requirement %s does not belong to template %s", requirementID, templateID)
					}
					if _, err := queries.UpdateTemplateRequirement(ctx, db.UpdateTemplateRequirementParams{
						TemplateComponentID:   componentID,
						TestID:                requirement.TestID,
						Label:                 requirement.Label,
						SortOrder:             int32(requirementIndex),
						TemplateRequirementID: requirementID,
					}); err != nil {
						return "", err
					}
				}
				seenRequirements[requirementID] = struct{}{}
			}
		}
	}

	for _, requirement := range existingRequirements {
		if _, seen := seenRequirements[requirement.TemplateRequirementID]; !seen && !requirement.IsArchived {
			if _, err := queries.ArchiveTemplateRequirement(ctx, requirement.TemplateRequirementID); err != nil {
				return "", err
			}
		}
	}

	for _, component := range existingComponents {
		if _, seen := seenComponents[component.TemplateComponentID]; !seen && !component.IsArchived {
			if _, err := queries.ArchiveTemplateComponent(ctx, component.TemplateComponentID); err != nil {
				return "", err
			}
		}
	}

	for _, category := range existingCategories {
		if _, seen := seenCategories[category.TemplateCategoryID]; !seen && !category.IsArchived {
			if _, err := queries.ArchiveTemplateCategory(ctx, category.TemplateCategoryID); err != nil {
				return "", err
			}
		}
	}

	return templateID, nil
}

func ensureManualAssetCategory(ctx context.Context, queries *db.Queries, assetID, categoryID string) (db.AssetCategory, error) {
	categories, err := queries.GetActiveAssetCategoriesByAssetID(ctx, assetID)
	if err != nil {
		return db.AssetCategory{}, err
	}

	for _, category := range categories {
		if category.CategoryID == categoryID {
			return category, nil
		}
	}

	generatedID, err := generateResourceID("assetcat")
	if err != nil {
		return db.AssetCategory{}, err
	}

	return queries.CreateAssetCategory(ctx, db.CreateAssetCategoryParams{
		AssetCategoryID:          generatedID,
		AssetID:                  assetID,
		CategoryID:               categoryID,
		SourceTemplateCategoryID: "",
		SortOrder:                int32(len(categories)),
	})
}

func archiveActiveAssetStructure(ctx context.Context, queries *db.Queries, assetID string) error {
	components, err := queries.GetAllActiveComponentsByAssetID(ctx, assetID)
	if err != nil {
		return err
	}

	for _, component := range components {
		if _, err := queries.ArchiveActiveRequirementsByComponentID(ctx, component.ComponentID); err != nil {
			return err
		}
	}

	if _, err := queries.ArchiveActiveComponentsByAssetID(ctx, assetID); err != nil {
		return err
	}

	if _, err := queries.ArchiveActiveAssetCategoriesByAssetID(ctx, assetID); err != nil {
		return err
	}

	return nil
}

func syncAssetStructureToTemplate(ctx context.Context, queries *db.Queries, assetID, templateID string) error {
	tree, err := loadActiveTemplateTree(ctx, queries, templateID)
	if err != nil {
		return err
	}

	activeCategories, err := queries.GetActiveAssetCategoriesByAssetID(ctx, assetID)
	if err != nil {
		return err
	}
	activeComponents, err := queries.GetAllActiveComponentsByAssetID(ctx, assetID)
	if err != nil {
		return err
	}
	activeRequirements, err := queries.GetActiveComponentRequirementsByAssetID(ctx, assetID)
	if err != nil {
		return err
	}

	assetCategoryBySource := make(map[string]db.AssetCategory)
	for _, category := range activeCategories {
		if category.SourceTemplateCategoryID != "" {
			assetCategoryBySource[category.SourceTemplateCategoryID] = category
		}
	}

	componentBySource := make(map[string]db.Component)
	for _, component := range activeComponents {
		if component.SourceTemplateComponentID != "" {
			componentBySource[component.SourceTemplateComponentID] = component
		}
	}

	requirementBySource := make(map[string]db.GetActiveComponentRequirementsByAssetIDRow)
	for _, requirement := range activeRequirements {
		if requirement.SourceTemplateRequirementID != "" {
			requirementBySource[requirement.SourceTemplateRequirementID] = requirement
		}
	}

	activeCategorySources := map[string]struct{}{}
	resolvedCategories := make(map[string]db.AssetCategory)

	for _, category := range tree.Categories {
		activeCategorySources[category.TemplateCategoryID] = struct{}{}

		existingCategory, exists := assetCategoryBySource[category.TemplateCategoryID]
		if !exists {
			generatedID, err := generateResourceID("assetcat")
			if err != nil {
				return err
			}

			existingCategory, err = queries.CreateAssetCategory(ctx, db.CreateAssetCategoryParams{
				AssetCategoryID:          generatedID,
				AssetID:                  assetID,
				CategoryID:               category.CategoryID,
				SourceTemplateCategoryID: category.TemplateCategoryID,
				SortOrder:                category.SortOrder,
			})
			if err != nil {
				return err
			}
		} else {
			if _, err := queries.UpdateAssetCategory(ctx, db.UpdateAssetCategoryParams{
				CategoryID:      category.CategoryID,
				SortOrder:       category.SortOrder,
				AssetCategoryID: existingCategory.AssetCategoryID,
			}); err != nil {
				return err
			}
			existingCategory.CategoryID = category.CategoryID
			existingCategory.SortOrder = category.SortOrder
		}

		resolvedCategories[category.TemplateCategoryID] = existingCategory
	}

	for _, category := range activeCategories {
		if category.SourceTemplateCategoryID == "" {
			continue
		}
		if _, exists := activeCategorySources[category.SourceTemplateCategoryID]; exists {
			continue
		}
		if _, err := queries.ArchiveAssetCategory(ctx, category.AssetCategoryID); err != nil {
			return err
		}
	}

	activeComponentSources := map[string]struct{}{}
	resolvedComponents := make(map[string]db.Component)

	for _, component := range tree.Components {
		activeComponentSources[component.TemplateComponentID] = struct{}{}

		parentCategory, exists := resolvedCategories[component.TemplateCategoryID]
		if !exists {
			return fmt.Errorf("missing runtime category for template category %s", component.TemplateCategoryID)
		}

		existingComponent, found := componentBySource[component.TemplateComponentID]
		if !found {
			componentID, err := generateComponentID(ctx, queries, assetID)
			if err != nil {
				return err
			}

			existingComponent, err = queries.CreateComponent(ctx, db.CreateComponentParams{
				ComponentID:               componentID,
				AssetID:                   assetID,
				CategoryID:                parentCategory.CategoryID,
				AssetCategoryID:           parentCategory.AssetCategoryID,
				SourceTemplateComponentID: component.TemplateComponentID,
				Name:                      component.Name,
				SerialNumber:              component.SerialNumber,
				Manufacturer:              component.Manufacturer,
				Description:               component.Description,
				EquipmentType:             component.EquipmentType,
				Structure:                 component.Structure,
				Model:                     component.Model,
				Class:                     component.Class,
				ClassCode:                 component.ClassCode,
				SafetyCritical:            component.SafetyCritical,
				SortOrder:                 component.SortOrder,
			})
			if err != nil {
				return err
			}
		} else {
			if _, err := queries.UpdateComponent(ctx, db.UpdateComponentParams{
				CategoryID:      parentCategory.CategoryID,
				AssetCategoryID: parentCategory.AssetCategoryID,
				Name:            component.Name,
				SerialNumber:    component.SerialNumber,
				Manufacturer:    component.Manufacturer,
				Description:     component.Description,
				EquipmentType:   component.EquipmentType,
				Structure:       component.Structure,
				Model:           component.Model,
				Class:           component.Class,
				ClassCode:       component.ClassCode,
				SafetyCritical:  component.SafetyCritical,
				SortOrder:       component.SortOrder,
				ComponentID:     existingComponent.ComponentID,
			}); err != nil {
				return err
			}
			existingComponent.CategoryID = parentCategory.CategoryID
			existingComponent.AssetCategoryID = parentCategory.AssetCategoryID
			existingComponent.SortOrder = component.SortOrder
		}

		resolvedComponents[component.TemplateComponentID] = existingComponent
	}

	for _, component := range activeComponents {
		if component.SourceTemplateComponentID == "" {
			continue
		}
		if _, exists := activeComponentSources[component.SourceTemplateComponentID]; exists {
			continue
		}
		if _, err := queries.ArchiveActiveRequirementsByComponentID(ctx, component.ComponentID); err != nil {
			return err
		}
		if _, err := queries.ArchiveComponent(ctx, component.ComponentID); err != nil {
			return err
		}
	}

	activeRequirementSources := map[string]struct{}{}
	for _, requirement := range tree.Requirements {
		activeRequirementSources[requirement.TemplateRequirementID] = struct{}{}

		parentComponent, exists := resolvedComponents[requirement.TemplateComponentID]
		if !exists {
			return fmt.Errorf("missing runtime component for template component %s", requirement.TemplateComponentID)
		}

		existingRequirement, found := requirementBySource[requirement.TemplateRequirementID]
		if !found {
			requirementID, err := generateResourceID("req")
			if err != nil {
				return err
			}

			if _, err := queries.CreateComponentRequirement(ctx, db.CreateComponentRequirementParams{
				RequirementID:               requirementID,
				ComponentID:                 parentComponent.ComponentID,
				SourceTemplateRequirementID: requirement.TemplateRequirementID,
				TestID:                      requirement.TestID,
				Label:                       requirement.Label,
				SortOrder:                   requirement.SortOrder,
			}); err != nil {
				return err
			}
		} else {
			if _, err := queries.UpdateComponentRequirement(ctx, db.UpdateComponentRequirementParams{
				ComponentID:   parentComponent.ComponentID,
				TestID:        requirement.TestID,
				Label:         requirement.Label,
				SortOrder:     requirement.SortOrder,
				RequirementID: existingRequirement.RequirementID,
			}); err != nil {
				return err
			}
		}
	}

	for _, requirement := range activeRequirements {
		if requirement.SourceTemplateRequirementID == "" {
			continue
		}
		if _, exists := activeRequirementSources[requirement.SourceTemplateRequirementID]; exists {
			continue
		}
		if _, err := queries.ArchiveComponentRequirement(ctx, requirement.RequirementID); err != nil {
			return err
		}
	}

	return nil
}

func syncLinkedAssetsForTemplate(ctx context.Context, queries *db.Queries, templateID string) error {
	assets, err := queries.GetAssetsByTemplateID(ctx, templateID)
	if err != nil {
		return err
	}

	for _, asset := range assets {
		if err := syncAssetStructureToTemplate(ctx, queries, asset.AssetID, templateID); err != nil {
			return err
		}
	}

	return nil
}

func buildTemplateResponse(ctx context.Context, queries *db.Queries, templateID string) (dto.AssetTemplateResponse, error) {
	tree, err := loadActiveTemplateTree(ctx, queries, templateID)
	if err != nil {
		return dto.AssetTemplateResponse{}, err
	}

	categoryRows, err := queries.GetAllCategoriesPaginated(ctx, db.GetAllCategoriesPaginatedParams{
		Limit:  1000,
		Offset: 0,
	})
	if err != nil {
		return dto.AssetTemplateResponse{}, err
	}

	testTypes, err := queries.GetAllTestTypes(ctx)
	if err != nil {
		return dto.AssetTemplateResponse{}, err
	}

	categoryNames := make(map[string]string, len(categoryRows))
	for _, category := range categoryRows {
		categoryNames[category.CategoryID] = category.CategoryName
	}

	testNames := make(map[string]string, len(testTypes))
	for _, testType := range testTypes {
		testNames[testType.TestID] = testType.TestName
	}

	requirementsByComponent := map[string][]dto.AssetTemplateRequirementResponse{}
	for _, requirement := range tree.Requirements {
		requirementsByComponent[requirement.TemplateComponentID] = append(
			requirementsByComponent[requirement.TemplateComponentID],
			dto.AssetTemplateRequirementResponse{
				TemplateRequirementID: requirement.TemplateRequirementID,
				TestID:                requirement.TestID,
				TestName:              testNames[requirement.TestID],
				Label:                 requirement.Label,
				SortOrder:             requirement.SortOrder,
			},
		)
	}

	componentsByCategory := map[string][]dto.AssetTemplateComponentResponse{}
	for _, component := range tree.Components {
		componentsByCategory[component.TemplateCategoryID] = append(
			componentsByCategory[component.TemplateCategoryID],
			dto.AssetTemplateComponentResponse{
				TemplateComponentID: component.TemplateComponentID,
				Name:                component.Name,
				SerialNumber:        component.SerialNumber,
				Manufacturer:        component.Manufacturer,
				Description:         component.Description,
				EquipmentType:       component.EquipmentType,
				Structure:           component.Structure,
				Model:               component.Model,
				Class:               component.Class,
				ClassCode:           component.ClassCode,
				SafetyCritical:      component.SafetyCritical,
				SortOrder:           component.SortOrder,
				Requirements:        requirementsByComponent[component.TemplateComponentID],
			},
		)
	}

	response := dto.AssetTemplateResponse{
		TemplateID: templateID,
		Name:       tree.Template.Name,
		Categories: make([]dto.AssetTemplateCategoryResponse, 0, len(tree.Categories)),
	}

	for _, category := range tree.Categories {
		response.Categories = append(response.Categories, dto.AssetTemplateCategoryResponse{
			TemplateCategoryID: category.TemplateCategoryID,
			CategoryID:         category.CategoryID,
			CategoryName:       categoryNames[category.CategoryID],
			SortOrder:          category.SortOrder,
			Components:         componentsByCategory[category.TemplateCategoryID],
		})
	}

	return response, nil
}

func mapRequirementRows(rows []db.GetActiveComponentRequirementsByComponentIDRow) []dto.ComponentRequirementResponse {
	result := make([]dto.ComponentRequirementResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, dto.ComponentRequirementResponse{
			RequirementID:               row.RequirementID,
			ComponentID:                 row.ComponentID,
			SourceTemplateRequirementID: row.SourceTemplateRequirementID,
			TestID:                      row.TestID,
			TestName:                    row.TestName,
			ValidityDuration:            row.ValidityDuration,
			TestDescription:             row.TestDescription,
			Label:                       row.Label,
			SortOrder:                   row.SortOrder,
		})
	}
	return result
}
