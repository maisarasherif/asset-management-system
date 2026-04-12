-- name: GetAllComponentsPaginated :many
SELECT
    id,
    component_id,
    asset_id,
    category_id,
    name,
    serial_number,
    manufacturer,
    description,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    updated_at,
    location,
    assigned_project
FROM components
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountComponents :one
SELECT COUNT(*) FROM components;

-- name: GetComponentsByAssetIDPaginated :many
SELECT
    id,
    component_id,
    asset_id,
    category_id,
    name,
    serial_number,
    manufacturer,
    description,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    updated_at,
    location,
    assigned_project
FROM components
WHERE asset_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountComponentsByAssetID :one
SELECT COUNT(*) FROM components WHERE asset_id = $1;

-- name: GetComponentByID :one
SELECT
    id,
    component_id,
    asset_id,
    category_id,
    name,
    serial_number,
    manufacturer,
    description,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    updated_at,
    location,
    assigned_project
FROM components
WHERE component_id = $1
LIMIT 1;

-- name: CountComponentsByCategoryID :one
SELECT COUNT(*) FROM components WHERE category_id = $1;

-- name: CreateComponent :one
INSERT INTO components (
    asset_id, asset_ref_id, category_id, category_ref_id, name, serial_number, manufacturer,
    description, location, assigned_project, equipment_type, structure, model,
    class, class_code, safety_critical, created_at, updated_at
)
VALUES (
    $1,
    (SELECT id FROM assets WHERE asset_id = $1),
    $2,
    (SELECT id FROM categories WHERE category_id = $2),
    $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
)
RETURNING
    id,
    component_id,
    asset_id,
    category_id,
    name,
    serial_number,
    manufacturer,
    description,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    updated_at,
    location,
    assigned_project;

-- name: UpdateComponent :execrows
UPDATE components
SET category_id = $1,
    category_ref_id = (SELECT id FROM categories WHERE category_id = $1),
    name = $2, serial_number = $3, manufacturer = $4, description = $5,
    location = $6, assigned_project = $7, equipment_type = $8, structure = $9, model = $10, class = $11,
    class_code = $12, safety_critical = $13, updated_at = NOW()
WHERE component_id = $14;

-- name: DeleteComponent :execrows
DELETE FROM components WHERE component_id = $1;
