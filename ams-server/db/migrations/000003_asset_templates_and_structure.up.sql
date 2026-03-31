CREATE TABLE asset_templates (
    id          SERIAL PRIMARY KEY,
    template_id TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_asset_templates_name_active
    ON asset_templates(name)
    WHERE is_deleted = FALSE;

CREATE TABLE asset_template_categories (
    id                        SERIAL PRIMARY KEY,
    template_category_id      TEXT UNIQUE NOT NULL,
    template_id               TEXT NOT NULL REFERENCES asset_templates(template_id) ON DELETE CASCADE,
    category_id               TEXT NOT NULL REFERENCES categories(category_id),
    sort_order                INTEGER NOT NULL DEFAULT 0,
    is_archived               BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_asset_template_categories_active_unique
    ON asset_template_categories(template_id, category_id)
    WHERE is_archived = FALSE;

CREATE TABLE asset_template_components (
    id                         SERIAL PRIMARY KEY,
    template_component_id      TEXT UNIQUE NOT NULL,
    template_category_id       TEXT NOT NULL REFERENCES asset_template_categories(template_category_id) ON DELETE CASCADE,
    name                       TEXT NOT NULL,
    serial_number              TEXT NOT NULL DEFAULT '',
    manufacturer               TEXT NOT NULL DEFAULT '',
    description                TEXT NOT NULL DEFAULT '',
    equipment_type             TEXT NOT NULL DEFAULT '',
    structure                  TEXT NOT NULL DEFAULT '',
    model                      TEXT NOT NULL DEFAULT '',
    class                      TEXT NOT NULL DEFAULT '',
    class_code                 TEXT NOT NULL DEFAULT '',
    safety_critical            TEXT NOT NULL CHECK (safety_critical IN ('YES', 'NO')),
    sort_order                 INTEGER NOT NULL DEFAULT 0,
    is_archived                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE asset_template_test_requirements (
    id                         SERIAL PRIMARY KEY,
    template_requirement_id    TEXT UNIQUE NOT NULL,
    template_component_id      TEXT NOT NULL REFERENCES asset_template_components(template_component_id) ON DELETE CASCADE,
    test_id                    TEXT NOT NULL REFERENCES test_types(test_id),
    label                      TEXT NOT NULL,
    sort_order                 INTEGER NOT NULL DEFAULT 0,
    is_archived                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_asset_template_requirements_active_label
    ON asset_template_test_requirements(template_component_id, label)
    WHERE is_archived = FALSE;

ALTER TABLE assets
    ADD COLUMN template_id TEXT NOT NULL DEFAULT '';

CREATE TABLE asset_categories (
    id                          SERIAL PRIMARY KEY,
    asset_category_id           TEXT UNIQUE NOT NULL,
    asset_id                    TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    category_id                 TEXT NOT NULL REFERENCES categories(category_id),
    source_template_category_id TEXT NOT NULL DEFAULT '',
    sort_order                  INTEGER NOT NULL DEFAULT 0,
    is_archived                 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_categories_asset_id ON asset_categories(asset_id);

ALTER TABLE components
    ADD COLUMN asset_category_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN source_template_component_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_components_asset_category_id ON components(asset_category_id);
CREATE INDEX idx_components_source_template_component_id ON components(source_template_component_id);

CREATE TABLE component_test_requirements (
    id                           SERIAL PRIMARY KEY,
    requirement_id               TEXT UNIQUE NOT NULL,
    component_id                 TEXT NOT NULL REFERENCES components(component_id) ON DELETE CASCADE,
    source_template_requirement_id TEXT NOT NULL DEFAULT '',
    test_id                      TEXT NOT NULL REFERENCES test_types(test_id),
    label                        TEXT NOT NULL,
    sort_order                   INTEGER NOT NULL DEFAULT 0,
    is_archived                  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_component_test_requirements_component_id ON component_test_requirements(component_id);
CREATE UNIQUE INDEX idx_component_test_requirements_active_label
    ON component_test_requirements(component_id, label)
    WHERE is_archived = FALSE;

ALTER TABLE certificates
    ADD COLUMN requirement_id TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_certificates_requirement_id ON certificates(requirement_id);
