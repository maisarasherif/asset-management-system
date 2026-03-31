-- name: GetAllComponentsPaginated :many
SELECT * FROM components
WHERE is_archived = FALSE
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountComponents :one
SELECT COUNT(*) FROM components WHERE is_archived = FALSE;

-- name: GetComponentsByAssetIDPaginated :many
SELECT * FROM components
WHERE asset_id = $1 AND is_archived = FALSE
ORDER BY sort_order ASC, created_at ASC
LIMIT $2 OFFSET $3;

-- name: GetAllActiveComponentsByAssetID :many
SELECT * FROM components
WHERE asset_id = $1 AND is_archived = FALSE
ORDER BY sort_order ASC, created_at ASC;

-- name: CountComponentsByAssetID :one
SELECT COUNT(*) FROM components WHERE asset_id = $1 AND is_archived = FALSE;

-- name: GetComponentByID :one
SELECT * FROM components WHERE component_id = $1 AND is_archived = FALSE LIMIT 1;

-- name: GetComponentByIDAny :one
SELECT * FROM components WHERE component_id = $1 LIMIT 1;

-- name: CountComponentsByCategoryID :one
SELECT COUNT(*) FROM components WHERE category_id = $1;

-- name: CountComponentsByAssetCategoryID :one
SELECT COUNT(*) FROM components
WHERE asset_category_id = $1 AND is_archived = FALSE;

-- name: CreateComponent :one
INSERT INTO components (component_id, asset_id, category_id, asset_category_id, source_template_component_id, name, serial_number, manufacturer, description, equipment_type, structure, model, class, class_code, safety_critical, sort_order, is_archived, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, FALSE, NOW(), NOW())
RETURNING *;

-- name: UpdateComponent :execrows
UPDATE components
SET category_id = $1, asset_category_id = $2, name = $3, serial_number = $4, manufacturer = $5, description = $6,
    equipment_type = $7, structure = $8, model = $9, class = $10,
    class_code = $11, safety_critical = $12, sort_order = $13, updated_at = NOW()
WHERE component_id = $14;

-- name: ArchiveComponent :execrows
UPDATE components
SET is_archived = TRUE, updated_at = NOW()
WHERE component_id = $1;

-- name: ArchiveActiveComponentsByAssetID :execrows
UPDATE components
SET is_archived = TRUE, updated_at = NOW()
WHERE asset_id = $1 AND is_archived = FALSE;

-- name: DeleteComponent :execrows
DELETE FROM components WHERE component_id = $1;
