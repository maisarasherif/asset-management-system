DROP TRIGGER IF EXISTS trg_certificate_upload_audit_sync_certificate_uuid ON certificate_upload_audit;
DROP TRIGGER IF EXISTS trg_scheduled_tasks_sync_certificate_uuid ON scheduled_tasks;
DROP TRIGGER IF EXISTS trg_certificates_sync_shadow_uuids ON certificates;
DROP TRIGGER IF EXISTS trg_components_sync_shadow_uuids ON components;
DROP TRIGGER IF EXISTS trg_template_component_tests_sync_shadow_uuids ON template_component_tests;
DROP TRIGGER IF EXISTS trg_template_components_sync_shadow_uuids ON template_components;
DROP TRIGGER IF EXISTS trg_categories_sync_main_category_uuid ON categories;
DROP TRIGGER IF EXISTS trg_assets_sync_template_uuid ON assets;

DROP TRIGGER IF EXISTS trg_users_sync_display_id ON users;
DROP TRIGGER IF EXISTS trg_main_categories_sync_display_id ON main_categories;
DROP TRIGGER IF EXISTS trg_categories_sync_display_id ON categories;
DROP TRIGGER IF EXISTS trg_test_types_sync_display_id ON test_types;
DROP TRIGGER IF EXISTS trg_asset_templates_sync_display_id ON asset_templates;
DROP TRIGGER IF EXISTS trg_template_components_sync_display_id ON template_components;
DROP TRIGGER IF EXISTS trg_template_component_tests_sync_display_id ON template_component_tests;
DROP TRIGGER IF EXISTS trg_assets_sync_display_id ON assets;
DROP TRIGGER IF EXISTS trg_components_sync_display_id ON components;
DROP TRIGGER IF EXISTS trg_certificates_sync_display_id ON certificates;
DROP TRIGGER IF EXISTS trg_scheduled_tasks_sync_display_id ON scheduled_tasks;

DROP TRIGGER IF EXISTS trg_users_assign_business_id ON users;
DROP TRIGGER IF EXISTS trg_main_categories_assign_business_id ON main_categories;
DROP TRIGGER IF EXISTS trg_categories_assign_business_id ON categories;
DROP TRIGGER IF EXISTS trg_test_types_assign_business_id ON test_types;
DROP TRIGGER IF EXISTS trg_asset_templates_assign_business_id ON asset_templates;
DROP TRIGGER IF EXISTS trg_template_components_assign_business_id ON template_components;
DROP TRIGGER IF EXISTS trg_template_component_tests_assign_business_id ON template_component_tests;
DROP TRIGGER IF EXISTS trg_assets_assign_business_id ON assets;
DROP TRIGGER IF EXISTS trg_components_assign_business_id ON components;
DROP TRIGGER IF EXISTS trg_certificates_assign_business_id ON certificates;
DROP TRIGGER IF EXISTS trg_scheduled_tasks_assign_business_id ON scheduled_tasks;

DROP TRIGGER IF EXISTS trg_users_business_id_immutable ON users;
DROP TRIGGER IF EXISTS trg_main_categories_business_id_immutable ON main_categories;
DROP TRIGGER IF EXISTS trg_categories_business_id_immutable ON categories;
DROP TRIGGER IF EXISTS trg_test_types_business_id_immutable ON test_types;
DROP TRIGGER IF EXISTS trg_asset_templates_business_id_immutable ON asset_templates;
DROP TRIGGER IF EXISTS trg_template_components_business_id_immutable ON template_components;
DROP TRIGGER IF EXISTS trg_template_component_tests_business_id_immutable ON template_component_tests;
DROP TRIGGER IF EXISTS trg_assets_business_id_immutable ON assets;
DROP TRIGGER IF EXISTS trg_components_business_id_immutable ON components;
DROP TRIGGER IF EXISTS trg_certificates_business_id_immutable ON certificates;
DROP TRIGGER IF EXISTS trg_scheduled_tasks_business_id_immutable ON scheduled_tasks;

