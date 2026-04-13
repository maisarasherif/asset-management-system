ALTER TABLE certificate_upload_audit DROP CONSTRAINT IF EXISTS certificate_upload_audit_pkey;
ALTER TABLE scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_pkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_pkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_pkey;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_pkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_pkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_pkey;
ALTER TABLE asset_templates DROP CONSTRAINT IF EXISTS asset_templates_pkey;
ALTER TABLE test_types DROP CONSTRAINT IF EXISTS test_types_pkey;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE main_categories DROP CONSTRAINT IF EXISTS main_categories_pkey;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;

ALTER TABLE users DROP COLUMN IF EXISTS id;
ALTER TABLE main_categories DROP COLUMN IF EXISTS id;
ALTER TABLE categories DROP COLUMN IF EXISTS id;
ALTER TABLE test_types DROP COLUMN IF EXISTS id;
ALTER TABLE asset_templates DROP COLUMN IF EXISTS id;
ALTER TABLE template_components DROP COLUMN IF EXISTS id;
ALTER TABLE template_component_tests DROP COLUMN IF EXISTS id;
ALTER TABLE assets DROP COLUMN IF EXISTS id;
ALTER TABLE components DROP COLUMN IF EXISTS id;
ALTER TABLE certificates DROP COLUMN IF EXISTS id;
ALTER TABLE scheduled_tasks DROP COLUMN IF EXISTS id;
ALTER TABLE certificate_upload_audit DROP COLUMN IF EXISTS id;

ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);
ALTER TABLE main_categories ADD CONSTRAINT main_categories_pkey PRIMARY KEY (main_category_id);
ALTER TABLE categories ADD CONSTRAINT categories_pkey PRIMARY KEY (category_id);
ALTER TABLE test_types ADD CONSTRAINT test_types_pkey PRIMARY KEY (test_id);
ALTER TABLE asset_templates ADD CONSTRAINT asset_templates_pkey PRIMARY KEY (template_id);
ALTER TABLE template_components ADD CONSTRAINT template_components_pkey PRIMARY KEY (template_component_id);
ALTER TABLE template_component_tests ADD CONSTRAINT template_component_tests_pkey PRIMARY KEY (template_component_test_id);
ALTER TABLE assets ADD CONSTRAINT assets_pkey PRIMARY KEY (asset_id);
ALTER TABLE components ADD CONSTRAINT components_pkey PRIMARY KEY (component_id);
ALTER TABLE certificates ADD CONSTRAINT certificates_pkey PRIMARY KEY (certificate_id);
ALTER TABLE scheduled_tasks ADD CONSTRAINT scheduled_tasks_pkey PRIMARY KEY (task_id);
ALTER TABLE certificate_upload_audit ADD CONSTRAINT certificate_upload_audit_pkey PRIMARY KEY (uuid);

CREATE OR REPLACE FUNCTION spin_up_asset_from_template_by_business_id(
    p_asset_id TEXT,
    p_template_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_row RECORD;
    v_template_row RECORD;
    v_inserted_components INTEGER := 0;
BEGIN
    SELECT a.asset_id, a.template_id
    INTO v_asset_row
    FROM assets a
    WHERE a.asset_id::text = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % not found', p_asset_id;
    END IF;

    SELECT at.template_id
    INTO v_template_row
    FROM asset_templates at
    WHERE at.template_id::text = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template % not found', p_template_id;
    END IF;

    IF v_asset_row.template_id IS DISTINCT FROM v_template_row.template_id THEN
        RAISE EXCEPTION 'asset % with template % not found', p_asset_id, p_template_id;
    END IF;

    INSERT INTO components (
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
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY tc.position, tc.template_component_id;

    GET DIAGNOSTICS v_inserted_components = ROW_COUNT;

    INSERT INTO certificates (
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
    JOIN test_types tt
      ON tt.test_id = tct.test_id
    JOIN components c
      ON c.template_component_id = tc.template_component_id
     AND c.asset_id = v_asset_row.asset_id
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY tc.position, tct.position, tct.template_component_test_id;

    RETURN v_inserted_components;
END;
$$;
