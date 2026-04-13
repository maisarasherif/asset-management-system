DROP TRIGGER IF EXISTS trg_scheduled_tasks_display_id_immutable ON scheduled_tasks;
DROP TRIGGER IF EXISTS trg_certificates_display_id_immutable ON certificates;
DROP TRIGGER IF EXISTS trg_components_display_id_immutable ON components;
DROP TRIGGER IF EXISTS trg_assets_display_id_immutable ON assets;
DROP TRIGGER IF EXISTS trg_template_component_tests_display_id_immutable ON template_component_tests;
DROP TRIGGER IF EXISTS trg_template_components_display_id_immutable ON template_components;
DROP TRIGGER IF EXISTS trg_asset_templates_display_id_immutable ON asset_templates;
DROP TRIGGER IF EXISTS trg_test_types_display_id_immutable ON test_types;
DROP TRIGGER IF EXISTS trg_categories_display_id_immutable ON categories;
DROP TRIGGER IF EXISTS trg_main_categories_display_id_immutable ON main_categories;
DROP TRIGGER IF EXISTS trg_users_display_id_immutable ON users;

DROP TRIGGER IF EXISTS trg_scheduled_tasks_assign_display_id ON scheduled_tasks;
DROP TRIGGER IF EXISTS trg_certificates_assign_display_id ON certificates;
DROP TRIGGER IF EXISTS trg_components_assign_display_id ON components;
DROP TRIGGER IF EXISTS trg_assets_assign_display_id ON assets;
DROP TRIGGER IF EXISTS trg_template_component_tests_assign_display_id ON template_component_tests;
DROP TRIGGER IF EXISTS trg_template_components_assign_display_id ON template_components;
DROP TRIGGER IF EXISTS trg_asset_templates_assign_display_id ON asset_templates;
DROP TRIGGER IF EXISTS trg_test_types_assign_display_id ON test_types;
DROP TRIGGER IF EXISTS trg_categories_assign_display_id ON categories;
DROP TRIGGER IF EXISTS trg_main_categories_assign_display_id ON main_categories;
DROP TRIGGER IF EXISTS trg_users_assign_display_id ON users;

ALTER TABLE users RENAME COLUMN user_id TO uuid;
ALTER TABLE users ADD COLUMN user_id TEXT;
UPDATE users SET user_id = display_id;

ALTER TABLE main_categories RENAME COLUMN main_category_id TO uuid;
ALTER TABLE main_categories ADD COLUMN main_category_id TEXT;
UPDATE main_categories SET main_category_id = display_id;

ALTER TABLE test_types RENAME COLUMN test_id TO uuid;
ALTER TABLE test_types ADD COLUMN test_id TEXT;
UPDATE test_types SET test_id = display_id;

ALTER TABLE asset_templates RENAME COLUMN template_id TO uuid;
ALTER TABLE asset_templates ADD COLUMN template_id TEXT;
UPDATE asset_templates SET template_id = display_id;

ALTER TABLE assets RENAME COLUMN asset_id TO uuid;
ALTER TABLE assets RENAME COLUMN template_id TO template_uuid;
ALTER TABLE assets ADD COLUMN asset_id TEXT;
ALTER TABLE assets ADD COLUMN template_id TEXT;
UPDATE assets SET asset_id = display_id;
UPDATE assets a
SET template_id = at.display_id
FROM asset_templates at
WHERE a.template_uuid = at.uuid;

ALTER TABLE categories RENAME COLUMN category_id TO uuid;
ALTER TABLE categories RENAME COLUMN main_category_id TO main_category_uuid;
ALTER TABLE categories ADD COLUMN category_id TEXT;
ALTER TABLE categories ADD COLUMN main_category_id TEXT;
UPDATE categories SET category_id = display_id;
UPDATE categories c
SET main_category_id = mc.display_id
FROM main_categories mc
WHERE c.main_category_uuid = mc.uuid;

