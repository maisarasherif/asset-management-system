DROP FUNCTION IF EXISTS spin_up_asset_from_template_by_business_id(TEXT, TEXT);

ALTER TABLE asset_templates
ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE assets
ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE asset_template_versions (
    id              SERIAL PRIMARY KEY,
    template_ref_id INTEGER NOT NULL REFERENCES asset_templates(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (template_ref_id, version)
);

CREATE TABLE template_version_components (
    id                                SERIAL PRIMARY KEY,
    template_version_ref_id           INTEGER NOT NULL REFERENCES asset_template_versions(id) ON DELETE CASCADE,
    source_template_component_ref_id  INTEGER REFERENCES template_components(id) ON DELETE SET NULL,
    position                          INTEGER NOT NULL,
    category_ref_id                   INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    category_id                       TEXT NOT NULL,
    name                              TEXT NOT NULL,
    description                       TEXT NOT NULL DEFAULT '',
    serial_number                     TEXT NOT NULL DEFAULT '',
    manufacturer                      TEXT NOT NULL DEFAULT '',
    location                          TEXT NOT NULL DEFAULT '',
    assigned_project                  TEXT NOT NULL DEFAULT '',
    equipment_type                    TEXT NOT NULL DEFAULT '',
    structure                         TEXT NOT NULL DEFAULT '',
    model                             TEXT NOT NULL DEFAULT '',
    class                             TEXT NOT NULL DEFAULT '',
    class_code                        TEXT NOT NULL DEFAULT '',
    safety_critical                   TEXT NOT NULL CHECK (safety_critical IN ('YES', 'NO')),
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_version_component_tests (
    id                                    SERIAL PRIMARY KEY,
    template_version_component_ref_id     INTEGER NOT NULL REFERENCES template_version_components(id) ON DELETE CASCADE,
    source_template_component_test_ref_id INTEGER REFERENCES template_component_tests(id) ON DELETE SET NULL,
    position                              INTEGER NOT NULL,
    test_type_ref_id                      INTEGER NOT NULL REFERENCES test_types(id) ON DELETE RESTRICT,
    test_id                               TEXT NOT NULL,
    test_name                             TEXT NOT NULL,
    validity_duration                     INTEGER NOT NULL,
    description                           TEXT NOT NULL DEFAULT '',
    created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_components_asset_template_component_unique;
DROP INDEX IF EXISTS idx_components_template_component_ref_id;
DROP INDEX IF EXISTS idx_certificates_component_template_test_unique;
DROP INDEX IF EXISTS idx_certificates_template_component_test_ref_id;

ALTER TABLE components DROP CONSTRAINT IF EXISTS components_template_component_ref_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_template_component_test_ref_id_fkey;

ALTER TABLE components
RENAME COLUMN template_component_ref_id TO template_version_component_ref_id;

ALTER TABLE certificates
RENAME COLUMN template_component_test_ref_id TO template_version_component_test_ref_id;

ALTER TABLE components
ADD CONSTRAINT components_template_version_component_ref_id_fkey
FOREIGN KEY (template_version_component_ref_id) REFERENCES template_version_components(id) ON DELETE SET NULL;

ALTER TABLE certificates
ADD CONSTRAINT certificates_template_version_component_test_ref_id_fkey
FOREIGN KEY (template_version_component_test_ref_id) REFERENCES template_version_component_tests(id) ON DELETE SET NULL;

CREATE INDEX idx_components_template_version_component_ref_id ON components(template_version_component_ref_id);
CREATE UNIQUE INDEX idx_components_asset_snapshot_component_unique
ON components(asset_ref_id, template_version_component_ref_id)
WHERE template_version_component_ref_id IS NOT NULL;

CREATE INDEX idx_certificates_template_version_component_test_ref_id ON certificates(template_version_component_test_ref_id);
CREATE UNIQUE INDEX idx_certificates_component_snapshot_test_unique
ON certificates(component_ref_id, template_version_component_test_ref_id)
WHERE template_version_component_test_ref_id IS NOT NULL;
