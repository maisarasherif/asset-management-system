ALTER TABLE asset_templates
ADD COLUMN current_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE test_types
ADD COLUMN id INTEGER;

CREATE SEQUENCE test_types_internal_id_seq START WITH 1 OWNED BY test_types.id;

ALTER TABLE test_types
ALTER COLUMN id SET DEFAULT nextval('test_types_internal_id_seq');

UPDATE test_types
SET id = nextval('test_types_internal_id_seq')
WHERE id IS NULL;

ALTER TABLE test_types
ALTER COLUMN id SET NOT NULL;

ALTER TABLE test_types
ADD CONSTRAINT test_types_id_unique UNIQUE (id);

ALTER TABLE categories
ADD COLUMN main_category_ref_id INTEGER;

ALTER TABLE assets
ADD COLUMN template_ref_id INTEGER,
ADD COLUMN template_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE template_components
ADD COLUMN template_ref_id INTEGER,
ADD COLUMN category_ref_id INTEGER,
ADD COLUMN position INTEGER;

ALTER TABLE template_component_tests
ADD COLUMN template_component_ref_id INTEGER,
ADD COLUMN test_type_ref_id INTEGER,
ADD COLUMN position INTEGER;

ALTER TABLE components
ADD COLUMN asset_ref_id INTEGER,
ADD COLUMN category_ref_id INTEGER,
ADD COLUMN template_version_component_ref_id INTEGER;

ALTER TABLE certificates
ADD COLUMN component_ref_id INTEGER,
ADD COLUMN test_type_ref_id INTEGER,
ADD COLUMN template_version_component_test_ref_id INTEGER;

ALTER TABLE scheduled_tasks
ADD COLUMN certificate_ref_id INTEGER;

ALTER TABLE certificate_upload_audit
ADD COLUMN certificate_ref_id INTEGER;

UPDATE categories c
SET main_category_ref_id = mc.id
FROM main_categories mc
WHERE c.main_category_id = mc.main_category_id;

UPDATE assets a
SET template_ref_id = at.id
FROM asset_templates at
WHERE a.template_id = at.template_id;

UPDATE template_components tc
SET
    template_ref_id = at.id,
    category_ref_id = c.id
FROM asset_templates at, categories c
WHERE tc.template_id = at.template_id
  AND tc.category_id = c.category_id;

WITH ordered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY template_ref_id
            ORDER BY created_at ASC, id ASC
        ) AS next_position
    FROM template_components
)
UPDATE template_components tc
SET position = ordered.next_position
FROM ordered
WHERE tc.id = ordered.id;

UPDATE template_component_tests tct
SET
    template_component_ref_id = tc.id,
    test_type_ref_id = tt.id
FROM template_components tc, test_types tt
WHERE tct.template_component_id = tc.template_component_id
  AND tct.test_id = tt.test_id;

WITH ordered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY template_component_ref_id
            ORDER BY created_at ASC, id ASC
        ) AS next_position
    FROM template_component_tests
)
UPDATE template_component_tests tct
SET position = ordered.next_position
FROM ordered
WHERE tct.id = ordered.id;

UPDATE components comp
SET
    asset_ref_id = a.id,
    category_ref_id = c.id
FROM assets a, categories c
WHERE comp.asset_id = a.asset_id
  AND comp.category_id = c.category_id;

UPDATE certificates cert
SET
    component_ref_id = comp.id,
    test_type_ref_id = tt.id
FROM components comp, test_types tt
WHERE cert.component_id = comp.component_id
  AND cert.test_id = tt.test_id;

UPDATE scheduled_tasks st
SET certificate_ref_id = cert.id
FROM certificates cert
WHERE st.certificate_id = cert.certificate_id;

UPDATE certificate_upload_audit cua
SET certificate_ref_id = cert.id
FROM certificates cert
WHERE cua.certificate_id = cert.certificate_id;

ALTER TABLE categories
ALTER COLUMN main_category_ref_id SET NOT NULL;

ALTER TABLE template_components
ALTER COLUMN template_ref_id SET NOT NULL,
ALTER COLUMN category_ref_id SET NOT NULL,
ALTER COLUMN position SET NOT NULL;

