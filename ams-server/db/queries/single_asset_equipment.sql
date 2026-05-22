-- name: CreateSingleAssetEquipment :one
INSERT INTO single_asset_equipment (
    display_id,
    asset_id,
    equipment_type_id,
    created_at,
    updated_at
)
VALUES (
    next_display_id('single_asset_equipment_display_id_seq'),
    sqlc.arg(asset_id),
    sqlc.arg(equipment_type_id),
    NOW(),
    NOW()
)
RETURNING
    single_asset_equipment_id,
    display_id,
    asset_id,
    equipment_type_id,
    created_at,
    updated_at;

-- name: GetSingleAssetEquipmentByAssetID :one
SELECT
    sae.single_asset_equipment_id,
    sae.display_id,
    sae.asset_id,
    sae.equipment_type_id,
    et.display_id AS equipment_type_display_id,
    et.equipment_type_name,
    et.description AS equipment_type_description,
    c.component_id AS self_component_id,
    c.display_id AS self_component_display_id,
    sae.created_at,
    sae.updated_at
FROM single_asset_equipment sae
JOIN equipment_types et ON et.equipment_type_id = sae.equipment_type_id
JOIN components c
  ON c.single_asset_equipment_id = sae.single_asset_equipment_id
 AND c.component_kind = 'SELF'
WHERE sae.asset_id = $1
LIMIT 1;
