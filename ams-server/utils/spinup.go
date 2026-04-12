package utils

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func SpinUpAssetFromTemplate(ctx context.Context, tx pgx.Tx, assetID, templateID string) error {
	var insertedComponents int32
	if err := tx.QueryRow(
		ctx,
		"SELECT spin_up_asset_from_template_by_business_id($1, $2)",
		assetID,
		templateID,
	).Scan(&insertedComponents); err != nil {
		return fmt.Errorf("failed to bulk spin up asset from current template: %w", err)
	}

	return nil
}
