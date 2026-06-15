package controllers

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func parseCompetencyCategoryIDs(values []string) ([]uuid.UUID, error) {
	categoryIDs := make([]uuid.UUID, 0, len(values))
	seen := make(map[uuid.UUID]bool, len(values))
	for _, value := range values {
		categoryID, err := utils.ParseUUID(value, "competency_category_id")
		if err != nil {
			return nil, err
		}
		if seen[categoryID] {
			continue
		}
		seen[categoryID] = true
		categoryIDs = append(categoryIDs, categoryID)
	}
	return categoryIDs, nil
}

func validateActiveCompetencyCategoryIDs(ctx context.Context, queries *db.Queries, categoryIDs []uuid.UUID) error {
	if len(categoryIDs) == 0 {
		return nil
	}

	count, err := queries.CountActiveCompetencyCategoriesByIDs(ctx, categoryIDs)
	if err != nil {
		return fmt.Errorf("failed to validate competency categories")
	}
	if count != int64(len(categoryIDs)) {
		return fmt.Errorf("all competency categories must be active")
	}
	return nil
}

func buildCompetencyCategoryRules(categories []db.CompetencyCategory) ([]string, []dto.CompetencyCategoryRuleResponse) {
	categoryIDs := make([]string, 0, len(categories))
	rules := make([]dto.CompetencyCategoryRuleResponse, 0, len(categories))
	for _, category := range categories {
		categoryIDs = append(categoryIDs, category.CompetencyCategoryID.String())
		rules = append(rules, dto.CompetencyCategoryRuleResponse{
			CompetencyCategoryID: category.CompetencyCategoryID.String(),
			CategoryCode:         category.CategoryCode,
			CategoryName:         category.CategoryName,
			Description:          category.Description,
			Active:               category.Active,
		})
	}
	return categoryIDs, rules
}

func setTemplateComponentTestCompetencyCategories(ctx context.Context, queries *db.Queries, templateComponentTestID uuid.UUID, categoryIDs []uuid.UUID) error {
	if _, err := queries.DeleteTemplateComponentTestCompetencyCategories(ctx, templateComponentTestID); err != nil {
		return err
	}
	for _, categoryID := range categoryIDs {
		if _, err := queries.AddTemplateComponentTestCompetencyCategory(ctx, db.AddTemplateComponentTestCompetencyCategoryParams{
			TemplateComponentTestID: templateComponentTestID,
			CompetencyCategoryID:    categoryID,
		}); err != nil {
			return err
		}
	}
	return nil
}

func setCertificateCompetencyCategories(ctx context.Context, queries *db.Queries, certificateID uuid.UUID, categoryIDs []uuid.UUID) error {
	if _, err := queries.DeleteCertificateCompetencyCategories(ctx, certificateID); err != nil {
		return err
	}
	for _, categoryID := range categoryIDs {
		if _, err := queries.AddCertificateCompetencyCategory(ctx, db.AddCertificateCompetencyCategoryParams{
			CertificateID:        certificateID,
			CompetencyCategoryID: categoryID,
		}); err != nil {
			return err
		}
	}
	return nil
}
