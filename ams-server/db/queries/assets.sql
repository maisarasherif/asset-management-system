-- name: GetAllAssetsPaginated :many
SELECT
    asset_id,
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    location,
    assigned_project,
    template_id,
    created_at,
    updated_at
FROM assets
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountAssets :one
SELECT COUNT(*) FROM assets;

-- name: GetAssetByID :one
SELECT
    asset_id,
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    location,
    assigned_project,
    template_id,
    created_at,
    updated_at
FROM assets
WHERE asset_id = $1
LIMIT 1;

-- name: CreateAsset :one
INSERT INTO assets (
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    location,
    assigned_project,
    created_at,
    updated_at
)
VALUES (next_display_id('asset_display_id_seq'), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
RETURNING
    asset_id,
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    location,
    assigned_project,
    template_id,
    created_at,
    updated_at;

-- name: CreateAssetFromTemplate :one
INSERT INTO assets (
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    location,
    assigned_project,
    template_id,
    created_at,
    updated_at
)
VALUES (
    next_display_id('asset_display_id_seq'),
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    sqlc.arg(template_id),
    NOW(),
    NOW()
)
RETURNING
    asset_id,
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    location,
    assigned_project,
    template_id,
    created_at,
    updated_at;

-- name: UpdateAsset :execrows
UPDATE assets
SET name = $1, photo = $2, datasheet = $3,
    description = $4, status = $5, location = $6, assigned_project = $7, updated_at = NOW()
WHERE asset_id = sqlc.arg(asset_id);

-- name: DeleteAsset :execrows
DELETE FROM assets WHERE asset_id = $1;
