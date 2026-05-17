CREATE TABLE competency_categories (
    competency_category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_code          TEXT UNIQUE NOT NULL,
    category_name          TEXT NOT NULL,
    description            TEXT NOT NULL DEFAULT '',
    active                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE competent_persons (
    competent_person_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name              TEXT NOT NULL,
    person_type            TEXT NOT NULL CHECK (person_type IN ('Internal', 'External')),
    organization           TEXT NOT NULL DEFAULT '',
    competency_category_id UUID NOT NULL REFERENCES competency_categories(competency_category_id) ON DELETE RESTRICT,
    active                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE certificate_upload_audit
ADD COLUMN competent_person_id UUID REFERENCES competent_persons(competent_person_id) ON DELETE RESTRICT;

CREATE INDEX idx_competency_categories_active ON competency_categories(active);
CREATE INDEX idx_competent_persons_category_id ON competent_persons(competency_category_id);
CREATE INDEX idx_competent_persons_active ON competent_persons(active);
CREATE INDEX idx_certificate_upload_audit_competent_person_id ON certificate_upload_audit(competent_person_id);

INSERT INTO competency_categories (category_code, category_name, description)
VALUES
    ('CATEGORY_1', 'Category 1', 'Diving Supervisor, Life Support Supervisor'),
    ('CATEGORY_2', 'Category 2', 'Technician'),
    ('CATEGORY_3', 'Category 3', 'Classification Society, Insurance Company Surveyor, Certified Chief Engineer, In-House Chartered Engineer'),
    ('CATEGORY_4', 'Category 4', 'Manufacturer, Supplier, specialized third-party company');
