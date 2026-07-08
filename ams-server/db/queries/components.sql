-- name: GetAllComponentsPaginated :many
SELECT
    component_id,
    display_id,
    asset_id,
    category_id,
    scope_category_id,
    component_kind,
    single_asset_equipment_id,
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
    component_id,
    display_id,
    asset_id,
    category_id,
    scope_category_id,
    component_kind,
    single_asset_equipment_id,
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
WHERE asset_id = sqlc.arg(asset_id)
ORDER BY created_at DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountComponentsByAssetID :one
SELECT COUNT(*)
FROM components
WHERE asset_id = $1;

-- name: GetComponentByID :one
SELECT
    component_id,
    display_id,
    asset_id,
    category_id,
    scope_category_id,
    component_kind,
    single_asset_equipment_id,
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
SELECT COUNT(*)
FROM components
WHERE category_id = $1;

-- name: CountComponentsByScopeCategoryID :one
SELECT COUNT(*)
FROM components
WHERE scope_category_id = $1;

-- name: CreateComponent :one
INSERT INTO components (
    display_id,
    asset_id, category_id, scope_category_id, name, serial_number, manufacturer,
    description, location, assigned_project, equipment_type, structure, model,
    class, class_code, safety_critical, created_at, updated_at
)
VALUES (
    allocate_display_id('components.display_id', 'components'::REGCLASS),
    sqlc.arg(asset_id),
    sqlc.arg(category_id),
    sqlc.arg(scope_category_id),
    sqlc.arg(name),
    sqlc.arg(serial_number),
    sqlc.arg(manufacturer),
    sqlc.arg(description),
    sqlc.arg(location),
    sqlc.arg(assigned_project),
    sqlc.arg(equipment_type),
    sqlc.arg(structure),
    sqlc.arg(model),
    sqlc.arg(class),
    sqlc.arg(class_code),
    sqlc.arg(safety_critical),
    NOW(),
    NOW()
)
RETURNING
    component_id,
    display_id,
    asset_id,
    category_id,
    scope_category_id,
    component_kind,
    single_asset_equipment_id,
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

-- name: CreateSelfComponent :one
INSERT INTO components (
    display_id,
    asset_id,
    category_id,
    scope_category_id,
    component_kind,
    single_asset_equipment_id,
    name,
    serial_number,
    manufacturer,
    description,
    location,
    assigned_project,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    updated_at
)
VALUES (
    allocate_display_id('components.display_id', 'components'::REGCLASS),
    sqlc.arg(asset_id),
    NULL,
    NULL,
    'SELF',
    sqlc.arg(single_asset_equipment_id),
    sqlc.arg(name),
    '',
    '',
    sqlc.arg(description),
    sqlc.arg(location),
    sqlc.arg(assigned_project),
    '',
    '',
    '',
    '',
    '',
    'NO',
    NOW(),
    NOW()
)
RETURNING
    component_id,
    display_id,
    asset_id,
    category_id,
    scope_category_id,
    component_kind,
    single_asset_equipment_id,
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
SET category_id = sqlc.arg(category_id),
    scope_category_id = sqlc.arg(scope_category_id),
    name = sqlc.arg(name),
    serial_number = sqlc.arg(serial_number),
    manufacturer = sqlc.arg(manufacturer),
    description = sqlc.arg(description),
    location = sqlc.arg(location),
    assigned_project = sqlc.arg(assigned_project),
    equipment_type = sqlc.arg(equipment_type),
    structure = sqlc.arg(structure),
    model = sqlc.arg(model),
    class = sqlc.arg(class),
    class_code = sqlc.arg(class_code),
    safety_critical = sqlc.arg(safety_critical),
    updated_at = NOW()
WHERE component_id = sqlc.arg(component_id);

-- name: DeleteComponent :execrows
DELETE FROM components WHERE component_id = $1;
