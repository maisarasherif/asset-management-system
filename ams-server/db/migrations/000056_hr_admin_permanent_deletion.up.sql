CREATE TABLE hr_admin_deletion_audit (
    deletion_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_type text NOT NULL CHECK (item_type IN ('PERSON', 'VEHICLE', 'COMPANY', 'COMPLIANCE_RECORD')),
    item_id uuid NOT NULL,
    display_id text NOT NULL,
    deleted_by uuid NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    deleted_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (item_type, item_id)
);

CREATE TABLE hr_admin_document_uploads (
    object_key text PRIMARY KEY,
    purge_requested_at timestamptz,
    purged_at timestamptz
);

CREATE INDEX idx_compliance_record_versions_document
    ON compliance_record_versions (document_file) WHERE document_file <> '';
