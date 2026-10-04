ALTER TABLE certificates ADD COLUMN renewal_version BIGINT NOT NULL DEFAULT 0;
CREATE FUNCTION advance_certificate_renewal_version() RETURNS TRIGGER AS $$
BEGIN
    NEW.renewal_version := OLD.renewal_version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER advance_certificate_renewal_version
BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION advance_certificate_renewal_version();

CREATE TABLE certificate_number_counters (
    component_id UUID NOT NULL,
    issue_date DATE NOT NULL,
    last_sequence BIGINT NOT NULL CHECK (last_sequence > 0),
    PRIMARY KEY (component_id, issue_date)
);
CREATE TABLE certificate_issuances (
    issuance_id UUID PRIMARY KEY,
    approval_id UUID NOT NULL UNIQUE,
    certificate_id UUID NOT NULL,
    certificate_ref UUID REFERENCES certificates(certificate_id) ON DELETE SET NULL,
    component_id UUID NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('GENERATED', 'EXTERNAL')),
    actor_id UUID NOT NULL,
    actor_ref UUID REFERENCES users(user_id) ON DELETE SET NULL,
    signature_id UUID REFERENCES certificate_signature_versions(signature_id),
    document_number TEXT UNIQUE,
    sequence BIGINT,
    issue_date DATE NOT NULL,
    expiry_date DATE,
    snapshot JSONB NOT NULL,
    base_version BIGINT NOT NULL,
    state TEXT NOT NULL DEFAULT 'APPROVED' CHECK (state IN ('APPROVED', 'PROCESSING', 'FAILED', 'COMPLETED', 'ABANDONED')),
    file_key TEXT NOT NULL UNIQUE,
    document_sha256 TEXT NOT NULL DEFAULT '',
    document_size BIGINT NOT NULL DEFAULT 0,
    attempt_id UUID,
    lease_until TIMESTAMPTZ,
    failure_code TEXT NOT NULL DEFAULT '',
    cleanup_state TEXT NOT NULL DEFAULT 'NONE' CHECK (cleanup_state IN ('NONE', 'PENDING', 'DELETED', 'FAILED')),
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((source = 'GENERATED' AND signature_id IS NOT NULL AND document_number IS NOT NULL AND sequence IS NOT NULL AND sequence > 0) OR source = 'EXTERNAL'),
    CHECK (expiry_date IS NULL OR expiry_date > issue_date),
    CHECK (document_sha256 = '' OR document_sha256 ~ '^[a-f0-9]{64}$'),
    CHECK (document_size >= 0 AND document_size <= 16777216),
    CHECK ((document_sha256 = '' AND document_size = 0) OR (document_sha256 <> '' AND document_size > 0)),
    CHECK (jsonb_typeof(snapshot) = 'object'),
    CHECK (base_version >= 0),
    CHECK (state <> 'COMPLETED' OR (completed_at IS NOT NULL AND document_size > 0 AND document_sha256 <> ''))
);
CREATE INDEX certificate_issuances_history ON certificate_issuances(certificate_id, approved_at DESC, issuance_id);
CREATE FUNCTION protect_certificate_issuance_content() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.issuance_id, NEW.approval_id, NEW.certificate_id, NEW.component_id, NEW.source,
        NEW.actor_id, NEW.signature_id, NEW.document_number, NEW.sequence, NEW.issue_date,
        NEW.expiry_date, NEW.snapshot, NEW.base_version, NEW.file_key, NEW.approved_at)
       IS DISTINCT FROM
       (OLD.issuance_id, OLD.approval_id, OLD.certificate_id, OLD.component_id, OLD.source,
        OLD.actor_id, OLD.signature_id, OLD.document_number, OLD.sequence, OLD.issue_date,
        OLD.expiry_date, OLD.snapshot, OLD.base_version, OLD.file_key, OLD.approved_at) THEN
        RAISE EXCEPTION 'approved issuance content is immutable';
    END IF;
    IF OLD.state IN ('COMPLETED', 'ABANDONED') AND
       (NEW.state, NEW.document_sha256, NEW.document_size, NEW.completed_at)
       IS DISTINCT FROM (OLD.state, OLD.document_sha256, OLD.document_size, OLD.completed_at) THEN
        RAISE EXCEPTION 'final issuance content is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_certificate_issuance_content BEFORE UPDATE ON certificate_issuances
FOR EACH ROW EXECUTE FUNCTION protect_certificate_issuance_content();
