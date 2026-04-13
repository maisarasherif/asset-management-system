CREATE OR REPLACE FUNCTION spin_up_asset_from_template_by_business_id(
    p_asset_id TEXT,
    p_template_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_row RECORD;
    v_template_row RECORD;
    v_inserted_components INTEGER := 0;
BEGIN
    SELECT a.id, a.asset_id, a.uuid, a.template_id, a.template_ref_id, a.template_uuid
    INTO v_asset_row
    FROM assets a
    WHERE a.asset_id = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % not found', p_asset_id;
    END IF;

    SELECT at.id, at.template_id, at.uuid
    INTO v_template_row
    FROM asset_templates at
    WHERE at.template_id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template % not found', p_template_id;
    END IF;

    IF v_asset_row.template_uuid IS DISTINCT FROM v_template_row.uuid THEN
        RAISE EXCEPTION 'asset % with template % not found', p_asset_id, p_template_id;
    END IF;

    INSERT INTO components (
        asset_id,
        asset_ref_id,
        asset_uuid,
        category_id,
        category_ref_id,
        category_uuid,
        template_component_ref_id,
        template_component_uuid,
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
        v_asset_row.asset_id,
        v_asset_row.id,
        v_asset_row.uuid,
        tc.category_id,
        tc.category_ref_id,
        tc.category_uuid,
        tc.id,
        tc.uuid,
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
    WHERE tc.template_uuid = v_template_row.uuid
    ORDER BY tc.position, tc.id;

    GET DIAGNOSTICS v_inserted_components = ROW_COUNT;

    INSERT INTO certificates (
        component_id,
        component_ref_id,
        component_uuid,
        certificate_name,
        certificate_file,
        issuing_authority,
        status,
        test_id,
        test_type_ref_id,
        test_uuid,
        imca_ref,
        imca_d018,
        maintenance_notes,
        template_component_test_ref_id,
        template_component_test_uuid,
        created_at,
        updated_at
    )
    SELECT
        c.component_id,
        c.id,
        c.uuid,
        tt.test_name,
        '',
        '',
        'PENDING',
        tct.test_id,
        tct.test_type_ref_id,
        tct.test_uuid,
        '',
        '',
        '',
        tct.id,
        tct.uuid,
        NOW(),
        NOW()
    FROM template_component_tests tct
    JOIN template_components tc
      ON tc.uuid = tct.template_component_uuid
    JOIN test_types tt
      ON tt.uuid = tct.test_uuid
    JOIN components c
      ON c.template_component_uuid = tc.uuid
     AND c.asset_uuid = v_asset_row.uuid
    WHERE tc.template_uuid = v_template_row.uuid
    ORDER BY tc.position, tct.position, tct.id;

    RETURN v_inserted_components;
END;
$$;
