CREATE OR REPLACE FUNCTION sync_display_id_sequence(seq_name REGCLASS, table_name TEXT, column_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    max_value BIGINT;
BEGIN
    EXECUTE format(
        'SELECT COALESCE(MAX(substring(%1$I from ''([0-9]+)$'')::BIGINT), 0)
         FROM %2$I
         WHERE %1$I ~ ''([0-9]+)$''',
        column_name,
        table_name
    )
    INTO max_value;

    PERFORM setval(seq_name, GREATEST(max_value, 1), max_value > 0);
END;
$$;

DO $$
DECLARE
    item RECORD;
    seq REGCLASS;
BEGIN
    FOR item IN
        SELECT *
        FROM (
            VALUES
                ('user_display_id_seq', 'users', 'display_id'),
                ('main_category_display_id_seq', 'main_categories', 'display_id'),
                ('category_display_id_seq', 'categories', 'display_id'),
                ('test_type_display_id_seq', 'test_types', 'display_id'),
                ('template_display_id_seq', 'asset_templates', 'display_id'),
                ('template_component_display_id_seq', 'template_components', 'display_id'),
                ('template_component_test_display_id_seq', 'template_component_tests', 'display_id'),
                ('asset_display_id_seq', 'assets', 'display_id'),
                ('component_display_id_seq', 'components', 'display_id'),
                ('certificate_display_id_seq', 'certificates', 'display_id'),
                ('scheduled_task_display_id_seq', 'scheduled_tasks', 'display_id'),
                ('asset_maintenance_event_display_id_seq', 'asset_maintenance_events', 'display_id'),
                ('equipment_type_display_id_seq', 'equipment_types', 'display_id'),
                ('single_asset_equipment_display_id_seq', 'single_asset_equipment', 'display_id'),
                ('catalog_scope_display_id_seq', 'catalog_scopes', 'display_id'),
                ('catalog_scope_main_category_display_id_seq', 'catalog_scope_main_categories', 'display_id'),
                ('catalog_scope_category_display_id_seq', 'catalog_scope_categories', 'display_id'),
                ('notification_delivery_display_id_seq', 'notification_deliveries', 'display_id'),
                ('product_access_display_id_seq', 'product_access', 'display_id'),
                ('hr_admin_person_display_id_seq', 'hr_admin_persons', 'display_id'),
                ('hr_admin_vehicle_display_id_seq', 'hr_admin_vehicles', 'display_id'),
                ('hr_admin_company_display_id_seq', 'hr_admin_companies', 'display_id'),
                ('compliance_record_type_display_id_seq', 'compliance_record_types', 'display_id'),
                ('compliance_record_display_id_seq', 'compliance_records', 'display_id'),
                ('compliance_record_version_display_id_seq', 'compliance_record_versions', 'display_id')
        ) AS sequences(sequence_name, table_name, column_name)
    LOOP
        seq := to_regclass(item.sequence_name);

        IF seq IS NULL OR to_regclass(item.table_name) IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = item.table_name
              AND column_name = item.column_name
        ) THEN
            CONTINUE;
        END IF;

        PERFORM sync_display_id_sequence(seq, item.table_name, item.column_name);
    END LOOP;
END $$;
