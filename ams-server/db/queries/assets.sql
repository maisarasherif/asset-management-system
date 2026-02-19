-- name: GetAllAssets :many
SELECT * FROM assets ORDER BY created_at DESC;

-- name: GetAssetByID :one
SELECT * FROM assets WHERE asset_id = $1 LIMIT 1;

-- name: CreateAsset :one
INSERT INTO assets (asset_id, name, category_id, photo, datasheet, description, status, location, assigned_project, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
RETURNING *;

-- name: UpdateAsset :execrows
UPDATE assets
SET name = $1, category_id = $2, photo = $3, datasheet = $4,
    description = $5, status = $6, location = $7, assigned_project = $8, updated_at = NOW()
WHERE asset_id = $9;

-- name: DeleteAsset :execrows
DELETE FROM assets WHERE asset_id = $1;