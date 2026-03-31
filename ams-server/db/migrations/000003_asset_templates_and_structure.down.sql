DROP INDEX IF EXISTS idx_certificates_requirement_id;
ALTER TABLE certificates DROP COLUMN IF EXISTS requirement_id;

DROP INDEX IF EXISTS idx_component_test_requirements_active_label;
DROP INDEX IF EXISTS idx_component_test_requirements_component_id;
DROP TABLE IF EXISTS component_test_requirements;

DROP INDEX IF EXISTS idx_components_source_template_component_id;
DROP INDEX IF EXISTS idx_components_asset_category_id;
ALTER TABLE components
    DROP COLUMN IF EXISTS is_archived,
    DROP COLUMN IF EXISTS sort_order,
    DROP COLUMN IF EXISTS source_template_component_id,
    DROP COLUMN IF EXISTS asset_category_id;

DROP INDEX IF EXISTS idx_asset_categories_asset_id;
DROP TABLE IF EXISTS asset_categories;

ALTER TABLE assets DROP COLUMN IF EXISTS template_id;

DROP INDEX IF EXISTS idx_asset_template_requirements_active_label;
DROP TABLE IF EXISTS asset_template_test_requirements;

DROP TABLE IF EXISTS asset_template_components;

DROP INDEX IF EXISTS idx_asset_template_categories_active_unique;
DROP TABLE IF EXISTS asset_template_categories;

DROP INDEX IF EXISTS idx_asset_templates_name_active;
DROP TABLE IF EXISTS asset_templates;
