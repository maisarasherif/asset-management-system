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

ALTER TABLE users ADD COLUMN display_id TEXT;
ALTER TABLE main_categories ADD COLUMN display_id TEXT;
ALTER TABLE categories ADD COLUMN display_id TEXT;
ALTER TABLE test_types ADD COLUMN display_id TEXT;
ALTER TABLE asset_templates ADD COLUMN display_id TEXT;
ALTER TABLE template_components ADD COLUMN display_id TEXT;
ALTER TABLE template_component_tests ADD COLUMN display_id TEXT;
ALTER TABLE assets ADD COLUMN display_id TEXT;
ALTER TABLE components ADD COLUMN display_id TEXT;
ALTER TABLE certificates ADD COLUMN display_id TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN display_id TEXT;

UPDATE users SET display_id = user_id WHERE display_id IS NULL;
UPDATE main_categories SET display_id = main_category_id WHERE display_id IS NULL;
UPDATE categories SET display_id = category_id WHERE display_id IS NULL;
UPDATE test_types SET display_id = test_id WHERE display_id IS NULL;
UPDATE asset_templates SET display_id = template_id WHERE display_id IS NULL;
UPDATE template_components SET display_id = template_component_id WHERE display_id IS NULL;
UPDATE template_component_tests SET display_id = template_component_test_id WHERE display_id IS NULL;
UPDATE assets SET display_id = asset_id WHERE display_id IS NULL;
UPDATE components SET display_id = component_id WHERE display_id IS NULL;
UPDATE certificates SET display_id = certificate_id WHERE display_id IS NULL;
UPDATE scheduled_tasks SET display_id = task_id WHERE display_id IS NULL;

ALTER TABLE users ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE main_categories ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE test_types ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE asset_templates ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE template_components ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE template_component_tests ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE assets ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE components ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE certificates ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE scheduled_tasks ALTER COLUMN display_id SET NOT NULL;

ALTER TABLE users ADD CONSTRAINT users_display_id_unique UNIQUE (display_id);
ALTER TABLE main_categories ADD CONSTRAINT main_categories_display_id_unique UNIQUE (display_id);
ALTER TABLE categories ADD CONSTRAINT categories_display_id_unique UNIQUE (display_id);
ALTER TABLE test_types ADD CONSTRAINT test_types_display_id_unique UNIQUE (display_id);
ALTER TABLE asset_templates ADD CONSTRAINT asset_templates_display_id_unique UNIQUE (display_id);
ALTER TABLE template_components ADD CONSTRAINT template_components_display_id_unique UNIQUE (display_id);
ALTER TABLE template_component_tests ADD CONSTRAINT template_component_tests_display_id_unique UNIQUE (display_id);
ALTER TABLE assets ADD CONSTRAINT assets_display_id_unique UNIQUE (display_id);
ALTER TABLE components ADD CONSTRAINT components_display_id_unique UNIQUE (display_id);
ALTER TABLE certificates ADD CONSTRAINT certificates_display_id_unique UNIQUE (display_id);
ALTER TABLE scheduled_tasks ADD CONSTRAINT scheduled_tasks_display_id_unique UNIQUE (display_id);

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
