-- name: GetAllComponentsPaginated :many
SELECT * FROM components
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountComponents :one
SELECT COUNT(*) FROM components;

-- name: GetComponentsByAssetIDPaginated :many
SELECT * FROM components
WHERE asset_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountComponentsByAssetID :one
SELECT COUNT(*) FROM components WHERE asset_id = $1;

-- name: GetComponentByID :one
SELECT * FROM components WHERE component_id = $1 LIMIT 1;

-- name: CreateComponent :one
INSERT INTO components (component_id, asset_id, name, serial_number, manufacturer, description, equipment_type, structure, model, class, class_code, safety_critical, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
RETURNING *;

-- name: UpdateComponent :execrows
UPDATE components
SET name = $1, serial_number = $2, manufacturer = $3, description = $4,
    equipment_type = $5, structure = $6, model = $7, class = $8,
    class_code = $9, safety_critical = $10, updated_at = NOW()
WHERE component_id = $11;

-- name: DeleteComponent :execrows
DELETE FROM components WHERE component_id = $1;