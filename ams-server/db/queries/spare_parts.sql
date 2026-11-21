
-- name: CreateMaintenanceStore :one
INSERT INTO maintenance_stores (project_id) VALUES ($1) RETURNING *;

-- name: ListMaintenanceStores :many
SELECT s.*, COALESCE(p.project_name, 'Warehouse') AS name
FROM maintenance_stores s LEFT JOIN projects p USING (project_id)
ORDER BY s.project_id IS NOT NULL, name, s.store_id;

-- name: CreateMaintenancePart :one
INSERT INTO maintenance_parts (part_number, name) VALUES ($1,$2) RETURNING *;

-- name: ListMaintenanceStock :many
SELECT p.*, COALESCE(s.quantity, 0)::bigint AS quantity, COALESCE(s.version, 0)::bigint AS version
FROM maintenance_parts p LEFT JOIN maintenance_stock s ON s.part_id = p.part_id AND s.store_id = sqlc.arg(store_id)
WHERE strpos(lower(concat_ws(' ', p.part_number, p.name)), lower(sqlc.arg(search)::text)) > 0
AND (NOT sqlc.arg(in_stock)::boolean OR s.quantity > 0)
ORDER BY p.part_number, p.part_id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountMaintenanceStock :one
SELECT count(*) FROM maintenance_parts p LEFT JOIN maintenance_stock s ON s.part_id = p.part_id AND s.store_id = sqlc.arg(store_id)
WHERE strpos(lower(concat_ws(' ', p.part_number, p.name)), lower(sqlc.arg(search)::text)) > 0
AND (NOT sqlc.arg(in_stock)::boolean OR s.quantity > 0);

-- name: EnsureMaintenanceStock :exec
INSERT INTO maintenance_stock (store_id, part_id) VALUES ($1,$2) ON CONFLICT DO NOTHING;

-- name: LockMaintenanceStock :one
SELECT * FROM maintenance_stock WHERE store_id = $1 AND part_id = $2 FOR UPDATE;

-- name: SaveMaintenanceStock :one
UPDATE maintenance_stock SET quantity = $3, version = version + 1 WHERE store_id = $1 AND part_id = $2 RETURNING *;

-- name: CreateMaintenanceUsage :one
INSERT INTO maintenance_part_usage (usage_id, work_order_id, store_id, part_id, quantity, recorded_by)
VALUES ($1,$2,$3,$4,$5,$6) RETURNING *;

-- name: GetMaintenanceUsage :one
SELECT * FROM maintenance_part_usage WHERE usage_id = $1;

-- name: SaveMaintenanceUsage :one
UPDATE maintenance_part_usage SET quantity = $2, version = version + 1 WHERE usage_id = $1 RETURNING *;

-- name: CreateMaintenanceStockChange :exec
INSERT INTO maintenance_stock_changes (change_id, usage_id, store_id, part_id, previous_quantity, quantity, resulting_usage, reason, changed_by)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);

-- name: GetMaintenanceStockChange :one
SELECT * FROM maintenance_stock_changes WHERE change_id = $1;

-- name: ListMaintenanceStockChanges :many
SELECT sc.*, COALESCE(NULLIF(trim(concat(u.first_name,' ',u.last_name)), ''), u.email, '') AS actor_name
FROM maintenance_stock_changes sc LEFT JOIN users u ON u.user_id = sc.changed_by
WHERE store_id = $1 AND part_id = $2
ORDER BY changed_at DESC, change_id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountMaintenanceStockChanges :one
SELECT count(*) FROM maintenance_stock_changes WHERE store_id = $1 AND part_id = $2;

-- name: ListMaintenanceUsage :many
SELECT m.*, w.display_id AS work_order_number, w.asset_id, a.name AS asset_name, p.part_number, p.name AS part_name,
    COALESCE(pr.project_name, 'Warehouse') AS store_name,
    COALESCE(NULLIF(trim(concat(u.first_name,' ',u.last_name)), ''), u.email, '') AS actor_name
FROM maintenance_part_usage m JOIN maintenance_work_orders w USING (work_order_id)
JOIN assets a ON a.asset_id = w.asset_id JOIN maintenance_parts p USING (part_id)
JOIN maintenance_stores s USING (store_id) LEFT JOIN projects pr USING (project_id)
LEFT JOIN users u ON u.user_id = m.recorded_by
WHERE (sqlc.narg(filter_order)::uuid IS NULL OR m.work_order_id = sqlc.narg(filter_order))
  AND (sqlc.narg(filter_asset)::uuid IS NULL OR w.asset_id = sqlc.narg(filter_asset))
  AND (sqlc.narg(filter_store)::uuid IS NULL OR m.store_id = sqlc.narg(filter_store))
  AND (sqlc.narg(filter_part)::uuid IS NULL OR m.part_id = sqlc.narg(filter_part))
  AND (sqlc.narg(from_date)::date IS NULL OR (m.recorded_at AT TIME ZONE 'Asia/Dubai')::date >= sqlc.narg(from_date))
  AND (sqlc.narg(to_date)::date IS NULL OR (m.recorded_at AT TIME ZONE 'Asia/Dubai')::date <= sqlc.narg(to_date))
ORDER BY m.recorded_at DESC, m.usage_id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountMaintenanceUsage :one
SELECT count(*) FROM maintenance_part_usage m JOIN maintenance_work_orders w USING (work_order_id)
WHERE (sqlc.narg(filter_order)::uuid IS NULL OR m.work_order_id = sqlc.narg(filter_order))
  AND (sqlc.narg(filter_asset)::uuid IS NULL OR w.asset_id = sqlc.narg(filter_asset))
  AND (sqlc.narg(filter_store)::uuid IS NULL OR m.store_id = sqlc.narg(filter_store))
  AND (sqlc.narg(filter_part)::uuid IS NULL OR m.part_id = sqlc.narg(filter_part))
  AND (sqlc.narg(from_date)::date IS NULL OR (m.recorded_at AT TIME ZONE 'Asia/Dubai')::date >= sqlc.narg(from_date))
  AND (sqlc.narg(to_date)::date IS NULL OR (m.recorded_at AT TIME ZONE 'Asia/Dubai')::date <= sqlc.narg(to_date));
