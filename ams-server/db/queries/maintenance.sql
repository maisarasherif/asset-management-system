
-- name: LockMaintenanceAsset :one
SELECT * FROM assets WHERE asset_id = $1 FOR UPDATE;

-- name: SaveMaintenanceMeter :exec
UPDATE assets SET working_hours = sqlc.arg(working_hours), working_hours_note = sqlc.arg(note), updated_at = now()
WHERE asset_id = sqlc.arg(asset_id);

-- name: GetMaintenanceComponent :one
SELECT asset_id, component_kind FROM components WHERE component_id = $1;

-- name: CreateMaintenancePlan :one
INSERT INTO maintenance_plans (asset_id, component_id, title, interval_hours, interval_months,
    next_due_hours, next_due_date, quarantine_when_due, active)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *;

-- name: UpdateMaintenancePlan :one
UPDATE maintenance_plans SET title = $2, interval_hours = $3, interval_months = $4,
    next_due_hours = $5, next_due_date = $6, quarantine_when_due = $7, active = $8
WHERE plan_id = $1 RETURNING *;

-- name: GetMaintenancePlan :one
SELECT * FROM maintenance_plans WHERE plan_id = $1;

-- name: AdvanceMaintenancePlan :exec
UPDATE maintenance_plans SET next_due_hours = $2, next_due_date = $3 WHERE plan_id = $1;

-- name: ListMaintenancePlans :many
SELECT p.*, a.name AS asset_name, COALESCE(c.name, '') AS component_name, a.working_hours
FROM maintenance_plans p JOIN assets a USING (asset_id) LEFT JOIN components c USING (component_id)
WHERE (sqlc.narg(filter_asset)::uuid IS NULL OR p.asset_id = sqlc.narg(filter_asset))
  AND (NOT sqlc.arg(active_only)::boolean OR p.active)
ORDER BY CASE WHEN sqlc.arg(sort_by)::text = 'next_due_hours' THEN p.next_due_hours END ASC NULLS LAST,
         CASE WHEN sqlc.arg(sort_by)::text = 'next_due_date' THEN p.next_due_date END ASC NULLS LAST,
         p.title, p.plan_id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountMaintenancePlans :one
SELECT count(*) FROM maintenance_plans
WHERE (sqlc.narg(filter_asset)::uuid IS NULL OR asset_id = sqlc.narg(filter_asset))
  AND (NOT sqlc.arg(active_only)::boolean OR active);

-- name: MaintenanceDueAssets :many
SELECT DISTINCT p.asset_id
FROM maintenance_plans p JOIN assets a USING (asset_id)
WHERE p.active AND (p.next_due_date <= sqlc.arg(today)::date OR p.next_due_hours <= a.working_hours)
AND NOT EXISTS (SELECT 1 FROM maintenance_work_orders w WHERE w.plan_id = p.plan_id AND w.status IN ('OPEN','IN_PROGRESS'))
ORDER BY p.asset_id;

-- name: LockDueMaintenancePlans :many
SELECT * FROM maintenance_plans p
WHERE p.asset_id = sqlc.arg(asset_id) AND p.active
AND (p.next_due_date <= sqlc.arg(today)::date OR p.next_due_hours <= sqlc.arg(working_hours)::bigint)
AND NOT EXISTS (SELECT 1 FROM maintenance_work_orders w WHERE w.plan_id = p.plan_id AND w.status IN ('OPEN','IN_PROGRESS'))
ORDER BY p.plan_id FOR UPDATE;

-- name: CreateMaintenanceWorkOrder :one
INSERT INTO maintenance_work_orders (display_id, asset_id, component_id, plan_id, title, description, created_by, due_hours, due_date)
VALUES (allocate_display_id('maintenance_work_orders.display_id', 'maintenance_work_orders'::regclass), $1,$2,$3,$4,$5,$6,$7,$8)
RETURNING *;

-- name: GetMaintenanceWorkOrder :one
SELECT * FROM maintenance_work_orders WHERE work_order_id = $1;

-- name: GetMaintenanceWorkOrderDetail :one
SELECT * FROM shared_work_orders WHERE work_order_id = $1;

-- name: LockMaintenanceWorkOrder :one
SELECT * FROM maintenance_work_orders WHERE work_order_id = $1 FOR UPDATE;

-- name: UpdateMaintenanceAssignee :exec
UPDATE maintenance_work_orders SET assignee_id = $2 WHERE work_order_id = $1;

-- name: StartMaintenanceWorkOrder :exec
UPDATE maintenance_work_orders SET status = 'IN_PROGRESS' WHERE work_order_id = $1;

-- name: CloseMaintenanceWorkOrder :exec
UPDATE maintenance_work_orders SET status = $2, closed_by = $3, closed_at = now(), completion_notes = $4
WHERE work_order_id = $1;

