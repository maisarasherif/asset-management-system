-- name: 000003_templates.down.sql

DROP INDEX IF EXISTS idx_template_component_tests_test_id;
DROP INDEX IF EXISTS idx_template_component_tests_template_component_id;
DROP INDEX IF EXISTS idx_template_components_category_id;
DROP INDEX IF EXISTS idx_template_components_template_id;

DROP TABLE IF EXISTS template_component_tests;
DROP TABLE IF EXISTS template_components;
DROP TABLE IF EXISTS asset_templates;