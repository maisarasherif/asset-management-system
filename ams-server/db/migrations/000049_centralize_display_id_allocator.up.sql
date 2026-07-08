CREATE OR REPLACE FUNCTION format_display_id(value BIGINT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN value < 1000 THEN LPAD(value::TEXT, 3, '0')
        ELSE value::TEXT
    END;
$$;

CREATE OR REPLACE FUNCTION next_display_id(seq_name REGCLASS)
RETURNS TEXT
LANGUAGE SQL
AS $$
    SELECT format_display_id(nextval(seq_name));
$$;

CREATE OR REPLACE FUNCTION allocate_display_id(
    p_allocator_name TEXT,
    p_table_name REGCLASS,
    p_column_name TEXT DEFAULT 'display_id'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    candidate_value BIGINT;
    candidate_display_id TEXT;
    max_display_id BIGINT;
    display_id_exists BOOLEAN;
    retry_count INTEGER := 0;
BEGIN
    IF COALESCE(TRIM(p_allocator_name), '') = '' THEN
        RAISE EXCEPTION 'display ID allocator name is required';
    END IF;

    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM display_id_allocators
            WHERE allocator_name = p_allocator_name
        ) THEN
            EXECUTE format(
                'SELECT COALESCE(MAX(%1$I::BIGINT), 0) FROM %2$s WHERE %1$I ~ ''^[0-9]+$''',
                p_column_name,
                p_table_name
            )
            INTO max_display_id;

            INSERT INTO display_id_allocators (allocator_name, next_value)
            VALUES (p_allocator_name, max_display_id + 1)
            ON CONFLICT (allocator_name) DO UPDATE
            SET next_value = GREATEST(display_id_allocators.next_value, EXCLUDED.next_value),
                updated_at = NOW();
        END IF;

        UPDATE display_id_allocators
        SET next_value = next_value + 1,
            updated_at = NOW()
        WHERE allocator_name = p_allocator_name
        RETURNING next_value - 1
        INTO candidate_value;

        candidate_display_id := format_display_id(candidate_value);

        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
            p_table_name,
            p_column_name
        )
        INTO display_id_exists
        USING candidate_display_id;

        IF NOT display_id_exists THEN
            RETURN candidate_display_id;
        END IF;

        retry_count := retry_count + 1;
        IF retry_count > 100 THEN
            RAISE EXCEPTION 'failed to allocate unique display_id after % attempts for allocator %, last candidate %',
                retry_count,
                p_allocator_name,
                candidate_display_id
                USING ERRCODE = '23505';
        END IF;

        EXECUTE format(
            'SELECT COALESCE(MAX(%1$I::BIGINT), 0) FROM %2$s WHERE %1$I ~ ''^[0-9]+$''',
            p_column_name,
            p_table_name
        )
        INTO max_display_id;

        UPDATE display_id_allocators
        SET next_value = GREATEST(next_value, max_display_id + 1),
            updated_at = NOW()
        WHERE allocator_name = p_allocator_name;
    END LOOP;
END;
$$;

DO $$
DECLARE
    display_id_table RECORD;
    seeded_next_value BIGINT;