ALTER TABLE template_components RENAME COLUMN template_component_id TO uuid;
ALTER TABLE template_components RENAME COLUMN template_id TO template_uuid;
ALTER TABLE template_components RENAME COLUMN category_id TO category_uuid;
ALTER TABLE template_components ADD COLUMN template_component_id TEXT;
ALTER TABLE template_components ADD COLUMN template_id TEXT;
ALTER TABLE template_components ADD COLUMN category_id TEXT;
UPDATE template_components SET template_component_id = display_id;
UPDATE template_components tc
SET template_id = at.display_id
FROM asset_templates at
WHERE tc.template_uuid = at.uuid;
UPDATE template_components tc
SET category_id = c.display_id
FROM categories c
WHERE tc.category_uuid = c.uuid;

ALTER TABLE template_component_tests RENAME COLUMN template_component_test_id TO uuid;
ALTER TABLE template_component_tests RENAME COLUMN template_component_id TO template_component_uuid;
ALTER TABLE template_component_tests RENAME COLUMN test_id TO test_uuid;
ALTER TABLE template_component_tests ADD COLUMN template_component_test_id TEXT;
ALTER TABLE template_component_tests ADD COLUMN template_component_id TEXT;
ALTER TABLE template_component_tests ADD COLUMN test_id TEXT;
UPDATE template_component_tests SET template_component_test_id = display_id;
UPDATE template_component_tests tct
SET template_component_id = tc.display_id
FROM template_components tc
WHERE tct.template_component_uuid = tc.uuid;
UPDATE template_component_tests tct
SET test_id = tt.display_id
FROM test_types tt
WHERE tct.test_uuid = tt.uuid;

ALTER TABLE components RENAME COLUMN component_id TO uuid;
ALTER TABLE components RENAME COLUMN asset_id TO asset_uuid;
ALTER TABLE components RENAME COLUMN category_id TO category_uuid;
ALTER TABLE components RENAME COLUMN template_component_id TO template_component_uuid;
ALTER TABLE components ADD COLUMN component_id TEXT;
ALTER TABLE components ADD COLUMN asset_id TEXT;
ALTER TABLE components ADD COLUMN category_id TEXT;
UPDATE components SET component_id = display_id;
UPDATE components c
SET asset_id = a.display_id
FROM assets a
WHERE c.asset_uuid = a.uuid;
UPDATE components c
SET category_id = cat.display_id
FROM categories cat
WHERE c.category_uuid = cat.uuid;

ALTER TABLE certificates RENAME COLUMN certificate_id TO uuid;
ALTER TABLE certificates RENAME COLUMN component_id TO component_uuid;
ALTER TABLE certificates RENAME COLUMN test_id TO test_uuid;
ALTER TABLE certificates RENAME COLUMN template_component_test_id TO template_component_test_uuid;
ALTER TABLE certificates ADD COLUMN certificate_id TEXT;
ALTER TABLE certificates ADD COLUMN component_id TEXT;
ALTER TABLE certificates ADD COLUMN test_id TEXT;
UPDATE certificates SET certificate_id = display_id;
UPDATE certificates cert
SET component_id = c.display_id
FROM components c
WHERE cert.component_uuid = c.uuid;
UPDATE certificates cert
SET test_id = tt.display_id
FROM test_types tt
WHERE cert.test_uuid = tt.uuid;

ALTER TABLE scheduled_tasks RENAME COLUMN task_id TO uuid;
ALTER TABLE scheduled_tasks RENAME COLUMN certificate_id TO certificate_uuid;
ALTER TABLE scheduled_tasks ADD COLUMN task_id TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN certificate_id TEXT;
UPDATE scheduled_tasks SET task_id = display_id;
UPDATE scheduled_tasks st
SET certificate_id = cert.display_id
FROM certificates cert
WHERE st.certificate_uuid = cert.uuid;

ALTER TABLE certificate_upload_audit RENAME COLUMN certificate_id TO certificate_uuid;
ALTER TABLE certificate_upload_audit ADD COLUMN certificate_id TEXT;
UPDATE certificate_upload_audit cua
SET certificate_id = cert.display_id
FROM certificates cert
WHERE cua.certificate_uuid = cert.uuid;