-- name: ListMaintenanceWorkOrders :many
SELECT w.* FROM shared_work_orders w
WHERE (sqlc.narg(filter_asset)::uuid IS NULL OR w.asset_id = sqlc.narg(filter_asset))
  AND (sqlc.narg(filter_component)::uuid IS NULL OR w.component_id = sqlc.narg(filter_component))
  AND (sqlc.arg(filter_status)::text = '' OR w.status = sqlc.arg(filter_status))
  AND (NOT sqlc.arg(open_only)::boolean OR w.status IN ('OPEN', 'IN_PROGRESS'))
  AND (sqlc.arg(filter_type)::text = '' OR w.work_type = sqlc.arg(filter_type)
       OR (w.work_type = 'MAINTENANCE' AND
           ((sqlc.arg(filter_type) = 'ROUTINE' AND w.plan_id IS NOT NULL)
            OR (sqlc.arg(filter_type) = 'NON_ROUTINE' AND w.plan_id IS NULL))))
  AND (sqlc.arg(due_window)::text = ''
       OR (sqlc.arg(due_window) = 'OVERDUE' AND w.due_date < sqlc.arg(as_of)::text::date)
       OR (sqlc.arg(due_window) = 'DUE_SOON' AND w.due_date BETWEEN sqlc.arg(as_of)::text::date AND sqlc.arg(as_of)::text::date + 30))
  AND (sqlc.narg(from_date)::date IS NULL OR (w.created_at AT TIME ZONE 'Asia/Dubai')::date >= sqlc.narg(from_date))
  AND (sqlc.narg(to_date)::date IS NULL OR (w.created_at AT TIME ZONE 'Asia/Dubai')::date <= sqlc.narg(to_date))
  AND strpos(lower(concat_ws(' ', w.display_id, w.title, w.description, w.asset_number, w.asset_name, w.component_name)), lower(sqlc.arg(search)::text)) > 0
ORDER BY CASE WHEN sqlc.arg(open_only)::boolean THEN w.due_date END ASC NULLS LAST,
         w.created_at DESC, w.work_order_id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountMaintenanceWorkOrders :one
SELECT count(*)
FROM shared_work_orders w
WHERE (sqlc.narg(filter_asset)::uuid IS NULL OR w.asset_id = sqlc.narg(filter_asset))
  AND (sqlc.narg(filter_component)::uuid IS NULL OR w.component_id = sqlc.narg(filter_component))
  AND (sqlc.arg(filter_status)::text = '' OR w.status = sqlc.arg(filter_status))
  AND (NOT sqlc.arg(open_only)::boolean OR w.status IN ('OPEN', 'IN_PROGRESS'))
  AND (sqlc.arg(filter_type)::text = '' OR w.work_type = sqlc.arg(filter_type)
       OR (w.work_type = 'MAINTENANCE' AND
           ((sqlc.arg(filter_type) = 'ROUTINE' AND w.plan_id IS NOT NULL)
            OR (sqlc.arg(filter_type) = 'NON_ROUTINE' AND w.plan_id IS NULL))))
  AND (sqlc.arg(due_window)::text = ''
       OR (sqlc.arg(due_window) = 'OVERDUE' AND w.due_date < sqlc.arg(as_of)::text::date)
       OR (sqlc.arg(due_window) = 'DUE_SOON' AND w.due_date BETWEEN sqlc.arg(as_of)::text::date AND sqlc.arg(as_of)::text::date + 30))
  AND (sqlc.narg(from_date)::date IS NULL OR (w.created_at AT TIME ZONE 'Asia/Dubai')::date >= sqlc.narg(from_date))
  AND (sqlc.narg(to_date)::date IS NULL OR (w.created_at AT TIME ZONE 'Asia/Dubai')::date <= sqlc.narg(to_date))
  AND strpos(lower(concat_ws(' ', w.display_id, w.title, w.description, w.asset_number, w.asset_name, w.component_name)), lower(sqlc.arg(search)::text)) > 0;

-- name: ListMaintenanceTechnicians :many
SELECT user_id, first_name, last_name, email FROM users
WHERE status = 'ACTIVE' AND role IN ('USER','ADMIN','SUPER_ADMIN')
  AND strpos(lower(concat_ws(' ', first_name, last_name, email)), lower(sqlc.arg(search)::text)) > 0
ORDER BY first_name, last_name, user_id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountMaintenanceTechnicians :one
SELECT count(*) FROM users
WHERE status = 'ACTIVE' AND role IN ('USER','ADMIN','SUPER_ADMIN')
  AND strpos(lower(concat_ws(' ', first_name, last_name, email)), lower(sqlc.arg(search)::text)) > 0;

-- name: IsMaintenanceTechnician :one
SELECT EXISTS (SELECT 1 FROM users WHERE user_id = $1 AND status = 'ACTIVE' AND role IN ('USER','ADMIN','SUPER_ADMIN'));
