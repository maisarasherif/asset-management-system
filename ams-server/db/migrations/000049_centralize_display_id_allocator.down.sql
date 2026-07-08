CREATE OR REPLACE FUNCTION next_display_id(seq_name REGCLASS)
RETURNS TEXT
LANGUAGE SQL
AS $$
    SELECT CASE
        WHEN next_value < 1000 THEN LPAD(next_value::TEXT, 3, '0')
        ELSE next_value::TEXT
    END
    FROM (SELECT nextval(seq_name) AS next_value) generated;
$$;

ALTER TABLE IF EXISTS notification_deliveries
    ALTER COLUMN display_id SET DEFAULT next_display_id('notification_delivery_display_id_seq');

ALTER TABLE IF EXISTS product_access
    ALTER COLUMN display_id SET DEFAULT next_display_id('product_access_display_id_seq');

ALTER TABLE IF EXISTS hr_admin_persons
    ALTER COLUMN display_id SET DEFAULT next_display_id('hr_admin_person_display_id_seq');

ALTER TABLE IF EXISTS hr_admin_vehicles
    ALTER COLUMN display_id SET DEFAULT next_display_id('hr_admin_vehicle_display_id_seq');

ALTER TABLE IF EXISTS hr_admin_companies
    ALTER COLUMN display_id SET DEFAULT next_display_id('hr_admin_company_display_id_seq');

ALTER TABLE IF EXISTS compliance_record_types
    ALTER COLUMN display_id SET DEFAULT next_display_id('compliance_record_type_display_id_seq');

ALTER TABLE IF EXISTS compliance_records
    ALTER COLUMN display_id SET DEFAULT next_display_id('compliance_record_display_id_seq');

ALTER TABLE IF EXISTS compliance_record_versions
    ALTER COLUMN display_id SET DEFAULT next_display_id('compliance_record_version_display_id_seq');

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
DECLARE
    candidate_value BIGINT;
    candidate_display_id TEXT;
    max_display_id BIGINT;
    violated_constraint TEXT;
    retry_count INTEGER := 0;
BEGIN
    LOOP
        UPDATE display_id_allocators
        SET next_value = next_value + 1,
            updated_at = NOW()
        WHERE allocator_name = 'template_component_tests.display_id'
        RETURNING next_value - 1
        INTO candidate_value;

        IF candidate_value IS NULL THEN
            INSERT INTO display_id_allocators (allocator_name, next_value)
            SELECT
                'template_component_tests.display_id',
                COALESCE(MAX(substring(tct.display_id from '([0-9]+)$')::BIGINT), 0) + 1
            FROM template_component_tests tct
            WHERE tct.display_id ~ '([0-9]+)$'
            ON CONFLICT (allocator_name) DO NOTHING;
            CONTINUE;
        END IF;

        candidate_display_id := CASE
            WHEN candidate_value < 1000 THEN LPAD(candidate_value::TEXT, 3, '0')
            ELSE candidate_value::TEXT
        END;

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
                candidate_display_id,
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
            RETURN;
        EXCEPTION WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;

            IF violated_constraint <> 'template_component_tests_display_id_unique' THEN
                RAISE;
            END IF;

            retry_count := retry_count + 1;
            IF retry_count > 100 THEN
                RAISE EXCEPTION 'failed to allocate unique template_component_tests.display_id after % attempts; last candidate %, allocator value %', retry_count, candidate_display_id, candidate_value
                    USING ERRCODE = '23505',
                          CONSTRAINT = 'template_component_tests_display_id_unique';
            END IF;

            SELECT COALESCE(MAX(substring(tct.display_id from '([0-9]+)$')::BIGINT), 0)
            FROM template_component_tests tct
            WHERE tct.display_id ~ '([0-9]+)$'
            INTO max_display_id;

            UPDATE display_id_allocators
            SET next_value = GREATEST(next_value, max_display_id + 1),
                updated_at = NOW()
            WHERE allocator_name = 'template_component_tests.display_id';
        END;
    END LOOP;
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
        next_display_id('component_display_id_seq'),
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
        next_display_id('certificate_display_id_seq'),
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

DROP FUNCTION IF EXISTS allocate_display_id(TEXT, REGCLASS, TEXT);
DROP FUNCTION IF EXISTS format_display_id(BIGINT);
