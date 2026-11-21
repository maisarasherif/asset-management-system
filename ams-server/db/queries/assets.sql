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
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) AS quarantined,
    template_id,
    created_at,
    updated_at
FROM assets
WHERE strpos(lower(concat_ws(' ', display_id, name, description, location, assigned_project)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::text = '' OR lower(assigned_project) = lower(sqlc.arg(filter_project)))
  AND (sqlc.arg(filter_status)::text = '' OR CASE WHEN sqlc.arg(filter_status) = 'QUARANTINED' THEN EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) ELSE lower(status) = lower(sqlc.arg(filter_status)) AND NOT EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) END)
ORDER BY created_at DESC, asset_id
LIMIT $1 OFFSET $2;

-- name: CountAssets :one
SELECT COUNT(*) FROM assets
WHERE strpos(lower(concat_ws(' ', display_id, name, description, location, assigned_project)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::text = '' OR lower(assigned_project) = lower(sqlc.arg(filter_project)))
  AND (sqlc.arg(filter_status)::text = '' OR CASE WHEN sqlc.arg(filter_status) = 'QUARANTINED' THEN EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) ELSE lower(status) = lower(sqlc.arg(filter_status)) AND NOT EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) END);

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
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) AS quarantined,
    template_id,
    created_at,
    updated_at
FROM assets
WHERE assets.asset_id = $1
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
    created_at,
    updated_at
)
VALUES (
    allocate_display_id('assets.display_id', 'assets'::REGCLASS),
    $1,
    $2,
    $3,
    $4,
    $5,
    sqlc.arg(asset_kind),
    $6,
    $7,
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
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) AS quarantined,
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
    created_at,
    updated_at
)
VALUES (
    allocate_display_id('assets.display_id', 'assets'::REGCLASS),
    $1,
    $2,
    $3,
    $4,
    $5,
    'COMPONENTIZED',
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
    asset_kind,
    location,
    assigned_project,
    working_hours,
    working_hours_note,
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) AS quarantined,
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
    updated_at = NOW()
WHERE assets.asset_id = sqlc.arg(asset_id)
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
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = assets.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) AS quarantined,
    template_id,
    created_at,
    updated_at;

-- name: DeleteAsset :execrows
DELETE FROM assets WHERE assets.asset_id = $1;