CREATE OR REPLACE FUNCTION sync_display_id_from_business_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(to_jsonb(NEW) ->> TG_ARGV[1], '') = '' THEN
        NEW := jsonb_populate_record(
            NEW,
            jsonb_build_object(TG_ARGV[1], to_jsonb(NEW) ->> TG_ARGV[0])
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_sync_display_id
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('user_id', 'display_id');

CREATE TRIGGER trg_main_categories_sync_display_id
BEFORE INSERT OR UPDATE ON main_categories
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('main_category_id', 'display_id');

CREATE TRIGGER trg_categories_sync_display_id
BEFORE INSERT OR UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('category_id', 'display_id');

CREATE TRIGGER trg_test_types_sync_display_id
BEFORE INSERT OR UPDATE ON test_types
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('test_id', 'display_id');

CREATE TRIGGER trg_asset_templates_sync_display_id
BEFORE INSERT OR UPDATE ON asset_templates
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('template_id', 'display_id');

CREATE TRIGGER trg_template_components_sync_display_id
BEFORE INSERT OR UPDATE ON template_components
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('template_component_id', 'display_id');

CREATE TRIGGER trg_template_component_tests_sync_display_id
BEFORE INSERT OR UPDATE ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('template_component_test_id', 'display_id');

CREATE TRIGGER trg_assets_sync_display_id
BEFORE INSERT OR UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('asset_id', 'display_id');

CREATE TRIGGER trg_components_sync_display_id
BEFORE INSERT OR UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('component_id', 'display_id');

CREATE TRIGGER trg_certificates_sync_display_id
BEFORE INSERT OR UPDATE ON certificates
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('certificate_id', 'display_id');

CREATE TRIGGER trg_scheduled_tasks_sync_display_id
BEFORE INSERT OR UPDATE ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_display_id_from_business_id('task_id', 'display_id');

CREATE TRIGGER trg_users_assign_business_id
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('user_id', 'user_business_id_seq');

CREATE TRIGGER trg_main_categories_assign_business_id
BEFORE INSERT ON main_categories
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('main_category_id', 'main_category_business_id_seq');

CREATE TRIGGER trg_categories_assign_business_id
BEFORE INSERT ON categories
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('category_id', 'category_business_id_seq');

CREATE TRIGGER trg_test_types_assign_business_id
BEFORE INSERT ON test_types
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('test_id', 'test_type_business_id_seq');

CREATE TRIGGER trg_asset_templates_assign_business_id
BEFORE INSERT ON asset_templates
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('template_id', 'template_business_id_seq');

CREATE TRIGGER trg_template_components_assign_business_id
BEFORE INSERT ON template_components
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('template_component_id', 'template_component_business_id_seq');

CREATE TRIGGER trg_template_component_tests_assign_business_id
BEFORE INSERT ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('template_component_test_id', 'template_component_test_business_id_seq');

CREATE TRIGGER trg_assets_assign_business_id
BEFORE INSERT ON assets
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('asset_id', 'asset_business_id_seq');

CREATE TRIGGER trg_components_assign_business_id
BEFORE INSERT ON components
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('component_id', 'component_business_id_seq');

CREATE TRIGGER trg_certificates_assign_business_id
BEFORE INSERT ON certificates
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('certificate_id', 'certificate_business_id_seq');

CREATE TRIGGER trg_scheduled_tasks_assign_business_id
BEFORE INSERT ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('task_id', 'scheduled_task_business_id_seq');

CREATE TRIGGER trg_users_business_id_immutable
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('user_id');

CREATE TRIGGER trg_main_categories_business_id_immutable
BEFORE UPDATE ON main_categories
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('main_category_id');

CREATE TRIGGER trg_categories_business_id_immutable
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('category_id');

CREATE TRIGGER trg_test_types_business_id_immutable
BEFORE UPDATE ON test_types
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('test_id');

CREATE TRIGGER trg_asset_templates_business_id_immutable
BEFORE UPDATE ON asset_templates
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('template_id');

CREATE TRIGGER trg_template_components_business_id_immutable
BEFORE UPDATE ON template_components
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('template_component_id');

CREATE TRIGGER trg_template_component_tests_business_id_immutable
BEFORE UPDATE ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('template_component_test_id');

CREATE TRIGGER trg_assets_business_id_immutable
BEFORE UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('asset_id');

CREATE TRIGGER trg_components_business_id_immutable
BEFORE UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('component_id');

CREATE TRIGGER trg_certificates_business_id_immutable
BEFORE UPDATE ON certificates
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('certificate_id');

CREATE TRIGGER trg_scheduled_tasks_business_id_immutable
BEFORE UPDATE ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('task_id');
