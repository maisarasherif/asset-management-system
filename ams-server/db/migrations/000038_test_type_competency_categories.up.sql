CREATE TABLE template_component_test_competency_categories (
    template_component_test_id UUID NOT NULL REFERENCES template_component_tests(template_component_test_id) ON DELETE CASCADE,
    competency_category_id UUID NOT NULL REFERENCES competency_categories(competency_category_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (template_component_test_id, competency_category_id)
);

CREATE INDEX idx_template_component_test_competency_categories_category_id
ON template_component_test_competency_categories(competency_category_id);

CREATE TABLE certificate_competency_categories (
    certificate_id UUID NOT NULL REFERENCES certificates(certificate_id) ON DELETE CASCADE,
    competency_category_id UUID NOT NULL REFERENCES competency_categories(competency_category_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (certificate_id, competency_category_id)
);

CREATE INDEX idx_certificate_competency_categories_category_id
ON certificate_competency_categories(competency_category_id);

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
