CREATE SEQUENCE equipment_type_display_id_seq START WITH 1;
CREATE SEQUENCE single_asset_equipment_display_id_seq START WITH 1;

CREATE TABLE equipment_types (
    equipment_type_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id          TEXT NOT NULL UNIQUE,
    sort_order          INTEGER NOT NULL,
    equipment_type_name TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_equipment_types_sort_order
    ON equipment_types (sort_order);

ALTER TABLE assets
    ADD COLUMN asset_kind TEXT NOT NULL DEFAULT 'COMPONENTIZED';

ALTER TABLE assets
    ADD CONSTRAINT assets_asset_kind_check
    CHECK (asset_kind IN ('COMPONENTIZED', 'SINGLE_EQUIPMENT'));

CREATE TABLE single_asset_equipment (
    single_asset_equipment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id                TEXT NOT NULL UNIQUE,
    asset_id                  UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    equipment_type_id         UUID NOT NULL REFERENCES equipment_types(equipment_type_id) ON DELETE RESTRICT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_asset_equipment_asset_unique UNIQUE (asset_id)
);

CREATE INDEX idx_single_asset_equipment_equipment_type_id
    ON single_asset_equipment (equipment_type_id);

ALTER TABLE components
    ADD COLUMN component_kind TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN single_asset_equipment_id UUID NULL REFERENCES single_asset_equipment(single_asset_equipment_id) ON DELETE CASCADE,
    ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE components
    ADD CONSTRAINT components_component_kind_check
    CHECK (component_kind IN ('NORMAL', 'SELF'));

ALTER TABLE components
    ADD CONSTRAINT components_kind_assignment_check
    CHECK (
        (
            component_kind = 'NORMAL'
            AND category_id IS NOT NULL
            AND single_asset_equipment_id IS NULL
        )
        OR
        (
            component_kind = 'SELF'
            AND category_id IS NULL
            AND single_asset_equipment_id IS NOT NULL
        )
    );

CREATE UNIQUE INDEX idx_components_one_self_per_asset
    ON components (asset_id)
    WHERE component_kind = 'SELF';

CREATE UNIQUE INDEX idx_components_one_self_per_single_asset_equipment
    ON components (single_asset_equipment_id)
    WHERE component_kind = 'SELF';

CREATE INDEX idx_components_single_asset_equipment_id
    ON components (single_asset_equipment_id);