ALTER TABLE template_component_tests
ALTER COLUMN template_component_ref_id SET NOT NULL,
ALTER COLUMN test_type_ref_id SET NOT NULL,
ALTER COLUMN position SET NOT NULL;

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

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_main_category_id_fkey;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_template_id_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_template_id_fkey;
ALTER TABLE template_components DROP CONSTRAINT IF EXISTS template_components_category_id_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_template_component_id_fkey;
ALTER TABLE template_component_tests DROP CONSTRAINT IF EXISTS template_component_tests_test_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_asset_id_fkey;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_category_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_component_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_test_id_fkey;
ALTER TABLE scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_certificate_id_fkey;
ALTER TABLE certificate_upload_audit DROP CONSTRAINT IF EXISTS certificate_upload_audit_certificate_id_fkey;

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
FOREIGN KEY (category_ref_id) REFERENCES categories(id) ON DELETE RESTRICT;

ALTER TABLE certificates
ADD CONSTRAINT certificates_component_ref_id_fkey
FOREIGN KEY (component_ref_id) REFERENCES components(id) ON DELETE CASCADE,
ADD CONSTRAINT certificates_test_type_ref_id_fkey
FOREIGN KEY (test_type_ref_id) REFERENCES test_types(id) ON DELETE RESTRICT;

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_certificate_ref_id_fkey
FOREIGN KEY (certificate_ref_id) REFERENCES certificates(id) ON DELETE CASCADE;

ALTER TABLE certificate_upload_audit
ADD CONSTRAINT certificate_upload_audit_certificate_ref_id_fkey
FOREIGN KEY (certificate_ref_id) REFERENCES certificates(id) ON DELETE CASCADE;

