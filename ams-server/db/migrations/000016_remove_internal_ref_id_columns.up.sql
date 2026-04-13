DROP INDEX IF EXISTS idx_certificate_upload_audit_certificate_ref_id;
DROP INDEX IF EXISTS idx_scheduled_tasks_certificate_ref_id;
DROP INDEX IF EXISTS idx_certificates_template_component_test_ref_id;
DROP INDEX IF EXISTS idx_certificates_test_type_ref_id;
DROP INDEX IF EXISTS idx_certificates_component_ref_id;
DROP INDEX IF EXISTS idx_components_template_component_ref_id;
DROP INDEX IF EXISTS idx_components_category_ref_id;
DROP INDEX IF EXISTS idx_components_asset_ref_id;
DROP INDEX IF EXISTS idx_template_component_tests_test_type_ref_id;
DROP INDEX IF EXISTS idx_template_component_tests_template_component_ref_id;
DROP INDEX IF EXISTS idx_template_components_category_ref_id;
DROP INDEX IF EXISTS idx_template_components_template_ref_id;
DROP INDEX IF EXISTS idx_assets_template_ref_id;
DROP INDEX IF EXISTS idx_categories_main_category_ref_id;

DROP INDEX IF EXISTS idx_components_asset_template_component_unique;
DROP INDEX IF EXISTS idx_certificates_component_template_test_unique;

ALTER TABLE certificate_upload_audit DROP CONSTRAINT IF EXISTS certificate_upload_audit_certificate_ref_id_fkey;
ALTER TABLE scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_certificate_ref_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_component_ref_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_test_type_ref_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_template_component_test_ref_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_asset_ref_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_category_ref_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_template_component_ref_id_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_template_component_ref_id_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_test_type_ref_id_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_template_ref_id_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_category_ref_id_fkey;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_template_ref_id_fkey;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_main_category_ref_id_fkey;

CREATE OR REPLACE FUNCTION sync_component_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.asset_uuid IS NULL THEN
        SELECT uuid INTO NEW.asset_uuid
        FROM assets
        WHERE asset_id = NEW.asset_id;
    END IF;

    IF NEW.category_uuid IS NULL THEN
        SELECT uuid INTO NEW.category_uuid
        FROM categories
        WHERE category_id = NEW.category_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_certificate_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.component_uuid IS NULL THEN
        SELECT uuid INTO NEW.component_uuid
        FROM components
        WHERE component_id = NEW.component_id;
    END IF;

    IF NEW.test_uuid IS NULL THEN
        SELECT uuid INTO NEW.test_uuid
        FROM test_types
        WHERE test_id = NEW.test_id;
    END IF;

    RETURN NEW;
END;
$$;

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
    SELECT a.id, a.asset_id, a.uuid, a.template_id, a.template_uuid
    INTO v_asset_row
    FROM assets a
    WHERE a.asset_id = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % not found', p_asset_id;
    END IF;

    SELECT at.id, at.template_id, at.uuid
    INTO v_template_row
    FROM asset_templates at
    WHERE at.template_id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template % not found', p_template_id;
    END IF;

    IF v_asset_row.template_uuid IS DISTINCT FROM v_template_row.uuid THEN
        RAISE EXCEPTION 'asset % with template % not found', p_asset_id, p_template_id;
    END IF;

    INSERT INTO components (
        asset_id,
        asset_uuid,
        category_id,
        category_uuid,
        template_component_uuid,
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
        v_asset_row.uuid,
        tc.category_id,
        tc.category_uuid,
        tc.uuid,
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
    WHERE tc.template_uuid = v_template_row.uuid
    ORDER BY tc.position, tc.id;

    GET DIAGNOSTICS v_inserted_components = ROW_COUNT;

    INSERT INTO certificates (
        component_id,
        component_uuid,
        certificate_name,
        certificate_file,
        issuing_authority,
        status,
        test_id,
        test_uuid,
        imca_ref,
        imca_d018,
        maintenance_notes,
        template_component_test_uuid,
        created_at,
        updated_at
    )
    SELECT
        c.component_id,
        c.uuid,
        tt.test_name,
        '',
        '',
        'PENDING',
        tct.test_id,
        tct.test_uuid,
        '',
        '',
        '',
        tct.uuid,
        NOW(),
        NOW()
    FROM template_component_tests tct
    JOIN template_components tc
      ON tc.uuid = tct.template_component_uuid
    JOIN test_types tt
      ON tt.uuid = tct.test_uuid
    JOIN components c
      ON c.template_component_uuid = tc.uuid
     AND c.asset_uuid = v_asset_row.uuid
    WHERE tc.template_uuid = v_template_row.uuid
    ORDER BY tc.position, tct.position, tct.id;

    RETURN v_inserted_components;
END;
$$;

ALTER TABLE certificate_upload_audit DROP COLUMN IF EXISTS certificate_ref_id;
ALTER TABLE scheduled_tasks DROP COLUMN IF EXISTS certificate_ref_id;
ALTER TABLE certificates
    DROP COLUMN IF EXISTS component_ref_id,
    DROP COLUMN IF EXISTS test_type_ref_id,
    DROP COLUMN IF EXISTS template_component_test_ref_id;
ALTER TABLE components
    DROP COLUMN IF EXISTS asset_ref_id,
    DROP COLUMN IF EXISTS category_ref_id,
    DROP COLUMN IF EXISTS template_component_ref_id;
ALTER TABLE template_component_tests
    DROP COLUMN IF EXISTS template_component_ref_id,
    DROP COLUMN IF EXISTS test_type_ref_id;
ALTER TABLE template_components
    DROP COLUMN IF EXISTS template_ref_id,
    DROP COLUMN IF EXISTS category_ref_id;
ALTER TABLE assets DROP COLUMN IF EXISTS template_ref_id;
ALTER TABLE categories DROP COLUMN IF EXISTS main_category_ref_id;

CREATE UNIQUE INDEX idx_components_asset_template_component_unique
ON components(asset_uuid, template_component_uuid)
WHERE template_component_uuid IS NOT NULL;

CREATE UNIQUE INDEX idx_certificates_component_template_test_unique
ON certificates(component_uuid, template_component_test_uuid)
WHERE template_component_test_uuid IS NOT NULL;
