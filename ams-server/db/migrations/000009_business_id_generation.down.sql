DROP TRIGGER IF EXISTS trg_certificates_business_id_immutable ON certificates;
DROP TRIGGER IF EXISTS trg_components_business_id_immutable ON components;
DROP TRIGGER IF EXISTS trg_template_component_tests_business_id_immutable ON template_component_tests;
DROP TRIGGER IF EXISTS trg_template_components_business_id_immutable ON template_components;
DROP TRIGGER IF EXISTS trg_scheduled_tasks_business_id_immutable ON scheduled_tasks;
DROP TRIGGER IF EXISTS trg_assets_business_id_immutable ON assets;
DROP TRIGGER IF EXISTS trg_asset_templates_business_id_immutable ON asset_templates;
DROP TRIGGER IF EXISTS trg_test_types_business_id_immutable ON test_types;
DROP TRIGGER IF EXISTS trg_categories_business_id_immutable ON categories;
DROP TRIGGER IF EXISTS trg_main_categories_business_id_immutable ON main_categories;
DROP TRIGGER IF EXISTS trg_users_business_id_immutable ON users;

DROP TRIGGER IF EXISTS trg_certificates_assign_business_id ON certificates;
DROP TRIGGER IF EXISTS trg_components_assign_business_id ON components;
DROP TRIGGER IF EXISTS trg_template_component_tests_assign_business_id ON template_component_tests;
DROP TRIGGER IF EXISTS trg_template_components_assign_business_id ON template_components;
DROP TRIGGER IF EXISTS trg_scheduled_tasks_assign_business_id ON scheduled_tasks;
DROP TRIGGER IF EXISTS trg_assets_assign_business_id ON assets;
DROP TRIGGER IF EXISTS trg_asset_templates_assign_business_id ON asset_templates;
DROP TRIGGER IF EXISTS trg_test_types_assign_business_id ON test_types;
DROP TRIGGER IF EXISTS trg_categories_assign_business_id ON categories;
DROP TRIGGER IF EXISTS trg_main_categories_assign_business_id ON main_categories;
DROP TRIGGER IF EXISTS trg_users_assign_business_id ON users;

ALTER TABLE scheduled_tasks
DROP COLUMN IF EXISTS external_task_id;

DROP SEQUENCE IF EXISTS scheduled_task_business_id_seq;
DROP SEQUENCE IF EXISTS certificate_business_id_seq;
DROP SEQUENCE IF EXISTS component_business_id_seq;
DROP SEQUENCE IF EXISTS asset_business_id_seq;
DROP SEQUENCE IF EXISTS template_component_test_business_id_seq;
DROP SEQUENCE IF EXISTS template_component_business_id_seq;
DROP SEQUENCE IF EXISTS template_business_id_seq;
DROP SEQUENCE IF EXISTS test_type_business_id_seq;
DROP SEQUENCE IF EXISTS category_business_id_seq;
DROP SEQUENCE IF EXISTS main_category_business_id_seq;
DROP SEQUENCE IF EXISTS user_business_id_seq;

DROP FUNCTION IF EXISTS sync_root_business_id_sequence(REGCLASS, TEXT, TEXT);
DROP FUNCTION IF EXISTS prevent_business_id_update();
DROP FUNCTION IF EXISTS assign_root_business_id();
DROP FUNCTION IF EXISTS next_root_business_id(REGCLASS);
DROP FUNCTION IF EXISTS format_business_segment(BIGINT);