DROP FUNCTION IF EXISTS sync_certificate_upload_audit_certificate_uuid();
DROP FUNCTION IF EXISTS sync_scheduled_task_certificate_uuid();
DROP FUNCTION IF EXISTS sync_certificate_shadow_uuids();
DROP FUNCTION IF EXISTS sync_component_shadow_uuids();
DROP FUNCTION IF EXISTS sync_template_component_test_shadow_uuids();
DROP FUNCTION IF EXISTS sync_template_component_shadow_uuids();
DROP FUNCTION IF EXISTS sync_category_main_category_uuid();
DROP FUNCTION IF EXISTS sync_asset_template_uuid();
DROP FUNCTION IF EXISTS sync_display_id_from_business_id();

ALTER TABLE users DROP COLUMN user_id;
ALTER TABLE users RENAME COLUMN uuid TO user_id;

ALTER TABLE main_categories DROP COLUMN main_category_id;
ALTER TABLE main_categories RENAME COLUMN uuid TO main_category_id;

ALTER TABLE test_types DROP COLUMN test_id;
ALTER TABLE test_types RENAME COLUMN uuid TO test_id;

ALTER TABLE asset_templates DROP COLUMN template_id;
ALTER TABLE asset_templates RENAME COLUMN uuid TO template_id;

ALTER TABLE assets DROP COLUMN asset_id;
ALTER TABLE assets DROP COLUMN template_id;
ALTER TABLE assets RENAME COLUMN uuid TO asset_id;
ALTER TABLE assets RENAME COLUMN template_uuid TO template_id;

ALTER TABLE categories DROP COLUMN category_id;
ALTER TABLE categories DROP COLUMN main_category_id;
ALTER TABLE categories RENAME COLUMN uuid TO category_id;
ALTER TABLE categories RENAME COLUMN main_category_uuid TO main_category_id;

ALTER TABLE template_components DROP COLUMN template_component_id;
ALTER TABLE template_components DROP COLUMN template_id;
ALTER TABLE template_components DROP COLUMN category_id;
ALTER TABLE template_components RENAME COLUMN uuid TO template_component_id;
ALTER TABLE template_components RENAME COLUMN template_uuid TO template_id;
ALTER TABLE template_components RENAME COLUMN category_uuid TO category_id;

ALTER TABLE template_component_tests DROP COLUMN template_component_test_id;
ALTER TABLE template_component_tests DROP COLUMN template_component_id;
ALTER TABLE template_component_tests DROP COLUMN test_id;
ALTER TABLE template_component_tests RENAME COLUMN uuid TO template_component_test_id;
ALTER TABLE template_component_tests RENAME COLUMN template_component_uuid TO template_component_id;
ALTER TABLE template_component_tests RENAME COLUMN test_uuid TO test_id;

ALTER TABLE components DROP COLUMN component_id;
ALTER TABLE components DROP COLUMN asset_id;
ALTER TABLE components DROP COLUMN category_id;
ALTER TABLE components RENAME COLUMN uuid TO component_id;
ALTER TABLE components RENAME COLUMN asset_uuid TO asset_id;
ALTER TABLE components RENAME COLUMN category_uuid TO category_id;
ALTER TABLE components RENAME COLUMN template_component_uuid TO template_component_id;

ALTER TABLE certificates DROP COLUMN certificate_id;
ALTER TABLE certificates DROP COLUMN component_id;
ALTER TABLE certificates DROP COLUMN test_id;
ALTER TABLE certificates RENAME COLUMN uuid TO certificate_id;
ALTER TABLE certificates RENAME COLUMN component_uuid TO component_id;
ALTER TABLE certificates RENAME COLUMN test_uuid TO test_id;
ALTER TABLE certificates RENAME COLUMN template_component_test_uuid TO template_component_test_id;

ALTER TABLE scheduled_tasks DROP COLUMN task_id;
ALTER TABLE scheduled_tasks DROP COLUMN certificate_id;
ALTER TABLE scheduled_tasks RENAME COLUMN uuid TO task_id;
ALTER TABLE scheduled_tasks RENAME COLUMN certificate_uuid TO certificate_id;

