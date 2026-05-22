DROP INDEX IF EXISTS idx_components_single_asset_equipment_id;
DROP INDEX IF EXISTS idx_components_one_self_per_single_asset_equipment;
DROP INDEX IF EXISTS idx_components_one_self_per_asset;

ALTER TABLE components
    DROP CONSTRAINT IF EXISTS components_kind_assignment_check,
    DROP CONSTRAINT IF EXISTS components_component_kind_check;

DELETE FROM components WHERE component_kind = 'SELF';

ALTER TABLE components
    DROP COLUMN IF EXISTS single_asset_equipment_id,
    DROP COLUMN IF EXISTS component_kind,
    ALTER COLUMN category_id SET NOT NULL;

DROP INDEX IF EXISTS idx_single_asset_equipment_equipment_type_id;
DROP TABLE IF EXISTS single_asset_equipment;

ALTER TABLE assets
    DROP CONSTRAINT IF EXISTS assets_asset_kind_check,
    DROP COLUMN IF EXISTS asset_kind;

DROP INDEX IF EXISTS idx_equipment_types_sort_order;
DROP TABLE IF EXISTS equipment_types;

DROP SEQUENCE IF EXISTS single_asset_equipment_display_id_seq;
DROP SEQUENCE IF EXISTS equipment_type_display_id_seq;
