-- name: LockAssetForMaintenance :one
SELECT
    asset_id,
    display_id,
    name,
    status,
    working_hours,
    maintenance_interval_hours,
    next_maintenance_due_hours
FROM assets
WHERE asset_id = $1
FOR UPDATE;

-- name: UpdateAssetWorkingHours :one
UPDATE assets
SET
    working_hours = sqlc.arg(working_hours),
    working_hours_note = sqlc.arg(working_hours_note),
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

-- name: MarkAssetMaintenanceRequired :one
UPDATE assets
SET
    status = 'MAINTENANCE',
    maintenance_required_at = COALESCE(maintenance_required_at, NOW()),
    updated_at = NOW()
WHERE asset_id = $1
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

-- name: CreateAssetMaintenanceEvent :one
INSERT INTO asset_maintenance_events (
    display_id,
    asset_id,
    due_at_hours,
    triggered_at_hours,
    previous_asset_status,
    status
)
VALUES (
    allocate_display_id('asset_maintenance_events.display_id', 'asset_maintenance_events'::REGCLASS),
    sqlc.arg(asset_id),
    sqlc.arg(due_at_hours),
    sqlc.arg(triggered_at_hours),
    sqlc.arg(previous_asset_status),
    'REQUIRED'
)
RETURNING
    maintenance_event_id,
    display_id,
    asset_id,
    due_at_hours,
    triggered_at_hours,
    previous_asset_status,
    status,
    completed_at,
    completion_notes,
    created_at;

-- name: GetOpenAssetMaintenanceEvent :one
SELECT
    maintenance_event_id,
    display_id,
    asset_id,
    due_at_hours,
    triggered_at_hours,
    previous_asset_status,
    status,
    completed_at,
    completion_notes,
    created_at
FROM asset_maintenance_events
WHERE asset_id = $1
  AND status = 'REQUIRED'
ORDER BY created_at DESC
LIMIT 1;

-- name: ListAssetMaintenanceEvents :many
SELECT
    maintenance_event_id,
    display_id,
    asset_id,
    due_at_hours,
    triggered_at_hours,
    previous_asset_status,
    status,
    completed_at,
    completion_notes,
    created_at
FROM asset_maintenance_events
WHERE asset_id = $1
ORDER BY created_at DESC;

-- name: CompleteOpenAssetMaintenanceEvent :one
UPDATE asset_maintenance_events
SET
    status = 'COMPLETED',
    completed_at = NOW(),
    completion_notes = sqlc.arg(completion_notes)
WHERE asset_id = sqlc.arg(asset_id)
  AND status = 'REQUIRED'
RETURNING
    maintenance_event_id,
    display_id,
    asset_id,
    due_at_hours,
    triggered_at_hours,
    previous_asset_status,
    status,
    completed_at,
    completion_notes,
    created_at;

-- name: MarkAssetMaintenanceCompleted :one
UPDATE assets
SET
    status = CASE
        WHEN sqlc.arg(previous_asset_status)::text IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')
            THEN sqlc.arg(previous_asset_status)::text
        ELSE 'ACTIVE'
    END,
    maintenance_required_at = NULL,
    last_maintenance_completed_at = NOW(),
    last_maintenance_completed_hours = working_hours,
    next_maintenance_due_hours = CASE
        WHEN maintenance_interval_hours > 0 THEN working_hours + maintenance_interval_hours
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