BEGIN
    FOR display_id_table IN
        SELECT *
        FROM (VALUES
            ('users.display_id', 'users', 'display_id'),
            ('main_categories.display_id', 'main_categories', 'display_id'),
            ('categories.display_id', 'categories', 'display_id'),
            ('test_types.display_id', 'test_types', 'display_id'),
            ('asset_templates.display_id', 'asset_templates', 'display_id'),
            ('template_components.display_id', 'template_components', 'display_id'),
            ('template_component_tests.display_id', 'template_component_tests', 'display_id'),
            ('assets.display_id', 'assets', 'display_id'),
            ('components.display_id', 'components', 'display_id'),
            ('certificates.display_id', 'certificates', 'display_id'),
            ('scheduled_tasks.display_id', 'scheduled_tasks', 'display_id'),
            ('asset_maintenance_events.display_id', 'asset_maintenance_events', 'display_id'),
            ('equipment_types.display_id', 'equipment_types', 'display_id'),
            ('single_asset_equipment.display_id', 'single_asset_equipment', 'display_id'),
            ('catalog_scopes.display_id', 'catalog_scopes', 'display_id'),
            ('catalog_scope_main_categories.display_id', 'catalog_scope_main_categories', 'display_id'),
            ('catalog_scope_categories.display_id', 'catalog_scope_categories', 'display_id'),
            ('notification_deliveries.display_id', 'notification_deliveries', 'display_id'),
            ('product_access.display_id', 'product_access', 'display_id'),
            ('hr_admin_persons.display_id', 'hr_admin_persons', 'display_id'),
            ('hr_admin_vehicles.display_id', 'hr_admin_vehicles', 'display_id'),
            ('hr_admin_companies.display_id', 'hr_admin_companies', 'display_id'),
            ('compliance_record_types.display_id', 'compliance_record_types', 'display_id'),
            ('compliance_records.display_id', 'compliance_records', 'display_id'),
            ('compliance_record_versions.display_id', 'compliance_record_versions', 'display_id')
        ) AS configured_display_id_tables(allocator_name, table_name, column_name)
    LOOP
        IF to_regclass(display_id_table.table_name) IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = display_id_table.table_name
              AND column_name = display_id_table.column_name
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'SELECT COALESCE(MAX(%1$I::BIGINT), 0) + 1 FROM %2$I WHERE %1$I ~ ''^[0-9]+$''',
            display_id_table.column_name,
            display_id_table.table_name
        )
        INTO seeded_next_value;

        INSERT INTO display_id_allocators (allocator_name, next_value)
        VALUES (display_id_table.allocator_name, seeded_next_value)
        ON CONFLICT (allocator_name) DO UPDATE
        SET next_value = GREATEST(display_id_allocators.next_value, EXCLUDED.next_value),
            updated_at = NOW();
    END LOOP;
END;
$$;

ALTER TABLE IF EXISTS notification_deliveries
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('notification_deliveries.display_id', 'notification_deliveries'::REGCLASS);

ALTER TABLE IF EXISTS product_access
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('product_access.display_id', 'product_access'::REGCLASS);

ALTER TABLE IF EXISTS hr_admin_persons
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('hr_admin_persons.display_id', 'hr_admin_persons'::REGCLASS);

ALTER TABLE IF EXISTS hr_admin_vehicles
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('hr_admin_vehicles.display_id', 'hr_admin_vehicles'::REGCLASS);

ALTER TABLE IF EXISTS hr_admin_companies
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('hr_admin_companies.display_id', 'hr_admin_companies'::REGCLASS);

ALTER TABLE IF EXISTS compliance_record_types
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('compliance_record_types.display_id', 'compliance_record_types'::REGCLASS);

ALTER TABLE IF EXISTS compliance_records
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('compliance_records.display_id', 'compliance_records'::REGCLASS);

ALTER TABLE IF EXISTS compliance_record_versions
    ALTER COLUMN display_id SET DEFAULT allocate_display_id('compliance_record_versions.display_id', 'compliance_record_versions'::REGCLASS);

