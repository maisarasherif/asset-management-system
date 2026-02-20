CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT UNIQUE NOT NULL,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    token       TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    category_id      TEXT NOT NULL REFERENCES categories(category_id),
    photo            TEXT NOT NULL DEFAULT '',
    datasheet        TEXT NOT NULL DEFAULT '',
    description      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
    location         TEXT NOT NULL DEFAULT '',
    assigned_project TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE components (
    id              SERIAL PRIMARY KEY,
    component_id    TEXT UNIQUE NOT NULL,
    asset_id        TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
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
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_components_asset_id ON components(asset_id);
CREATE INDEX idx_certificates_component_id ON certificates(component_id);
CREATE INDEX idx_certificates_expiry_date ON certificates(expiry_date);