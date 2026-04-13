DROP INDEX IF EXISTS idx_certificates_component_template_test_unique;
DROP INDEX IF EXISTS idx_components_asset_template_component_unique;

ALTER TABLE categories ADD COLUMN main_category_ref_id INTEGER;
ALTER TABLE assets ADD COLUMN template_ref_id INTEGER;
ALTER TABLE template_components
    ADD COLUMN template_ref_id INTEGER,
    ADD COLUMN category_ref_id INTEGER;
ALTER TABLE template_component_tests
    ADD COLUMN template_component_ref_id INTEGER,
    ADD COLUMN test_type_ref_id INTEGER;
ALTER TABLE components
    ADD COLUMN asset_ref_id INTEGER,
    ADD COLUMN category_ref_id INTEGER,
    ADD COLUMN template_component_ref_id INTEGER;
ALTER TABLE certificates
    ADD COLUMN component_ref_id INTEGER,
    ADD COLUMN test_type_ref_id INTEGER,
    ADD COLUMN template_component_test_ref_id INTEGER;
ALTER TABLE scheduled_tasks ADD COLUMN certificate_ref_id INTEGER;
ALTER TABLE certificate_upload_audit ADD COLUMN certificate_ref_id INTEGER;

UPDATE categories c
SET main_category_ref_id = mc.id
FROM main_categories mc
WHERE c.main_category_uuid = mc.uuid;

UPDATE assets a
SET template_ref_id = at.id
FROM asset_templates at
WHERE a.template_uuid = at.uuid;

UPDATE template_components tc
SET template_ref_id = at.id,
    category_ref_id = c.id
FROM asset_templates at, categories c
WHERE tc.template_uuid = at.uuid
  AND tc.category_uuid = c.uuid;

UPDATE template_component_tests tct
SET template_component_ref_id = tc.id,
    test_type_ref_id = tt.id
FROM template_components tc, test_types tt
WHERE tct.template_component_uuid = tc.uuid
  AND tct.test_uuid = tt.uuid;

UPDATE components c
SET asset_ref_id = a.id,
    category_ref_id = cat.id,
    template_component_ref_id = (
        SELECT tc.id
        FROM template_components tc
        WHERE c.template_component_uuid = tc.uuid
    )
FROM assets a,
     categories cat
WHERE c.asset_uuid = a.uuid
  AND c.category_uuid = cat.uuid;

UPDATE certificates cert
SET component_ref_id = c.id,
    test_type_ref_id = tt.id,
    template_component_test_ref_id = (
        SELECT tct.id
        FROM template_component_tests tct
        WHERE cert.template_component_test_uuid = tct.uuid
    )
FROM components c,
     test_types tt
WHERE cert.component_uuid = c.uuid
  AND cert.test_uuid = tt.uuid;

UPDATE scheduled_tasks st
SET certificate_ref_id = cert.id
FROM certificates cert
WHERE st.certificate_uuid = cert.uuid;

UPDATE certificate_upload_audit cua
SET certificate_ref_id = cert.id
FROM certificates cert
WHERE cua.certificate_uuid = cert.uuid;

ALTER TABLE categories
ALTER COLUMN main_category_ref_id SET NOT NULL;

ALTER TABLE template_components
ALTER COLUMN template_ref_id SET NOT NULL,
ALTER COLUMN category_ref_id SET NOT NULL;

ALTER TABLE template_component_tests
ALTER COLUMN template_component_ref_id SET NOT NULL,
ALTER COLUMN test_type_ref_id SET NOT NULL;

ALTER TABLE components
ALTER COLUMN asset_ref_id SET NOT NULL,
ALTER COLUMN category_ref_id SET NOT NULL;

ALTER TABLE certificates
ALTER COLUMN component_ref_id SET NOT NULL,
ALTER COLUMN test_type_ref_id SET NOT NULL;

ALTER TABLE scheduled_tasks
ALTER COLUMN certificate_ref_id SET NOT NULL;

ALTER TABLE certificate_upload_audit
ALTER COLUMN certificate_ref_id SET NOT NULL;

ALTER TABLE categories
ADD CONSTRAINT categories_main_category_ref_id_fkey
FOREIGN KEY (main_category_ref_id) REFERENCES main_categories(id) ON DELETE RESTRICT;

ALTER TABLE assets
ADD CONSTRAINT assets_template_ref_id_fkey
FOREIGN KEY (template_ref_id) REFERENCES asset_templates(id) ON DELETE RESTRICT;

ALTER TABLE template_components
ADD CONSTRAINT template_components_template_ref_id_fkey
FOREIGN KEY (template_ref_id) REFERENCES asset_templates(id) ON DELETE CASCADE,
ADD CONSTRAINT template_components_category_ref_id_fkey
FOREIGN KEY (category_ref_id) REFERENCES categories(id) ON DELETE RESTRICT;

