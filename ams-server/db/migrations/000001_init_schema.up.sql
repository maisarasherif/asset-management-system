CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    user_id       TEXT UNIQUE NOT NULL,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password      TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    token         TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
    id            SERIAL PRIMARY KEY,
    category_id   TEXT UNIQUE NOT NULL,
    category_name TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assets (
    id               SERIAL PRIMARY KEY,
    asset_id         TEXT UNIQUE NOT NULL,
    name             TEXT NOT NULL,
    photo            TEXT NOT NULL DEFAULT '',
    datasheet        TEXT NOT NULL DEFAULT '',
    description      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
    location         TEXT NOT NULL DEFAULT '',
    assigned_project TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE test_types (
    test_id            TEXT PRIMARY KEY,
    test_name          TEXT NOT NULL,
    validity_duration  INTEGER NOT NULL,
    description        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE components (
    id              SERIAL PRIMARY KEY,
    component_id    TEXT UNIQUE NOT NULL,
    asset_id        TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    category_id     TEXT NOT NULL REFERENCES categories(category_id),
    name            TEXT NOT NULL,
    serial_number   TEXT NOT NULL DEFAULT '',
    manufacturer    TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    equipment_type  TEXT NOT NULL DEFAULT '',
    structure       TEXT NOT NULL DEFAULT '',
    model           TEXT NOT NULL DEFAULT '',
    class           TEXT NOT NULL DEFAULT '',
    class_code      TEXT NOT NULL DEFAULT '',
    safety_critical TEXT NOT NULL CHECK (safety_critical IN ('YES', 'NO')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE certificates (
    id                SERIAL PRIMARY KEY,
    certificate_id    TEXT UNIQUE NOT NULL,
    component_id      TEXT NOT NULL REFERENCES components(component_id) ON DELETE CASCADE,
    certificate_name  TEXT NOT NULL,
    issue_date        TIMESTAMPTZ NOT NULL,
    expiry_date       TIMESTAMPTZ NOT NULL,
    certificate_file  TEXT NOT NULL DEFAULT '',
    issuing_authority TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL CHECK (status IN ('VALID', 'EXPIRED', 'EXPIRING_SOON')),
    test_id           TEXT NOT NULL REFERENCES test_types(test_id),
    imca_ref          TEXT NOT NULL DEFAULT '',
    imca_d018         TEXT NOT NULL DEFAULT '',
    maintenance_notes TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scheduled_tasks (
    id              SERIAL PRIMARY KEY,
    task_id         TEXT UNIQUE NOT NULL,
    certificate_id  TEXT NOT NULL REFERENCES certificates(certificate_id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('EMAIL', 'CLICKUP')),
    status          TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_components_asset_id ON components(asset_id);
CREATE INDEX idx_components_category_id ON components(category_id);
CREATE INDEX idx_certificates_component_id ON certificates(component_id);
CREATE INDEX idx_certificates_expiry_date ON certificates(expiry_date);
CREATE INDEX idx_certificates_test_id ON certificates(test_id);
CREATE INDEX idx_scheduled_tasks_certificate_id ON scheduled_tasks(certificate_id);
CREATE INDEX idx_scheduled_tasks_type ON scheduled_tasks(type);
CREATE INDEX idx_scheduled_tasks_sent_at ON scheduled_tasks(sent_at);
