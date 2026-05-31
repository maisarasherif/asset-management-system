CREATE SEQUENCE IF NOT EXISTS catalog_scope_display_id_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS catalog_scope_main_category_display_id_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS catalog_scope_category_display_id_seq START WITH 1;

CREATE TABLE catalog_scopes (
    scope_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id  TEXT NOT NULL UNIQUE,
    scope_name  TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX catalog_scopes_scope_name_unique
    ON catalog_scopes (LOWER(TRIM(scope_name)));

CREATE TABLE catalog_scope_main_categories (
    scope_main_category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id             TEXT NOT NULL UNIQUE,
    scope_id               UUID NOT NULL REFERENCES catalog_scopes(scope_id) ON DELETE CASCADE,
    main_category_id       UUID NOT NULL REFERENCES main_categories(main_category_id) ON DELETE RESTRICT,
    sort_order             INTEGER NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_scope_main_categories_scope_main_unique UNIQUE (scope_id, main_category_id),
    CONSTRAINT catalog_scope_main_categories_scope_order_unique UNIQUE (scope_id, sort_order)
);

CREATE TABLE catalog_scope_categories (
    scope_category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id        TEXT NOT NULL UNIQUE,
    scope_id          UUID NOT NULL REFERENCES catalog_scopes(scope_id) ON DELETE CASCADE,
    main_category_id  UUID NOT NULL REFERENCES main_categories(main_category_id) ON DELETE RESTRICT,
    category_id       UUID NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    sort_order        INTEGER NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_scope_categories_scope_category_unique UNIQUE (scope_id, main_category_id, category_id),
    CONSTRAINT catalog_scope_categories_scope_order_unique UNIQUE (scope_id, main_category_id, sort_order)
);

CREATE INDEX idx_catalog_scope_main_categories_scope_id
    ON catalog_scope_main_categories (scope_id);

CREATE INDEX idx_catalog_scope_categories_scope_id
    ON catalog_scope_categories (scope_id);

CREATE INDEX idx_catalog_scope_categories_category_id
    ON catalog_scope_categories (category_id);

WITH default_scope AS (
    INSERT INTO catalog_scopes (display_id, scope_name, description)
    VALUES (
        next_display_id('catalog_scope_display_id_seq'),
        'ADNOC-Approved Full Diving Spread',
        'Default catalog scope migrated from the existing global catalog.'
    )
    RETURNING scope_id
)
INSERT INTO catalog_scope_main_categories (
    display_id,
    scope_id,
    main_category_id,
    sort_order
)
SELECT
    next_display_id('catalog_scope_main_category_display_id_seq'),
    ds.scope_id,
    mc.main_category_id,
    mc.sort_order
FROM default_scope ds
CROSS JOIN main_categories mc
ORDER BY mc.sort_order, mc.created_at;

INSERT INTO catalog_scope_categories (
    display_id,
    scope_id,
    main_category_id,
    category_id,
    sort_order,
    description
)
SELECT
    next_display_id('catalog_scope_category_display_id_seq'),
    cs.scope_id,
    c.main_category_id,
    c.category_id,
    c.sort_order,
    c.description
FROM catalog_scopes cs
CROSS JOIN categories c
WHERE cs.scope_name = 'ADNOC-Approved Full Diving Spread'
  AND c.main_category_id IS NOT NULL
ORDER BY c.main_category_id, c.sort_order, c.created_at;

ALTER TABLE components
    ADD COLUMN scope_category_id UUID NULL;

UPDATE components comp
SET scope_category_id = csc.scope_category_id
FROM catalog_scope_categories csc
WHERE comp.category_id = csc.category_id
  AND comp.component_kind = 'NORMAL';

ALTER TABLE components
    ADD CONSTRAINT components_scope_category_id_fkey
    FOREIGN KEY (scope_category_id) REFERENCES catalog_scope_categories(scope_category_id) ON DELETE RESTRICT;

ALTER TABLE components
    DROP CONSTRAINT IF EXISTS components_kind_assignment_check;

ALTER TABLE components
    ADD CONSTRAINT components_kind_assignment_check
    CHECK (
        (
            component_kind = 'NORMAL'
            AND category_id IS NOT NULL
            AND scope_category_id IS NOT NULL
            AND single_asset_equipment_id IS NULL
        )
        OR
        (
            component_kind = 'SELF'
            AND category_id IS NULL
            AND scope_category_id IS NULL
            AND single_asset_equipment_id IS NOT NULL
        )
    );

ALTER TABLE template_components
    ADD COLUMN scope_category_id UUID NULL;

UPDATE template_components tc
SET scope_category_id = csc.scope_category_id
FROM catalog_scope_categories csc
WHERE tc.category_id = csc.category_id;

ALTER TABLE template_components
    ALTER COLUMN scope_category_id SET NOT NULL,
    ADD CONSTRAINT template_components_scope_category_id_fkey
    FOREIGN KEY (scope_category_id) REFERENCES catalog_scope_categories(scope_category_id) ON DELETE RESTRICT;

CREATE INDEX idx_components_scope_category_id
    ON components (scope_category_id);

CREATE INDEX idx_template_components_scope_category_id
    ON template_components (scope_category_id);

CREATE OR REPLACE FUNCTION spin_up_asset_from_template(
    p_asset_id UUID,
    p_template_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_row RECORD;
    v_template_row RECORD;
    v_existing_components INTEGER := 0;
    v_inserted_components INTEGER := 0;
BEGIN
    SELECT a.asset_id, a.template_id
    INTO v_asset_row
    FROM assets a
    WHERE a.asset_id = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % not found', p_asset_id;
    END IF;

    SELECT at.template_id
    INTO v_template_row
    FROM asset_templates at
    WHERE at.template_id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template % not found', p_template_id;
    END IF;

    IF v_asset_row.template_id IS DISTINCT FROM v_template_row.template_id THEN
        RAISE EXCEPTION 'asset % with template % not found', p_asset_id, p_template_id;
    END IF;

    SELECT COUNT(*)
    INTO v_existing_components
    FROM components c
    WHERE c.asset_id = p_asset_id;

    IF v_existing_components > 0 THEN
        RAISE EXCEPTION 'asset % already has components', p_asset_id;
    END IF;

    INSERT INTO components (
        display_id,
        asset_id,
        category_id,
        scope_category_id,
        template_component_id,
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
    SELECT
        next_display_id('component_display_id_seq'),
        v_asset_row.asset_id,
        tc.category_id,
        tc.scope_category_id,
        tc.template_component_id,
        tc.name,
        tc.serial_number,
        tc.manufacturer,
        tc.description,
        tc.location,
        tc.assigned_project,
        tc.equipment_type,
        tc.structure,
        tc.model,
        tc.class,
        tc.class_code,
        tc.safety_critical,
        NOW(),
        NOW()
    FROM template_components tc
    JOIN catalog_scope_categories csc
      ON csc.scope_category_id = tc.scope_category_id
    JOIN catalog_scope_main_categories csmc
      ON csmc.scope_id = csc.scope_id
     AND csmc.main_category_id = csc.main_category_id
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY
        csmc.sort_order ASC,
        csc.sort_order ASC,
        tc.position ASC,
        tc.template_component_id ASC;

    GET DIAGNOSTICS v_inserted_components = ROW_COUNT;

    INSERT INTO certificates (
        display_id,
        component_id,
        certificate_name,
        certificate_file,
        issuing_authority,
        status,
        test_id,
        imca_ref,
        imca_d018,
        maintenance_notes,
        template_component_test_id,
        created_at,
        updated_at
    )
    SELECT
        next_display_id('certificate_display_id_seq'),
        c.component_id,
        tt.test_name,
        '',
        '',
        'PENDING',
        tct.test_id,
        '',
        '',
        '',
        tct.template_component_test_id,
        NOW(),
        NOW()
    FROM template_component_tests tct
    JOIN template_components tc
      ON tc.template_component_id = tct.template_component_id
    JOIN catalog_scope_categories csc
      ON csc.scope_category_id = tc.scope_category_id
    JOIN catalog_scope_main_categories csmc
      ON csmc.scope_id = csc.scope_id
     AND csmc.main_category_id = csc.main_category_id
    JOIN test_types tt
      ON tt.test_id = tct.test_id
    JOIN components c
      ON c.template_component_id = tc.template_component_id
     AND c.asset_id = v_asset_row.asset_id
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY
        csmc.sort_order ASC,
        csc.sort_order ASC,
        tc.position ASC,
        tct.position ASC,
        tct.template_component_test_id ASC;

    RETURN v_inserted_components;
END;
$$;
