
-- name: FindOpenMaintenanceQuarantine :one
SELECT * FROM maintenance_quarantines
WHERE asset_id = $1 AND component_id IS NOT DISTINCT FROM sqlc.narg(component_id) AND released_at IS NULL;

-- name: CreateMaintenanceQuarantine :one
INSERT INTO maintenance_quarantines (asset_id, component_id, reason, tagged_by)
VALUES ($1,$2,$3,$4) RETURNING *;

-- name: LinkMaintenanceQuarantineOrder :exec
INSERT INTO maintenance_quarantine_orders (quarantine_id, work_order_id)
VALUES ($1,$2) ON CONFLICT DO NOTHING;

-- name: GetMaintenanceQuarantine :one
SELECT * FROM maintenance_quarantines WHERE quarantine_id = $1;

-- name: GetBlockingMaintenanceWorkOrders :many
SELECT w.* FROM maintenance_quarantine_orders qo
JOIN maintenance_work_orders w USING (work_order_id)
WHERE qo.quarantine_id = $1 AND w.status IN ('OPEN','IN_PROGRESS')
ORDER BY w.created_at, w.work_order_id;

-- name: ReleaseMaintenanceQuarantine :one
UPDATE maintenance_quarantines SET released_at = now(), released_by = $2, release_notes = $3
WHERE quarantine_id = $1 AND released_at IS NULL RETURNING *;

-- name: ListMaintenanceQuarantines :many
SELECT q.*, a.name AS asset_name, COALESCE(c.name,'') AS component_name,
    COALESCE(NULLIF(trim(concat(t.first_name,' ',t.last_name)), ''), t.email, '') AS tagged_by_name,
    COALESCE(NULLIF(trim(concat(r.first_name,' ',r.last_name)), ''), r.email, '') AS released_by_name,
    (SELECT count(*) FROM maintenance_quarantine_orders qo JOIN maintenance_work_orders w USING (work_order_id)
     WHERE qo.quarantine_id = q.quarantine_id AND w.status IN ('OPEN','IN_PROGRESS')) AS blocking_orders
FROM maintenance_quarantines q JOIN assets a USING (asset_id) LEFT JOIN components c USING (component_id)
LEFT JOIN users t ON t.user_id = q.tagged_by LEFT JOIN users r ON r.user_id = q.released_by
WHERE (sqlc.arg(include_released)::boolean OR q.released_at IS NULL)
  AND (sqlc.narg(filter_asset)::uuid IS NULL OR q.asset_id = sqlc.narg(filter_asset))
ORDER BY q.tagged_at DESC, q.quarantine_id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountMaintenanceQuarantines :one
SELECT count(*) FROM maintenance_quarantines q
WHERE (sqlc.arg(include_released)::boolean OR q.released_at IS NULL)
  AND (sqlc.narg(filter_asset)::uuid IS NULL OR q.asset_id = sqlc.narg(filter_asset));
