package utils

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

func SpinUpAssetFromTemplate(ctx context.Context, pool *pgxpool.Pool, assetID, templateID string) error {
	queries := db.New(pool)

	templateComponents, err := queries.GetTemplateComponentsByTemplateID(ctx, templateID)
	if err != nil {
		return fmt.Errorf("failed to fetch template components: %w", err)
	}

	for _, tc := range templateComponents {
		componentID, err := GenerateComponentID(ctx, queries, assetID)
		if err != nil {
			return fmt.Errorf("failed to generate component id: %w", err)
		}

		_, err = queries.CreateComponent(ctx, db.CreateComponentParams{
			ComponentID:         componentID,
			AssetID:             assetID,
			CategoryID:          tc.CategoryID,
			Name:                tc.Name,
			SerialNumber:        tc.SerialNumber,
			Manufacturer:        tc.Manufacturer,
			Description:         tc.Description,
			Location:            tc.Location,
			AssignedProject:     tc.AssignedProject,
			EquipmentType:       tc.EquipmentType,
			Structure:           tc.Structure,
			Model:               tc.Model,
			Class:               tc.Class,
			ClassCode:           tc.ClassCode,
			SafetyCritical:      tc.SafetyCritical,
			TemplateComponentID: &tc.TemplateComponentID,
		})
		if err != nil {
			return fmt.Errorf("failed to create component %s: %w", tc.Name, err)
		}

		tests, err := queries.GetTemplateComponentTestsWithDetail(ctx, tc.TemplateComponentID)
		if err != nil {
			return fmt.Errorf("failed to fetch template tests for component %s: %w", tc.Name, err)
		}

		for _, tct := range tests {
			certificateID, err := GenerateCertificateID(ctx, queries, componentID)
			if err != nil {
				return fmt.Errorf("failed to generate certificate id: %w", err)
			}

			_, err = queries.CreatePendingCertificate(ctx, db.CreatePendingCertificateParams{
				CertificateID:           certificateID,
				ComponentID:             componentID,
				CertificateName:         tct.TestName,
				TestID:                  tct.TestID,
				TemplateComponentTestID: &tct.TemplateComponentTestID,
			})
			if err != nil {
				return fmt.Errorf("failed to create pending certificate for test %s: %w", tct.TestName, err)
			}
		}
	}

	return nil
}
