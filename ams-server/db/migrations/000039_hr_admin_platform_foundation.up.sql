CREATE SEQUENCE IF NOT EXISTS product_access_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS hr_admin_person_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS hr_admin_vehicle_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS hr_admin_company_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS compliance_record_type_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS compliance_record_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS compliance_record_version_display_id_seq;

CREATE TABLE product_access (
    access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('product_access_display_id_seq'),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    product_key TEXT NOT NULL CHECK (product_key IN ('AMS', 'HR_ADMIN')),
    product_role TEXT NOT NULL CHECK (product_role IN ('ADMIN', 'USER', 'VIEWER', 'CLIENT')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_key),
    CHECK (product_key <> 'HR_ADMIN' OR product_role <> 'CLIENT')
);

CREATE INDEX idx_product_access_user_id ON product_access(user_id);
CREATE INDEX idx_product_access_product_key ON product_access(product_key);

CREATE TABLE product_notification_configurations (
    product_key TEXT PRIMARY KEY CHECK (product_key IN ('AMS', 'HR_ADMIN')),
    email_recipients TEXT NOT NULL DEFAULT '',
    clickup_list_id TEXT NOT NULL DEFAULT '',
    clickup_assignee_ids TEXT NOT NULL DEFAULT '',
    updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hr_admin_persons (
    person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('hr_admin_person_display_id_seq'),
    person_code TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    role_title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    archive_reason TEXT NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_hr_admin_persons_person_code
ON hr_admin_persons(person_code)
WHERE person_code <> '';

CREATE TABLE hr_admin_vehicles (
    vehicle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('hr_admin_vehicle_display_id_seq'),
    plate_number TEXT NOT NULL,
    make TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    vehicle_year INTEGER,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    archive_reason TEXT NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plate_number)
);

CREATE TABLE hr_admin_companies (
    company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('hr_admin_company_display_id_seq'),
    company_code TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL,
    company_kind TEXT NOT NULL DEFAULT 'LEGAL_ENTITY' CHECK (company_kind IN ('LEGAL_ENTITY', 'OFFICE', 'STAFF_HOUSING', 'WAREHOUSE', 'YARD', 'OTHER')),
    location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    archive_reason TEXT NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_hr_admin_companies_company_code
ON hr_admin_companies(company_code)
WHERE company_code <> '';

CREATE TABLE compliance_record_types (
    record_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('compliance_record_type_display_id_seq'),
    subject_type TEXT NOT NULL CHECK (subject_type IN ('PERSON', 'VEHICLE', 'COMPANY')),
    type_name TEXT NOT NULL,
    renewal_behavior TEXT NOT NULL CHECK (renewal_behavior IN ('RENEWABLE', 'ONE_TIME')),
    default_validity_months INTEGER,
    reminder_policy_days INTEGER[] NOT NULL DEFAULT ARRAY[30, 7, 1],
    requires_document BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subject_type, type_name),
    CHECK (
        (renewal_behavior = 'RENEWABLE' AND default_validity_months IS NULL OR default_validity_months > 0)
        OR
        (renewal_behavior = 'ONE_TIME' AND default_validity_months IS NULL)
    )
);

CREATE TABLE compliance_records (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('compliance_record_display_id_seq'),
    subject_type TEXT NOT NULL CHECK (subject_type IN ('PERSON', 'VEHICLE', 'COMPANY')),
    subject_id UUID NOT NULL,
    record_type_id UUID NOT NULL REFERENCES compliance_record_types(record_type_id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    archive_reason TEXT NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_active_compliance_records_subject_type
ON compliance_records(subject_type, subject_id, record_type_id)
WHERE status = 'ACTIVE';

CREATE INDEX idx_compliance_records_subject ON compliance_records(subject_type, subject_id);
CREATE INDEX idx_compliance_records_record_type_id ON compliance_records(record_type_id);

CREATE TABLE compliance_record_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('compliance_record_version_display_id_seq'),
    record_id UUID NOT NULL REFERENCES compliance_records(record_id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    issue_date TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    document_file TEXT NOT NULL DEFAULT '',
    issuing_authority TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    superseded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (record_id, version_number)
);

CREATE UNIQUE INDEX uq_current_compliance_record_version
ON compliance_record_versions(record_id)
WHERE is_current;

CREATE INDEX idx_compliance_record_versions_record_id ON compliance_record_versions(record_id);
CREATE INDEX idx_compliance_record_versions_expiry_date ON compliance_record_versions(expiry_date);
