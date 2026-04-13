DROP TRIGGER IF EXISTS trg_certificate_upload_audit_sync_certificate_uuid ON certificate_upload_audit;
DROP TRIGGER IF EXISTS trg_scheduled_tasks_sync_certificate_uuid ON scheduled_tasks;
DROP TRIGGER IF EXISTS trg_certificates_sync_shadow_uuids ON certificates;
DROP TRIGGER IF EXISTS trg_components_sync_shadow_uuids ON components;
DROP TRIGGER IF EXISTS trg_template_component_tests_sync_shadow_uuids ON template_component_tests;
DROP TRIGGER IF EXISTS trg_template_components_sync_shadow_uuids ON template_components;
DROP TRIGGER IF EXISTS trg_categories_sync_main_category_uuid ON categories;
DROP TRIGGER IF EXISTS trg_assets_sync_template_uuid ON assets;

DROP INDEX IF EXISTS idx_certificate_upload_audit_certificate_uuid;
DROP INDEX IF EXISTS idx_scheduled_tasks_certificate_uuid;
DROP INDEX IF EXISTS idx_certificates_template_component_test_uuid;
DROP INDEX IF EXISTS idx_certificates_test_uuid;
DROP INDEX IF EXISTS idx_certificates_component_uuid;
DROP INDEX IF EXISTS idx_components_template_component_uuid;
DROP INDEX IF EXISTS idx_components_category_uuid;
DROP INDEX IF EXISTS idx_components_asset_uuid;
DROP INDEX IF EXISTS idx_template_component_tests_test_uuid;
DROP INDEX IF EXISTS idx_template_component_tests_template_component_uuid;
DROP INDEX IF EXISTS idx_template_components_category_uuid;
DROP INDEX IF EXISTS idx_template_components_template_uuid;
DROP INDEX IF EXISTS idx_categories_main_category_uuid;
DROP INDEX IF EXISTS idx_assets_template_uuid;

ALTER TABLE certificate_upload_audit DROP CONSTRAINT IF EXISTS certificate_upload_audit_certificate_uuid_fkey;
ALTER TABLE scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_certificate_uuid_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_template_component_test_uuid_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_test_uuid_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_component_uuid_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_template_component_uuid_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_category_uuid_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_asset_uuid_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_test_uuid_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_template_component_uuid_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_category_uuid_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_template_uuid_fkey;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_main_category_uuid_fkey;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_template_uuid_fkey;

ALTER TABLE certificate_upload_audit DROP COLUMN IF EXISTS certificate_uuid;
ALTER TABLE scheduled_tasks DROP COLUMN IF EXISTS certificate_uuid;
ALTER TABLE certificates
    DROP COLUMN IF EXISTS template_component_test_uuid,
    DROP COLUMN IF EXISTS test_uuid,
    DROP COLUMN IF EXISTS component_uuid;
ALTER TABLE components
    DROP COLUMN IF EXISTS template_component_uuid,
    DROP COLUMN IF EXISTS category_uuid,
    DROP COLUMN IF EXISTS asset_uuid;
ALTER TABLE template_component_tests
    DROP COLUMN IF EXISTS test_uuid,
    DROP COLUMN IF EXISTS template_component_uuid;
ALTER TABLE template_components
    DROP COLUMN IF EXISTS category_uuid,
    DROP COLUMN IF EXISTS template_uuid;
ALTER TABLE categories DROP COLUMN IF EXISTS main_category_uuid;
ALTER TABLE assets DROP COLUMN IF EXISTS template_uuid;

DROP FUNCTION IF EXISTS sync_certificate_upload_audit_certificate_uuid();
DROP FUNCTION IF EXISTS sync_scheduled_task_certificate_uuid();
DROP FUNCTION IF EXISTS sync_certificate_shadow_uuids();
DROP FUNCTION IF EXISTS sync_component_shadow_uuids();
DROP FUNCTION IF EXISTS sync_template_component_test_shadow_uuids();
DROP FUNCTION IF EXISTS sync_template_component_shadow_uuids();
DROP FUNCTION IF EXISTS sync_category_main_category_uuid();
DROP FUNCTION IF EXISTS sync_asset_template_uuid();
