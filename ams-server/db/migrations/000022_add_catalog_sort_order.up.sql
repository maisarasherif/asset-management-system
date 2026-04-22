ALTER TABLE main_categories ADD COLUMN sort_order INTEGER;
ALTER TABLE categories ADD COLUMN sort_order INTEGER;

WITH ordered_main_categories AS (
    SELECT
        main_category_id,
        ROW_NUMBER() OVER (ORDER BY created_at ASC, display_id ASC) AS next_sort_order
    FROM main_categories
)
UPDATE main_categories mc
SET sort_order = omc.next_sort_order
FROM ordered_main_categories omc
WHERE mc.main_category_id = omc.main_category_id;

WITH ordered_categories AS (
    SELECT
        category_id,
        ROW_NUMBER() OVER (
            PARTITION BY main_category_id
            ORDER BY created_at ASC, display_id ASC
        ) AS next_sort_order
    FROM categories
)
UPDATE categories c
SET sort_order = oc.next_sort_order
FROM ordered_categories oc
WHERE c.category_id = oc.category_id;

ALTER TABLE main_categories ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE categories ALTER COLUMN sort_order SET NOT NULL;

ALTER TABLE main_categories
    ADD CONSTRAINT main_categories_sort_order_unique UNIQUE (sort_order);

CREATE UNIQUE INDEX categories_main_category_sort_order_unique
    ON categories (main_category_id, sort_order)
    WHERE main_category_id IS NOT NULL;

CREATE UNIQUE INDEX categories_null_main_category_sort_order_unique
    ON categories (sort_order)
    WHERE main_category_id IS NULL;

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
    JOIN categories c
      ON c.category_id = tc.category_id
    LEFT JOIN main_categories mc
      ON mc.main_category_id = c.main_category_id
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY
        CASE WHEN mc.sort_order IS NULL THEN 1 ELSE 0 END,
        mc.sort_order ASC NULLS LAST,
        c.sort_order ASC,
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
    JOIN categories cat
      ON cat.category_id = tc.category_id
    LEFT JOIN main_categories mc
      ON mc.main_category_id = cat.main_category_id
    JOIN test_types tt
      ON tt.test_id = tct.test_id
    JOIN components c
      ON c.template_component_id = tc.template_component_id
     AND c.asset_id = v_asset_row.asset_id
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY
        CASE WHEN mc.sort_order IS NULL THEN 1 ELSE 0 END,
        mc.sort_order ASC NULLS LAST,
        cat.sort_order ASC,
        tc.position ASC,
        tct.position ASC,
        tct.template_component_test_id ASC;

    RETURN v_inserted_components;
END;
$$;
