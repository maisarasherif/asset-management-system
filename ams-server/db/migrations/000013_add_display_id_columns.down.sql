DROP TRIGGER IF EXISTS trg_scheduled_tasks_sync_display_id ON scheduled_tasks;
DROP TRIGGER IF EXISTS trg_certificates_sync_display_id ON certificates;
DROP TRIGGER IF EXISTS trg_components_sync_display_id ON components;
DROP TRIGGER IF EXISTS trg_assets_sync_display_id ON assets;
DROP TRIGGER IF EXISTS trg_template_component_tests_sync_display_id ON template_component_tests;
DROP TRIGGER IF EXISTS trg_template_components_sync_display_id ON template_components;
DROP TRIGGER IF EXISTS trg_asset_templates_sync_display_id ON asset_templates;
DROP TRIGGER IF EXISTS trg_test_types_sync_display_id ON test_types;
DROP TRIGGER IF EXISTS trg_categories_sync_display_id ON categories;
DROP TRIGGER IF EXISTS trg_main_categories_sync_display_id ON main_categories;
DROP TRIGGER IF EXISTS trg_users_sync_display_id ON users;

ALTER TABLE scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_display_id_unique;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_display_id_unique;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_display_id_unique;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_display_id_unique;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_display_id_unique;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_display_id_unique;
ALTER TABLE asset_templates DROP CONSTRAINT IF EXISTS asset_templates_display_id_unique;
ALTER TABLE test_types DROP CONSTRAINT IF EXISTS test_types_display_id_unique;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_display_id_unique;
ALTER TABLE main_categories DROP CONSTRAINT IF EXISTS main_categories_display_id_unique;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_display_id_unique;

ALTER TABLE scheduled_tasks DROP COLUMN IF EXISTS display_id;
ALTER TABLE certificates DROP COLUMN IF EXISTS display_id;
ALTER TABLE components DROP COLUMN IF EXISTS display_id;
ALTER TABLE assets DROP COLUMN IF EXISTS display_id;
ALTER TABLE template_component_tests DROP COLUMN IF EXISTS display_id;
ALTER TABLE template_components DROP COLUMN IF EXISTS display_id;
ALTER TABLE asset_templates DROP COLUMN IF EXISTS display_id;
ALTER TABLE test_types DROP COLUMN IF EXISTS display_id;
ALTER TABLE categories DROP COLUMN IF EXISTS display_id;
ALTER TABLE main_categories DROP COLUMN IF EXISTS display_id;
ALTER TABLE users DROP COLUMN IF EXISTS display_id;

DROP FUNCTION IF EXISTS sync_display_id_from_business_id();
