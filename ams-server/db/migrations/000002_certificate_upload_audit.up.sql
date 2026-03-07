CREATE TABLE certificate_upload_audit (
    id              SERIAL PRIMARY KEY,
    certificate_id  TEXT NOT NULL REFERENCES certificates(certificate_id) ON DELETE CASCADE,
    file_key        TEXT NOT NULL,
    file_name       TEXT NOT NULL DEFAULT '',
    uploaded_by     TEXT NOT NULL DEFAULT '',
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_certificate_upload_audit_certificate_id ON certificate_upload_audit(certificate_id);
CREATE INDEX idx_certificate_upload_audit_uploaded_at ON certificate_upload_audit(uploaded_at DESC);
