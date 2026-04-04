-- name: 000003_templates.up.sql

CREATE TABLE asset_templates (
    id              SERIAL PRIMARY KEY,
    template_id     TEXT UNIQUE NOT NULL,
    template_name   TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_components (
    id                      SERIAL PRIMARY KEY,
    template_component_id   TEXT UNIQUE NOT NULL,
    template_id             TEXT NOT NULL REFERENCES asset_templates(template_id) ON DELETE CASCADE,
    category_id             TEXT NOT NULL REFERENCES categories(category_id),
    name                    TEXT NOT NULL,
    description             TEXT NOT NULL DEFAULT '',
    serial_number           TEXT NOT NULL DEFAULT '',
    manufacturer            TEXT NOT NULL DEFAULT '',
    equipment_type          TEXT NOT NULL DEFAULT '',
    structure               TEXT NOT NULL DEFAULT '',
    model                   TEXT NOT NULL DEFAULT '',
    class                   TEXT NOT NULL DEFAULT '',
    class_code              TEXT NOT NULL DEFAULT '',
    safety_critical         TEXT NOT NULL CHECK (safety_critical IN ('YES', 'NO')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_component_tests (
    id                          SERIAL PRIMARY KEY,
    template_component_test_id  TEXT UNIQUE NOT NULL,
    template_component_id       TEXT NOT NULL REFERENCES template_components(template_component_id) ON DELETE CASCADE,
    test_id                     TEXT NOT NULL REFERENCES test_types(test_id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_components_template_id ON template_components(template_id);
CREATE INDEX idx_template_components_category_id ON template_components(category_id);
CREATE INDEX idx_template_component_tests_template_component_id ON template_component_tests(template_component_id);
CREATE INDEX idx_template_component_tests_test_id ON template_component_tests(test_id);