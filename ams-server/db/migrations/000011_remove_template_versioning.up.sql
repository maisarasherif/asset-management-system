DROP FUNCTION IF EXISTS spin_up_asset_from_template_version_by_business_id(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS snapshot_template_version_by_business_id(TEXT);

DROP INDEX IF EXISTS idx_components_asset_snapshot_component_unique;
DROP INDEX IF EXISTS idx_components_template_version_component_ref_id;
DROP INDEX IF EXISTS idx_certificates_component_snapshot_test_unique;
DROP INDEX IF EXISTS idx_certificates_template_version_component_test_ref_id;

ALTER TABLE components DROP CONSTRAINT IF EXISTS components_template_version_component_ref_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_template_version_component_test_ref_id_fkey;

ALTER TABLE components
RENAME COLUMN template_version_component_ref_id TO template_component_ref_id;

ALTER TABLE certificates
RENAME COLUMN template_version_component_test_ref_id TO template_component_test_ref_id;

UPDATE components c
SET template_component_ref_id = tvc.source_template_component_ref_id
FROM template_version_components tvc
WHERE c.template_component_ref_id = tvc.id;

UPDATE certificates cert
SET template_component_test_ref_id = tvct.source_template_component_test_ref_id
FROM template_version_component_tests tvct
WHERE cert.template_component_test_ref_id = tvct.id;

ALTER TABLE components
ADD CONSTRAINT components_template_component_ref_id_fkey
FOREIGN KEY (template_component_ref_id) REFERENCES template_components(id) ON DELETE SET NULL;

ALTER TABLE certificates
ADD CONSTRAINT certificates_template_component_test_ref_id_fkey
FOREIGN KEY (template_component_test_ref_id) REFERENCES template_component_tests(id) ON DELETE SET NULL;

CREATE INDEX idx_components_template_component_ref_id ON components(template_component_ref_id);
CREATE UNIQUE INDEX idx_components_asset_template_component_unique
ON components(asset_ref_id, template_component_ref_id)
WHERE template_component_ref_id IS NOT NULL;

CREATE INDEX idx_certificates_template_component_test_ref_id ON certificates(template_component_test_ref_id);
CREATE UNIQUE INDEX idx_certificates_component_template_test_unique
ON certificates(component_ref_id, template_component_test_ref_id)
WHERE template_component_test_ref_id IS NOT NULL;

DROP TABLE IF EXISTS template_version_component_tests;
DROP TABLE IF EXISTS template_version_components;
DROP TABLE IF EXISTS asset_template_versions;

ALTER TABLE asset_templates
DROP COLUMN IF EXISTS current_version;

ALTER TABLE assets
DROP COLUMN IF EXISTS template_version;

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