CREATE OR REPLACE FUNCTION create_template_component_test(
    p_template_component_id UUID,
    p_test_id UUID
)
RETURNS TABLE (
    template_component_test_id UUID,
    display_id TEXT,
    template_component_id UUID,
    test_id UUID,
    "position" INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO template_component_tests AS tct (
        display_id,
        template_component_id,
        test_id,
        position,
        created_at
    )
    VALUES (
        allocate_display_id('template_component_tests.display_id', 'template_component_tests'::REGCLASS),
        p_template_component_id,
        p_test_id,
        COALESCE((
            SELECT MAX(existing_tct.position) + 1
            FROM template_component_tests existing_tct
            WHERE existing_tct.template_component_id = p_template_component_id
        ), 1),
        NOW()
    )
    RETURNING
        tct.template_component_test_id,
        tct.display_id,
        tct.template_component_id,
        tct.test_id,
        tct.position,
        tct.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION spin_up_asset_from_template(
    p_asset_id UUID,
    p_template_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_row RECORD;
    v_template_row RECORD;
    v_existing_components INTEGER := 0;
    v_inserted_components INTEGER := 0;
BEGIN
    SELECT a.asset_id, a.template_id
    INTO v_asset_row
    FROM assets a
    WHERE a.asset_id = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % not found', p_asset_id;
    END IF;

    SELECT at.template_id
    INTO v_template_row
    FROM asset_templates at
    WHERE at.template_id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template % not found', p_template_id;
    END IF;

    IF v_asset_row.template_id IS DISTINCT FROM v_template_row.template_id THEN
        RAISE EXCEPTION 'asset % with template % not found', p_asset_id, p_template_id;
    END IF;

    SELECT COUNT(*)
    INTO v_existing_components
    FROM components c
    WHERE c.asset_id = p_asset_id;

    IF v_existing_components > 0 THEN
        RAISE EXCEPTION 'asset % already has components', p_asset_id;
    END IF;

    INSERT INTO components (
        display_id,
        asset_id,
        category_id,
        scope_category_id,
        template_component_id,
        name,
        serial_number,
        manufacturer,
        description,
        location,
        assigned_project,
        equipment_type,
        structure,
        model,
        class,
        class_code,
        safety_critical,
        created_at,
        updated_at
    )
    SELECT
        allocate_display_id('components.display_id', 'components'::REGCLASS),
        v_asset_row.asset_id,
        tc.category_id,
        tc.scope_category_id,
        tc.template_component_id,
        tc.name,
        tc.serial_number,
        tc.manufacturer,
        tc.description,
        tc.location,
        tc.assigned_project,
        tc.equipment_type,
        tc.structure,
        tc.model,
        tc.class,
        tc.class_code,
        tc.safety_critical,
        NOW(),
        NOW()
    FROM template_components tc
    JOIN catalog_scope_categories csc
      ON csc.scope_category_id = tc.scope_category_id
    JOIN catalog_scope_main_categories csmc
      ON csmc.scope_id = csc.scope_id
     AND csmc.main_category_id = csc.main_category_id
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY
        csmc.sort_order ASC,
        csc.sort_order ASC,
        tc.position ASC,
        tc.template_component_id ASC;

    GET DIAGNOSTICS v_inserted_components = ROW_COUNT;

    INSERT INTO certificates (
        display_id,
        component_id,
        certificate_name,
        certificate_file,
        issuing_authority,
        status,
        test_id,
        imca_ref,
        imca_d018,
        maintenance_notes,
        template_component_test_id,
        created_at,
        updated_at
    )
    SELECT
        allocate_display_id('certificates.display_id', 'certificates'::REGCLASS),
        c.component_id,
        tt.test_name,
        '',
        '',
        'PENDING',
        tct.test_id,
        '',
        '',
        '',
        tct.template_component_test_id,
        NOW(),
        NOW()
    FROM template_component_tests tct
    JOIN template_components tc
      ON tc.template_component_id = tct.template_component_id
    JOIN catalog_scope_categories csc
      ON csc.scope_category_id = tc.scope_category_id
    JOIN catalog_scope_main_categories csmc
      ON csmc.scope_id = csc.scope_id
     AND csmc.main_category_id = csc.main_category_id
    JOIN test_types tt
      ON tt.test_id = tct.test_id
    JOIN components c
      ON c.template_component_id = tc.template_component_id
     AND c.asset_id = v_asset_row.asset_id
    WHERE tc.template_id = v_template_row.template_id
    ORDER BY
        csmc.sort_order ASC,
        csc.sort_order ASC,
        tc.position ASC,
        tct.position ASC,
        tct.template_component_test_id ASC;

    INSERT INTO certificate_competency_categories (
        certificate_id,
        competency_category_id
    )
    SELECT
        cert.certificate_id,
        tctcc.competency_category_id
    FROM certificates cert
    JOIN template_component_test_competency_categories tctcc
      ON tctcc.template_component_test_id = cert.template_component_test_id
    JOIN components c
      ON c.component_id = cert.component_id
    WHERE c.asset_id = v_asset_row.asset_id
      AND cert.template_component_test_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    RETURN v_inserted_components;
END;
$$;
