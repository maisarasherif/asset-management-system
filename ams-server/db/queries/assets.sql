-- name: GetAllAssetsPaginated :many
SELECT * FROM assets
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountAssets :one
SELECT COUNT(*) FROM assets;

-- name: GetAssetByID :one
SELECT * FROM assets WHERE asset_id = $1 LIMIT 1;

-- name: GetAssetsByTemplateID :many
SELECT * FROM assets
WHERE template_id = $1
ORDER BY created_at DESC;

-- name: CreateAsset :one
INSERT INTO assets (asset_id, name, photo, datasheet, description, status, location, assigned_project, template_id, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
RETURNING *;

-- name: UpdateAsset :execrows
UPDATE assets
SET name = $1, photo = $2, datasheet = $3,
    description = $4, status = $5, location = $6, assigned_project = $7, template_id = $8, updated_at = NOW()
WHERE asset_id = $9;

-- name: UpdateAssetTemplateID :execrows
UPDATE assets
SET template_id = $1, updated_at = NOW()
WHERE asset_id = $2;

-- name: DeleteAsset :execrows
DELETE FROM assets WHERE asset_id = $1;
