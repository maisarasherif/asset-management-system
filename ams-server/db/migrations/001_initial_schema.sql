CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT UNIQUE NOT NULL,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    token       TEXT DEFAULT '',
    refresh_token TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
    id            SERIAL PRIMARY KEY,
    category_id   TEXT UNIQUE NOT NULL,
    category_name TEXT NOT NULL,
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assets (
    id               SERIAL PRIMARY KEY,
    asset_id         TEXT UNIQUE NOT NULL,
    name             TEXT NOT NULL,
    category_id      TEXT NOT NULL REFERENCES categories(category_id),
    photo            TEXT,
    datasheet        TEXT,
    description      TEXT,
    status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
    location         TEXT DEFAULT '',
    assigned_project TEXT DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE components (
    id              SERIAL PRIMARY KEY,
    component_id    TEXT UNIQUE NOT NULL,
    asset_id        TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    serial_number   TEXT,
    manufacturer    TEXT,
    description     TEXT,
    equipment_type  TEXT DEFAULT '',
    structure       TEXT DEFAULT '',
    model           TEXT DEFAULT '',
    class           TEXT DEFAULT '',
    class_code      TEXT DEFAULT '',
    safety_critical BOOLEAN DEFAULT FALSE,
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
    certificate_file  TEXT,
    issuing_authority TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('VALID', 'EXPIRED', 'EXPIRING_SOON')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_components_asset_id ON components(asset_id);
CREATE INDEX idx_certificates_component_id ON certificates(component_id);
CREATE INDEX idx_certificates_expiry_date ON certificates(expiry_date);