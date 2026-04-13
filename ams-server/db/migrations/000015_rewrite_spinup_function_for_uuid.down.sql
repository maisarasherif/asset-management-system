CREATE OR REPLACE FUNCTION spin_up_asset_from_template_by_business_id(
    p_asset_id TEXT,
    p_template_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_ref_id INTEGER;
    v_template_ref_id INTEGER;
    v_inserted_components INTEGER := 0;
BEGIN
    SELECT a.id, a.template_ref_id
    INTO v_asset_ref_id, v_template_ref_id
    FROM assets a
    JOIN asset_templates at
      ON at.id = a.template_ref_id
    WHERE a.asset_id = p_asset_id
      AND at.template_id = p_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % with template % not found', p_asset_id, p_template_id;
    END IF;

    INSERT INTO components (
        asset_id,
        asset_ref_id,
        category_id,
        category_ref_id,
        template_component_ref_id,
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
        a.asset_id,
        a.id,
        tc.category_id,
        tc.category_ref_id,
        tc.id,
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
    CROSS JOIN assets a
    WHERE tc.template_ref_id = v_template_ref_id
      AND a.id = v_asset_ref_id
    ORDER BY tc.position, tc.id;

    GET DIAGNOSTICS v_inserted_components = ROW_COUNT;

    INSERT INTO certificates (
        component_id,
        component_ref_id,
        certificate_name,
        certificate_file,
        issuing_authority,
        status,
        test_id,
        test_type_ref_id,
        imca_ref,
        imca_d018,
        maintenance_notes,
        template_component_test_ref_id,
        created_at,
        updated_at
    )
    SELECT
        c.component_id,
        c.id,
        tt.test_name,
        '',
        '',
        'PENDING',
        tct.test_id,
        tct.test_type_ref_id,
        '',
        '',
        '',
        tct.id,
        NOW(),
        NOW()
    FROM template_component_tests tct
    JOIN template_components tc
      ON tc.id = tct.template_component_ref_id
    JOIN test_types tt
      ON tt.id = tct.test_type_ref_id
    JOIN components c
      ON c.template_component_ref_id = tc.id
     AND c.asset_ref_id = v_asset_ref_id
    WHERE tc.template_ref_id = v_template_ref_id
    ORDER BY tc.position, tct.position, tct.id;

    RETURN v_inserted_components;
END;
$$;
