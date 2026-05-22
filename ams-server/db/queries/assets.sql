-- name: GetAllAssetsPaginated :many
SELECT
    asset_id,
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    asset_kind,
    location,
    assigned_project,
    working_hours,
    working_hours_note,
    maintenance_interval_hours,
    next_maintenance_due_hours,
    maintenance_required_at,
    last_maintenance_completed_at,
    last_maintenance_completed_hours,
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
    asset_kind,
    location,
    assigned_project,
    working_hours,
    working_hours_note,
    maintenance_interval_hours,
    next_maintenance_due_hours,
    maintenance_required_at,
    last_maintenance_completed_at,
    last_maintenance_completed_hours,
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
    asset_kind,
    location,
    assigned_project,
    maintenance_interval_hours,
    next_maintenance_due_hours,
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
    sqlc.arg(asset_kind),
    $6,
    $7,
    sqlc.arg(maintenance_interval_hours),
    sqlc.arg(maintenance_interval_hours),
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
    asset_kind,
    location,
    assigned_project,
    working_hours,
    working_hours_note,
    maintenance_interval_hours,
    next_maintenance_due_hours,
    maintenance_required_at,
    last_maintenance_completed_at,
    last_maintenance_completed_hours,
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
    asset_kind,
    location,
    assigned_project,
    template_id,
    maintenance_interval_hours,
    next_maintenance_due_hours,
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
    'COMPONENTIZED',
    $6,
    $7,
    sqlc.arg(template_id),
    sqlc.arg(maintenance_interval_hours),
    sqlc.arg(maintenance_interval_hours),
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
    asset_kind,
    location,
    assigned_project,
    working_hours,
    working_hours_note,
    maintenance_interval_hours,
    next_maintenance_due_hours,
    maintenance_required_at,
    last_maintenance_completed_at,
    last_maintenance_completed_hours,
    template_id,
    created_at,
    updated_at;

-- name: UpdateAsset :one
UPDATE assets
SET name = $1, photo = $2, datasheet = $3,
    description = $4,
    status = $5,
    location = $6,
    assigned_project = $7,
    maintenance_interval_hours = sqlc.arg(maintenance_interval_hours),
    next_maintenance_due_hours = CASE
        WHEN sqlc.arg(maintenance_interval_hours)::bigint > 0
            THEN last_maintenance_completed_hours + sqlc.arg(maintenance_interval_hours)::bigint
        ELSE 0
    END,
    updated_at = NOW()
WHERE asset_id = sqlc.arg(asset_id)
RETURNING
    asset_id,
    display_id,
    name,
    photo,
    datasheet,
    description,
    status,
    asset_kind,
    location,
    assigned_project,
    working_hours,
    working_hours_note,
    maintenance_interval_hours,
    next_maintenance_due_hours,
    maintenance_required_at,
    last_maintenance_completed_at,
    last_maintenance_completed_hours,
    template_id,
    created_at,
    updated_at;

-- name: DeleteAsset :execrows
DELETE FROM assets WHERE asset_id = $1;
