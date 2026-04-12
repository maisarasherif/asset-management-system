CREATE OR REPLACE FUNCTION format_business_segment(value BIGINT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT LPAD(value::TEXT, 3, '0');
$$;

CREATE OR REPLACE FUNCTION next_root_business_id(seq_name REGCLASS)
RETURNS TEXT
LANGUAGE SQL
AS $$
    SELECT format_business_segment(nextval(seq_name));
$$;

CREATE OR REPLACE FUNCTION assign_root_business_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(to_jsonb(NEW) ->> TG_ARGV[0], '') = '' THEN
        NEW := jsonb_populate_record(
            NEW,
            jsonb_build_object(TG_ARGV[0], next_root_business_id(TG_ARGV[1]::REGCLASS))
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_business_id_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (to_jsonb(NEW) ->> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[0]) THEN
        RAISE EXCEPTION '% is immutable', TG_ARGV[0];
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_root_business_id_sequence(seq_name REGCLASS, table_name TEXT, column_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    max_value BIGINT;
BEGIN
    EXECUTE format(
        'SELECT COALESCE(MAX(CASE WHEN %1$I ~ ''^\d+$'' THEN %1$I::BIGINT END), 0) FROM %2$I',
        column_name,
        table_name
    )
    INTO max_value;

    PERFORM setval(seq_name, GREATEST(max_value, 1), max_value > 0);
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

ALTER TABLE scheduled_tasks
ADD COLUMN external_task_id TEXT NOT NULL DEFAULT '';

SELECT sync_root_business_id_sequence('user_business_id_seq', 'users', 'user_id');
SELECT sync_root_business_id_sequence('main_category_business_id_seq', 'main_categories', 'main_category_id');
SELECT sync_root_business_id_sequence('category_business_id_seq', 'categories', 'category_id');
SELECT sync_root_business_id_sequence('test_type_business_id_seq', 'test_types', 'test_id');
SELECT sync_root_business_id_sequence('template_business_id_seq', 'asset_templates', 'template_id');
SELECT sync_root_business_id_sequence('template_component_business_id_seq', 'template_components', 'template_component_id');
SELECT sync_root_business_id_sequence('template_component_test_business_id_seq', 'template_component_tests', 'template_component_test_id');
SELECT sync_root_business_id_sequence('asset_business_id_seq', 'assets', 'asset_id');
SELECT sync_root_business_id_sequence('component_business_id_seq', 'components', 'component_id');
SELECT sync_root_business_id_sequence('certificate_business_id_seq', 'certificates', 'certificate_id');
SELECT sync_root_business_id_sequence('scheduled_task_business_id_seq', 'scheduled_tasks', 'task_id');

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

CREATE TRIGGER trg_assets_assign_business_id
BEFORE INSERT ON assets
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('asset_id', 'asset_business_id_seq');

CREATE TRIGGER trg_scheduled_tasks_assign_business_id
BEFORE INSERT ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('task_id', 'scheduled_task_business_id_seq');

CREATE TRIGGER trg_template_components_assign_business_id
BEFORE INSERT ON template_components
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('template_component_id', 'template_component_business_id_seq');

CREATE TRIGGER trg_template_component_tests_assign_business_id
BEFORE INSERT ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('template_component_test_id', 'template_component_test_business_id_seq');

CREATE TRIGGER trg_components_assign_business_id
BEFORE INSERT ON components
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('component_id', 'component_business_id_seq');

CREATE TRIGGER trg_certificates_assign_business_id
BEFORE INSERT ON certificates
FOR EACH ROW
EXECUTE FUNCTION assign_root_business_id('certificate_id', 'certificate_business_id_seq');

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

CREATE TRIGGER trg_assets_business_id_immutable
BEFORE UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('asset_id');

CREATE TRIGGER trg_scheduled_tasks_business_id_immutable
BEFORE UPDATE ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('task_id');

CREATE TRIGGER trg_template_components_business_id_immutable
BEFORE UPDATE ON template_components
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('template_component_id');

CREATE TRIGGER trg_template_component_tests_business_id_immutable
BEFORE UPDATE ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('template_component_test_id');

CREATE TRIGGER trg_components_business_id_immutable
BEFORE UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('component_id');

CREATE TRIGGER trg_certificates_business_id_immutable
BEFORE UPDATE ON certificates
FOR EACH ROW
EXECUTE FUNCTION prevent_business_id_update('certificate_id');
