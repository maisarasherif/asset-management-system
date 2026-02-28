package controllers

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

func generateAssetID(ctx context.Context, queries *db.Queries) (string, error) {
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

func generateComponentID(ctx context.Context, queries *db.Queries, assetID string) (string, error) {
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

func generateCertificateID(ctx context.Context, queries *db.Queries, componentID string) (string, error) {
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
