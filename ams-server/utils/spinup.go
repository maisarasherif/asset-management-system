package utils

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func SpinUpAssetFromTemplate(ctx context.Context, tx pgx.Tx, assetID, templateID uuid.UUID) error {
	var insertedComponents int32
	if err := tx.QueryRow(
		ctx,
		"SELECT spin_up_asset_from_template($1::uuid, $2::uuid)",
		assetID,
		templateID,
	).Scan(&insertedComponents); err != nil {
		return fmt.Errorf("failed to bulk spin up asset from current template: %w", err)
	}

	return nil
}