CREATE TABLE asset_template_versions (
    id              SERIAL PRIMARY KEY,
    template_ref_id INTEGER NOT NULL REFERENCES asset_templates(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (template_ref_id, version)
);

CREATE TABLE template_version_components (
    id                               SERIAL PRIMARY KEY,
    template_version_ref_id          INTEGER NOT NULL REFERENCES asset_template_versions(id) ON DELETE CASCADE,
    source_template_component_ref_id INTEGER REFERENCES template_components(id) ON DELETE SET NULL,
    position                         INTEGER NOT NULL,
    category_ref_id                  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    category_id                      TEXT NOT NULL,
    name                             TEXT NOT NULL,
    description                      TEXT NOT NULL DEFAULT '',
    serial_number                    TEXT NOT NULL DEFAULT '',
    manufacturer                     TEXT NOT NULL DEFAULT '',
    location                         TEXT NOT NULL DEFAULT '',
    assigned_project                 TEXT NOT NULL DEFAULT '',
    equipment_type                   TEXT NOT NULL DEFAULT '',
    structure                        TEXT NOT NULL DEFAULT '',
    model                            TEXT NOT NULL DEFAULT '',
    class                            TEXT NOT NULL DEFAULT '',
    class_code                       TEXT NOT NULL DEFAULT '',
    safety_critical                  TEXT NOT NULL CHECK (safety_critical IN ('YES', 'NO')),
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_version_component_tests (
    id                                   SERIAL PRIMARY KEY,
    template_version_component_ref_id    INTEGER NOT NULL REFERENCES template_version_components(id) ON DELETE CASCADE,
    source_template_component_test_ref_id INTEGER REFERENCES template_component_tests(id) ON DELETE SET NULL,
    position                             INTEGER NOT NULL,
    test_type_ref_id                     INTEGER NOT NULL REFERENCES test_types(id) ON DELETE RESTRICT,
    test_id                              TEXT NOT NULL,
    test_name                            TEXT NOT NULL,
    validity_duration                    INTEGER NOT NULL,
    description                          TEXT NOT NULL DEFAULT '',
    created_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE components
ADD CONSTRAINT components_template_version_component_ref_id_fkey
FOREIGN KEY (template_version_component_ref_id) REFERENCES template_version_components(id) ON DELETE SET NULL;

ALTER TABLE certificates
ADD CONSTRAINT certificates_template_version_component_test_ref_id_fkey
FOREIGN KEY (template_version_component_test_ref_id) REFERENCES template_version_component_tests(id) ON DELETE SET NULL;

CREATE INDEX idx_categories_main_category_ref_id ON categories(main_category_ref_id);
CREATE INDEX idx_assets_template_ref_id ON assets(template_ref_id);
CREATE INDEX idx_template_components_template_ref_id ON template_components(template_ref_id);
CREATE INDEX idx_template_components_category_ref_id ON template_components(category_ref_id);
CREATE UNIQUE INDEX idx_template_components_template_ref_position ON template_components(template_ref_id, position);
CREATE INDEX idx_template_component_tests_template_component_ref_id ON template_component_tests(template_component_ref_id);
CREATE INDEX idx_template_component_tests_test_type_ref_id ON template_component_tests(test_type_ref_id);
CREATE UNIQUE INDEX idx_template_component_tests_component_ref_position ON template_component_tests(template_component_ref_id, position);
CREATE INDEX idx_components_asset_ref_id ON components(asset_ref_id);
CREATE INDEX idx_components_category_ref_id ON components(category_ref_id);
CREATE INDEX idx_components_template_version_component_ref_id ON components(template_version_component_ref_id);
CREATE UNIQUE INDEX idx_components_asset_snapshot_component_unique
ON components(asset_ref_id, template_version_component_ref_id)
WHERE template_version_component_ref_id IS NOT NULL;
CREATE INDEX idx_certificates_component_ref_id ON certificates(component_ref_id);
CREATE INDEX idx_certificates_test_type_ref_id ON certificates(test_type_ref_id);
CREATE INDEX idx_certificates_template_version_component_test_ref_id ON certificates(template_version_component_test_ref_id);
CREATE UNIQUE INDEX idx_certificates_component_snapshot_test_unique
ON certificates(component_ref_id, template_version_component_test_ref_id)
WHERE template_version_component_test_ref_id IS NOT NULL;
CREATE INDEX idx_scheduled_tasks_certificate_ref_id ON scheduled_tasks(certificate_ref_id);
CREATE INDEX idx_certificate_upload_audit_certificate_ref_id ON certificate_upload_audit(certificate_ref_id);
CREATE INDEX idx_asset_template_versions_template_ref_id ON asset_template_versions(template_ref_id, version DESC);
CREATE INDEX idx_template_version_components_version_ref_id ON template_version_components(template_version_ref_id, position);
CREATE INDEX idx_template_version_component_tests_version_component_ref_id ON template_version_component_tests(template_version_component_ref_id, position);

CREATE OR REPLACE FUNCTION snapshot_template_version_by_business_id(p_template_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_template_ref_id INTEGER;
    v_current_version INTEGER;
    v_next_version INTEGER;
    v_version_ref_id INTEGER;
BEGIN
    SELECT id, current_version
    INTO v_template_ref_id, v_current_version
    FROM asset_templates
    WHERE template_id = p_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template % not found', p_template_id;
    END IF;

    v_next_version := CASE
        WHEN v_current_version < 1 THEN 1
        ELSE v_current_version + 1
    END;

    INSERT INTO asset_template_versions (template_ref_id, version, created_at)
    VALUES (v_template_ref_id, v_next_version, NOW())
    RETURNING id INTO v_version_ref_id;

    WITH inserted_components AS (
        INSERT INTO template_version_components (
            template_version_ref_id,
            source_template_component_ref_id,
            position,
            category_ref_id,
            category_id,
            name,
            description,
            serial_number,
            manufacturer,
            location,
            assigned_project,
            equipment_type,
            structure,
            model,
            class,
            class_code,
            safety_critical,
            created_at
        )
        SELECT
            v_version_ref_id,
            tc.id,
            tc.position,
            tc.category_ref_id,
            tc.category_id,
            tc.name,
            tc.description,
            tc.serial_number,
            tc.manufacturer,
            tc.location,
            tc.assigned_project,
            tc.equipment_type,
            tc.structure,
            tc.model,
            tc.class,
            tc.class_code,
            tc.safety_critical,
            NOW()
        FROM template_components tc
        WHERE tc.template_ref_id = v_template_ref_id
        ORDER BY tc.position, tc.id
        RETURNING id, source_template_component_ref_id, position
    )
    INSERT INTO template_version_component_tests (
        template_version_component_ref_id,
        source_template_component_test_ref_id,
        position,
        test_type_ref_id,
        test_id,
        test_name,
        validity_duration,
        description,
        created_at
    )
    SELECT
        ic.id,
        tct.id,
        tct.position,
        tct.test_type_ref_id,
        tt.test_id,
        tt.test_name,
        tt.validity_duration,
        tt.description,
        NOW()
    FROM template_component_tests tct
    JOIN inserted_components ic
      ON ic.source_template_component_ref_id = tct.template_component_ref_id
    JOIN test_types tt
      ON tt.id = tct.test_type_ref_id
    ORDER BY ic.position, tct.position, tct.id;

    UPDATE asset_templates
    SET current_version = v_next_version,
        updated_at = NOW()
    WHERE id = v_template_ref_id;

    RETURN v_next_version;
END;
$$;

CREATE OR REPLACE FUNCTION spin_up_asset_from_template_version_by_business_id(
    p_asset_id TEXT,
    p_template_id TEXT,
    p_template_version INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_ref_id INTEGER;
    v_template_ref_id INTEGER;
    v_version_ref_id INTEGER;
    v_inserted_components INTEGER := 0;
BEGIN
    SELECT a.id, a.template_ref_id
    INTO v_asset_ref_id, v_template_ref_id
    FROM assets a
    WHERE a.asset_id = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'asset % not found', p_asset_id;
    END IF;

    IF v_template_ref_id IS NULL THEN
        RAISE EXCEPTION 'asset % is not linked to a template', p_asset_id;
    END IF;

    SELECT atv.id
    INTO v_version_ref_id
    FROM asset_template_versions atv
    JOIN asset_templates at
      ON at.id = atv.template_ref_id
    WHERE at.template_id = p_template_id
      AND atv.version = p_template_version
      AND atv.template_ref_id = v_template_ref_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template version % for template % not found', p_template_version, p_template_id;
    END IF;

    INSERT INTO components (
        asset_id,
        asset_ref_id,
        category_id,
        category_ref_id,
        template_version_component_ref_id,
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
        tvc.category_id,
        tvc.category_ref_id,
        tvc.id,
        tvc.name,
        tvc.serial_number,
        tvc.manufacturer,
        tvc.description,
        tvc.location,
        tvc.assigned_project,
        tvc.equipment_type,
        tvc.structure,
        tvc.model,
        tvc.class,
        tvc.class_code,
        tvc.safety_critical,
        NOW(),
        NOW()
    FROM template_version_components tvc
    CROSS JOIN assets a
    WHERE tvc.template_version_ref_id = v_version_ref_id
      AND a.id = v_asset_ref_id
    ORDER BY tvc.position, tvc.id;

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
        template_version_component_test_ref_id,
        created_at,
        updated_at
    )
    SELECT
        c.component_id,
        c.id,
        tvct.test_name,
        '',
        '',
        'PENDING',
        tvct.test_id,
        tvct.test_type_ref_id,
        '',
        '',
        '',
        tvct.id,
        NOW(),
        NOW()
    FROM template_version_component_tests tvct
    JOIN template_version_components tvc
      ON tvc.id = tvct.template_version_component_ref_id
    JOIN components c
      ON c.template_version_component_ref_id = tvc.id
     AND c.asset_ref_id = v_asset_ref_id
    WHERE tvc.template_version_ref_id = v_version_ref_id
    ORDER BY tvc.position, tvct.position, tvct.id;

    RETURN v_inserted_components;
END;
$$;

UPDATE asset_templates
SET current_version = 0;

SELECT snapshot_template_version_by_business_id(template_id)
FROM asset_templates
ORDER BY id;

UPDATE assets a
SET template_version = at.current_version
FROM asset_templates at
WHERE a.template_ref_id = at.id
  AND a.template_ref_id IS NOT NULL;
