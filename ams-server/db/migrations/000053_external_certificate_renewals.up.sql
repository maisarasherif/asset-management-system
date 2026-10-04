ALTER TABLE certificate_issuances
    ADD COLUMN file_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/pdf';
ALTER TABLE certificate_issuances ADD CONSTRAINT external_issuance_document_metadata CHECK (
    source <> 'EXTERNAL' OR (signature_id IS NULL AND document_number IS NULL AND sequence IS NULL
        AND file_name <> '' AND document_size BETWEEN 1 AND 10485760
        AND content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'))
);
ALTER TABLE certificate_upload_audit ADD COLUMN issuance_id UUID REFERENCES certificate_issuances(issuance_id);
CREATE UNIQUE INDEX certificate_upload_issuance ON certificate_upload_audit(issuance_id) WHERE issuance_id IS NOT NULL;
CREATE FUNCTION protect_issuance_file_metadata() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.file_name, NEW.content_type) IS DISTINCT FROM (OLD.file_name, OLD.content_type) THEN
        RAISE EXCEPTION 'approved file metadata is immutable';
    END IF;
    IF OLD.source = 'EXTERNAL' AND (NEW.document_sha256, NEW.document_size)
        IS DISTINCT FROM (OLD.document_sha256, OLD.document_size) THEN
        RAISE EXCEPTION 'approved external document digest is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_issuance_file_metadata BEFORE UPDATE ON certificate_issuances
FOR EACH ROW EXECUTE FUNCTION protect_issuance_file_metadata();
