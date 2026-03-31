-- name: GetActiveAssetCategoriesByAssetID :many
SELECT * FROM asset_categories
WHERE asset_id = $1 AND is_archived = FALSE
ORDER BY sort_order ASC, created_at ASC;

-- name: CreateAssetCategory :one
INSERT INTO asset_categories (
    asset_category_id, asset_id, category_id, source_template_category_id, sort_order, is_archived, created_at, updated_at
)
VALUES ($1, $2, $3, $4, $5, FALSE, NOW(), NOW())
RETURNING *;

-- name: UpdateAssetCategory :execrows
UPDATE asset_categories
SET category_id = $1, sort_order = $2, updated_at = NOW()
WHERE asset_category_id = $3;

-- name: ArchiveAssetCategory :execrows
UPDATE asset_categories
SET is_archived = TRUE, updated_at = NOW()
WHERE asset_category_id = $1 AND is_archived = FALSE;

-- name: ArchiveActiveAssetCategoriesByAssetID :execrows
UPDATE asset_categories
SET is_archived = TRUE, updated_at = NOW()
WHERE asset_id = $1 AND is_archived = FALSE;
