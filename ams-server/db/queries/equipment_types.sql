-- name: GetAllEquipmentTypesPaginated :many
SELECT
    equipment_type_id,
    display_id,
    sort_order,
    equipment_type_name,
    description,
    created_at,
    updated_at
FROM equipment_types
ORDER BY sort_order ASC, created_at ASC
LIMIT $1 OFFSET $2;

-- name: CountEquipmentTypes :one
SELECT COUNT(*) FROM equipment_types;

-- name: GetEquipmentTypeByID :one
SELECT
    equipment_type_id,
    display_id,
    sort_order,
    equipment_type_name,
    description,
    created_at,
    updated_at
FROM equipment_types
WHERE equipment_type_id = $1
LIMIT 1;

-- name: CreateEquipmentType :one
INSERT INTO equipment_types (
    display_id,
    sort_order,
    equipment_type_name,
    description,
    created_at,
    updated_at
)
VALUES (
    next_display_id('equipment_type_display_id_seq'),
    sqlc.arg(sort_order),
    sqlc.arg(equipment_type_name),
    sqlc.arg(description),
    NOW(),
    NOW()
)
RETURNING
    equipment_type_id,
    display_id,
    sort_order,
    equipment_type_name,
    description,
    created_at,
    updated_at;

-- name: UpdateEquipmentType :execrows
UPDATE equipment_types
SET sort_order = sqlc.arg(sort_order),
    equipment_type_name = sqlc.arg(equipment_type_name),
    description = sqlc.arg(description),
    updated_at = NOW()
WHERE equipment_type_id = sqlc.arg(equipment_type_id);

-- name: DeleteEquipmentType :execrows
DELETE FROM equipment_types WHERE equipment_type_id = $1;

-- name: CountSingleAssetEquipmentByEquipmentTypeID :one
SELECT COUNT(*)
FROM single_asset_equipment
WHERE equipment_type_id = $1;
