DROP INDEX IF EXISTS idx_scheduled_tasks_sent_at;
DROP INDEX IF EXISTS idx_scheduled_tasks_type;
DROP INDEX IF EXISTS idx_scheduled_tasks_certificate_id;
DROP INDEX IF EXISTS idx_certificates_test_id;
DROP INDEX IF EXISTS idx_certificates_expiry_date;
DROP INDEX IF EXISTS idx_certificates_component_id;
DROP INDEX IF EXISTS idx_components_category_id;
DROP INDEX IF EXISTS idx_components_asset_id;

DROP TABLE IF EXISTS scheduled_tasks;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS components;
DROP TABLE IF EXISTS test_types;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;