ALTER TABLE template_component_tests
ADD CONSTRAINT template_component_tests_template_component_ref_id_fkey
FOREIGN KEY (template_component_ref_id) REFERENCES template_components(id) ON DELETE CASCADE,
ADD CONSTRAINT template_component_tests_test_type_ref_id_fkey
FOREIGN KEY (test_type_ref_id) REFERENCES test_types(id) ON DELETE RESTRICT;

ALTER TABLE components
ADD CONSTRAINT components_asset_ref_id_fkey
FOREIGN KEY (asset_ref_id) REFERENCES assets(id) ON DELETE CASCADE,
ADD CONSTRAINT components_category_ref_id_fkey
FOREIGN KEY (category_ref_id) REFERENCES categories(id) ON DELETE RESTRICT,
ADD CONSTRAINT components_template_component_ref_id_fkey
FOREIGN KEY (template_component_ref_id) REFERENCES template_components(id) ON DELETE SET NULL;

ALTER TABLE certificates
ADD CONSTRAINT certificates_component_ref_id_fkey
FOREIGN KEY (component_ref_id) REFERENCES components(id) ON DELETE CASCADE,
ADD CONSTRAINT certificates_test_type_ref_id_fkey
FOREIGN KEY (test_type_ref_id) REFERENCES test_types(id) ON DELETE RESTRICT,
ADD CONSTRAINT certificates_template_component_test_ref_id_fkey
FOREIGN KEY (template_component_test_ref_id) REFERENCES template_component_tests(id) ON DELETE SET NULL;

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_certificate_ref_id_fkey
FOREIGN KEY (certificate_ref_id) REFERENCES certificates(id) ON DELETE CASCADE;

ALTER TABLE certificate_upload_audit
ADD CONSTRAINT certificate_upload_audit_certificate_ref_id_fkey
FOREIGN KEY (certificate_ref_id) REFERENCES certificates(id) ON DELETE CASCADE;

CREATE INDEX idx_categories_main_category_ref_id ON categories(main_category_ref_id);
CREATE INDEX idx_assets_template_ref_id ON assets(template_ref_id);
CREATE INDEX idx_template_components_template_ref_id ON template_components(template_ref_id);
CREATE INDEX idx_template_components_category_ref_id ON template_components(category_ref_id);
CREATE INDEX idx_template_component_tests_template_component_ref_id ON template_component_tests(template_component_ref_id);
CREATE INDEX idx_template_component_tests_test_type_ref_id ON template_component_tests(test_type_ref_id);
CREATE INDEX idx_components_asset_ref_id ON components(asset_ref_id);
CREATE INDEX idx_components_category_ref_id ON components(category_ref_id);
CREATE INDEX idx_components_template_component_ref_id ON components(template_component_ref_id);
CREATE INDEX idx_certificates_component_ref_id ON certificates(component_ref_id);
CREATE INDEX idx_certificates_test_type_ref_id ON certificates(test_type_ref_id);
CREATE INDEX idx_certificates_template_component_test_ref_id ON certificates(template_component_test_ref_id);
CREATE INDEX idx_scheduled_tasks_certificate_ref_id ON scheduled_tasks(certificate_ref_id);
CREATE INDEX idx_certificate_upload_audit_certificate_ref_id ON certificate_upload_audit(certificate_ref_id);

CREATE OR REPLACE FUNCTION sync_component_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.asset_uuid IS NULL THEN
        SELECT uuid INTO NEW.asset_uuid
        FROM assets
        WHERE asset_id = NEW.asset_id;
    END IF;

    IF NEW.category_uuid IS NULL THEN
        SELECT uuid INTO NEW.category_uuid
        FROM categories
        WHERE category_id = NEW.category_id;
    END IF;

    IF NEW.template_component_ref_id IS NULL THEN
        NEW.template_component_uuid := NULL;
    ELSIF NEW.template_component_uuid IS NULL THEN
        SELECT uuid INTO NEW.template_component_uuid
        FROM template_components
        WHERE id = NEW.template_component_ref_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_certificate_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.component_uuid IS NULL THEN
        SELECT uuid INTO NEW.component_uuid
        FROM components
        WHERE component_id = NEW.component_id;
    END IF;

    IF NEW.test_uuid IS NULL THEN
        SELECT uuid INTO NEW.test_uuid
        FROM test_types
        WHERE test_id = NEW.test_id;
    END IF;

    IF NEW.template_component_test_ref_id IS NULL THEN
        NEW.template_component_test_uuid := NULL;
    ELSIF NEW.template_component_test_uuid IS NULL THEN
        SELECT uuid INTO NEW.template_component_test_uuid
        FROM template_component_tests
        WHERE id = NEW.template_component_test_ref_id;
    END IF;

    RETURN NEW;
END;
$$;

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