ALTER TABLE certificate_upload_audit DROP COLUMN certificate_id;
ALTER TABLE certificate_upload_audit RENAME COLUMN certificate_uuid TO certificate_id;

SELECT sync_root_business_id_sequence('user_business_id_seq', 'users', 'display_id');
SELECT sync_root_business_id_sequence('main_category_business_id_seq', 'main_categories', 'display_id');
SELECT sync_root_business_id_sequence('category_business_id_seq', 'categories', 'display_id');
SELECT sync_root_business_id_sequence('test_type_business_id_seq', 'test_types', 'display_id');
SELECT sync_root_business_id_sequence('template_business_id_seq', 'asset_templates', 'display_id');
SELECT sync_root_business_id_sequence('template_component_business_id_seq', 'template_components', 'display_id');
SELECT sync_root_business_id_sequence('template_component_test_business_id_seq', 'template_component_tests', 'display_id');
SELECT sync_root_business_id_sequence('asset_business_id_seq', 'assets', 'display_id');
SELECT sync_root_business_id_sequence('component_business_id_seq', 'components', 'display_id');
SELECT sync_root_business_id_sequence('certificate_business_id_seq', 'certificates', 'display_id');
SELECT sync_root_business_id_sequence('scheduled_task_business_id_seq', 'scheduled_tasks', 'display_id');

CREATE TRIGGER trg_users_assign_display_id
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'user_business_id_seq');

CREATE TRIGGER trg_main_categories_assign_display_id
BEFORE INSERT ON main_categories
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'main_category_business_id_seq');

CREATE TRIGGER trg_categories_assign_display_id
BEFORE INSERT ON categories
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'category_business_id_seq');

CREATE TRIGGER trg_test_types_assign_display_id
BEFORE INSERT ON test_types
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'test_type_business_id_seq');

CREATE TRIGGER trg_asset_templates_assign_display_id
BEFORE INSERT ON asset_templates
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'template_business_id_seq');

CREATE TRIGGER trg_template_components_assign_display_id
BEFORE INSERT ON template_components
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'template_component_business_id_seq');

CREATE TRIGGER trg_template_component_tests_assign_display_id
BEFORE INSERT ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'template_component_test_business_id_seq');

CREATE TRIGGER trg_assets_assign_display_id
BEFORE INSERT ON assets
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'asset_business_id_seq');

CREATE TRIGGER trg_components_assign_display_id
BEFORE INSERT ON components
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'component_business_id_seq');

CREATE TRIGGER trg_certificates_assign_display_id
BEFORE INSERT ON certificates
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'certificate_business_id_seq');

CREATE TRIGGER trg_scheduled_tasks_assign_display_id
BEFORE INSERT ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('display_id', 'scheduled_task_business_id_seq');

CREATE TRIGGER trg_users_display_id_immutable
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_main_categories_display_id_immutable
BEFORE UPDATE ON main_categories
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_categories_display_id_immutable
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_test_types_display_id_immutable
BEFORE UPDATE ON test_types
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_asset_templates_display_id_immutable
BEFORE UPDATE ON asset_templates
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_template_components_display_id_immutable
BEFORE UPDATE ON template_components
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_template_component_tests_display_id_immutable
BEFORE UPDATE ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_assets_display_id_immutable
BEFORE UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_components_display_id_immutable
BEFORE UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_certificates_display_id_immutable
BEFORE UPDATE ON certificates
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

CREATE TRIGGER trg_scheduled_tasks_display_id_immutable
BEFORE UPDATE ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('display_id');

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
    SELECT a.id, a.asset_id, a.template_id
    INTO v_asset_row
    FROM assets a
    WHERE a.asset_id::text = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % not found', p_asset_id;
    END IF;

    SELECT at.id, at.template_id
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
    ORDER BY tc.position, tc.id;

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
    ORDER BY tc.position, tct.position, tct.id;

    RETURN v_inserted_components;
END;
$$;
