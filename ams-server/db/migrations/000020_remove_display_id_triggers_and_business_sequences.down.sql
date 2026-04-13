DROP FUNCTION IF EXISTS spin_up_asset_from_template(UUID, UUID);

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

CREATE SEQUENCE user_business_id_seq START WITH 1;
CREATE SEQUENCE main_category_business_id_seq START WITH 1;
CREATE SEQUENCE category_business_id_seq START WITH 1;
CREATE SEQUENCE test_type_business_id_seq START WITH 1;
CREATE SEQUENCE template_business_id_seq START WITH 1;
CREATE SEQUENCE template_component_business_id_seq START WITH 1;
CREATE SEQUENCE template_component_test_business_id_seq START WITH 1;
CREATE SEQUENCE asset_business_id_seq START WITH 1;
CREATE SEQUENCE component_business_id_seq START WITH 1;
CREATE SEQUENCE certificate_business_id_seq START WITH 1;
CREATE SEQUENCE scheduled_task_business_id_seq START WITH 1;

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

DROP SEQUENCE IF EXISTS user_display_id_seq;
DROP SEQUENCE IF EXISTS main_category_display_id_seq;
DROP SEQUENCE IF EXISTS category_display_id_seq;
DROP SEQUENCE IF EXISTS test_type_display_id_seq;
DROP SEQUENCE IF EXISTS template_display_id_seq;
DROP SEQUENCE IF EXISTS template_component_display_id_seq;
DROP SEQUENCE IF EXISTS template_component_test_display_id_seq;
DROP SEQUENCE IF EXISTS asset_display_id_seq;
DROP SEQUENCE IF EXISTS component_display_id_seq;
DROP SEQUENCE IF EXISTS certificate_display_id_seq;
DROP SEQUENCE IF EXISTS scheduled_task_display_id_seq;

DROP FUNCTION IF EXISTS sync_display_id_sequence(REGCLASS, TEXT, TEXT);
DROP FUNCTION IF EXISTS next_display_id(REGCLASS);
