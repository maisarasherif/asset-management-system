package utils

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"

	"github.com/jackc/pgx/v5"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

const (
	idSegmentUpperBound = 10000
	maxIDGenerationTry  = 256
)

func generateFourDigitSegment() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(idSegmentUpperBound))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%04d", n.Int64()), nil
}

func GenerateAssetID(ctx context.Context, queries *db.Queries) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}

		_, err = queries.GetAssetByID(ctx, segment)
		if errors.Is(err, pgx.ErrNoRows) {
			return segment, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique asset id after %d attempts", maxIDGenerationTry)
}

func GenerateComponentID(ctx context.Context, queries *db.Queries, assetID string) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}

		componentID := fmt.Sprintf("%s.%s", assetID, segment)
		_, err = queries.GetComponentByID(ctx, componentID)
		if errors.Is(err, pgx.ErrNoRows) {
			return componentID, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique component id after %d attempts", maxIDGenerationTry)
}

func GenerateCertificateID(ctx context.Context, queries *db.Queries, componentID string) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}

		certificateID := fmt.Sprintf("%s.%s", componentID, segment)
		_, err = queries.GetCertificateByID(ctx, certificateID)
		if errors.Is(err, pgx.ErrNoRows) {
			return certificateID, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique certificate id after %d attempts", maxIDGenerationTry)
}

func GenerateTemplateComponentID(ctx context.Context, queries *db.Queries, templateID string) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}
		id := fmt.Sprintf("%s.%s", templateID, segment)
		_, err = queries.GetTemplateComponentByID(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return id, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique template component id after %d attempts", maxIDGenerationTry)
}

func GenerateTemplateComponentTestID(ctx context.Context, queries *db.Queries, templateComponentID string) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}
		id := fmt.Sprintf("%s.%s", templateComponentID, segment)
		_, err = queries.GetTemplateComponentTestByID(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return id, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique template component test id after %d attempts", maxIDGenerationTry)
}

func GenerateTemplateID(ctx context.Context, queries *db.Queries) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}
		_, err = queries.GetAssetTemplateByID(ctx, segment)
		if errors.Is(err, pgx.ErrNoRows) {
			return segment, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique template id after %d attempts", maxIDGenerationTry)
}

func GenerateCategoryID(ctx context.Context, queries *db.Queries) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}
		_, err = queries.GetCategoryByID(ctx, segment)
		if errors.Is(err, pgx.ErrNoRows) {
			return segment, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique category id after %d attempts", maxIDGenerationTry)
}

func GenerateMainCategoryID(ctx context.Context, queries *db.Queries) (string, error) {
	for i := 0; i < maxIDGenerationTry; i++ {
		segment, err := generateFourDigitSegment()
		if err != nil {
			return "", err
		}
		_, err = queries.GetMainCategoryByID(ctx, segment)
		if errors.Is(err, pgx.ErrNoRows) {
			return segment, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("failed to generate unique main category id after %d attempts", maxIDGenerationTry)
}
