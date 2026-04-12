DROP FUNCTION IF EXISTS spin_up_asset_from_template_version_by_business_id(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS snapshot_template_version_by_business_id(TEXT);

DROP INDEX IF EXISTS idx_template_version_component_tests_version_component_ref_id;
DROP INDEX IF EXISTS idx_template_version_components_version_ref_id;
DROP INDEX IF EXISTS idx_asset_template_versions_template_ref_id;
DROP INDEX IF EXISTS idx_certificate_upload_audit_certificate_ref_id;
DROP INDEX IF EXISTS idx_scheduled_tasks_certificate_ref_id;
DROP INDEX IF EXISTS idx_certificates_component_snapshot_test_unique;
DROP INDEX IF EXISTS idx_certificates_template_version_component_test_ref_id;
DROP INDEX IF EXISTS idx_certificates_test_type_ref_id;
DROP INDEX IF EXISTS idx_certificates_component_ref_id;
DROP INDEX IF EXISTS idx_components_asset_snapshot_component_unique;
DROP INDEX IF EXISTS idx_components_template_version_component_ref_id;
DROP INDEX IF EXISTS idx_components_category_ref_id;
DROP INDEX IF EXISTS idx_components_asset_ref_id;
DROP INDEX IF EXISTS idx_template_component_tests_component_ref_position;
DROP INDEX IF EXISTS idx_template_component_tests_test_type_ref_id;
DROP INDEX IF EXISTS idx_template_component_tests_template_component_ref_id;
DROP INDEX IF EXISTS idx_template_components_template_ref_position;
DROP INDEX IF EXISTS idx_template_components_category_ref_id;
DROP INDEX IF EXISTS idx_template_components_template_ref_id;
DROP INDEX IF EXISTS idx_assets_template_ref_id;
DROP INDEX IF EXISTS idx_categories_main_category_ref_id;

ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_template_version_component_test_ref_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_template_version_component_ref_id_fkey;
DROP TABLE IF EXISTS template_version_component_tests;
DROP TABLE IF EXISTS template_version_components;
DROP TABLE IF EXISTS asset_template_versions;

ALTER TABLE certificate_upload_audit DROP CONSTRAINT IF EXISTS certificate_upload_audit_certificate_ref_id_fkey;
ALTER TABLE scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_certificate_ref_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_component_ref_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_test_type_ref_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_asset_ref_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_category_ref_id_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_template_component_ref_id_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_test_type_ref_id_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_template_ref_id_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_category_ref_id_fkey;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_template_ref_id_fkey;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_main_category_ref_id_fkey;

ALTER TABLE categories
ADD CONSTRAINT categories_main_category_id_fkey
FOREIGN KEY (main_category_id) REFERENCES main_categories(main_category_id);

ALTER TABLE assets
ADD CONSTRAINT assets_template_id_fkey
FOREIGN KEY (template_id) REFERENCES asset_templates(template_id) ON DELETE SET NULL;

ALTER TABLE template_components
ADD CONSTRAINT template_components_template_id_fkey
FOREIGN KEY (template_id) REFERENCES asset_templates(template_id) ON DELETE CASCADE,
ADD CONSTRAINT template_components_category_id_fkey
FOREIGN KEY (category_id) REFERENCES categories(category_id);

ALTER TABLE template_component_tests
ADD CONSTRAINT template_component_tests_template_component_id_fkey
FOREIGN KEY (template_component_id) REFERENCES template_components(template_component_id) ON DELETE CASCADE,
ADD CONSTRAINT template_component_tests_test_id_fkey
FOREIGN KEY (test_id) REFERENCES test_types(test_id);

ALTER TABLE components
ADD CONSTRAINT components_asset_id_fkey
FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE,
ADD CONSTRAINT components_category_id_fkey
FOREIGN KEY (category_id) REFERENCES categories(category_id);

ALTER TABLE certificates
ADD CONSTRAINT certificates_component_id_fkey
FOREIGN KEY (component_id) REFERENCES components(component_id) ON DELETE CASCADE,
ADD CONSTRAINT certificates_test_id_fkey
FOREIGN KEY (test_id) REFERENCES test_types(test_id);

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_certificate_id_fkey
FOREIGN KEY (certificate_id) REFERENCES certificates(certificate_id) ON DELETE CASCADE;

ALTER TABLE certificate_upload_audit
ADD CONSTRAINT certificate_upload_audit_certificate_id_fkey
FOREIGN KEY (certificate_id) REFERENCES certificates(certificate_id) ON DELETE CASCADE;

ALTER TABLE certificate_upload_audit
DROP COLUMN IF EXISTS certificate_ref_id;

ALTER TABLE scheduled_tasks
DROP COLUMN IF EXISTS certificate_ref_id;

ALTER TABLE certificates
DROP COLUMN IF EXISTS template_version_component_test_ref_id,
DROP COLUMN IF EXISTS test_type_ref_id,
DROP COLUMN IF EXISTS component_ref_id;

ALTER TABLE components
DROP COLUMN IF EXISTS template_version_component_ref_id,
DROP COLUMN IF EXISTS category_ref_id,
DROP COLUMN IF EXISTS asset_ref_id;

ALTER TABLE template_component_tests
DROP COLUMN IF EXISTS position,
DROP COLUMN IF EXISTS test_type_ref_id,
DROP COLUMN IF EXISTS template_component_ref_id;

ALTER TABLE template_components
DROP COLUMN IF EXISTS position,
DROP COLUMN IF EXISTS category_ref_id,
DROP COLUMN IF EXISTS template_ref_id;

ALTER TABLE assets
DROP COLUMN IF EXISTS template_version,
DROP COLUMN IF EXISTS template_ref_id;

ALTER TABLE categories
DROP COLUMN IF EXISTS main_category_ref_id;

ALTER TABLE asset_templates
DROP COLUMN IF EXISTS current_version;

ALTER TABLE test_types
DROP CONSTRAINT IF EXISTS test_types_id_unique;

ALTER TABLE test_types
DROP COLUMN IF EXISTS id;

DROP SEQUENCE IF EXISTS test_types_internal_id_seq;
