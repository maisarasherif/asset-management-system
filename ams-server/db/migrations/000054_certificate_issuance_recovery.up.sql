ALTER TABLE certificate_issuances ADD COLUMN cleanup_failure_code TEXT NOT NULL DEFAULT '';
ALTER TABLE certificate_issuances ADD COLUMN cleanup_generation BIGINT NOT NULL DEFAULT 0 CHECK (cleanup_generation >= 0);
ALTER TABLE certificate_issuances ADD COLUMN abandoned_by UUID;
ALTER TABLE certificate_issuances ADD COLUMN abandoned_at TIMESTAMPTZ;
ALTER TABLE certificate_issuances ADD CONSTRAINT issuance_cleanup_only_abandoned
 CHECK ((state = 'ABANDONED' AND cleanup_state IN ('PENDING', 'FAILED', 'DELETED') AND abandoned_by IS NOT NULL AND abandoned_at IS NOT NULL)
 OR (state <> 'ABANDONED' AND cleanup_state = 'NONE' AND cleanup_failure_code = '' AND abandoned_by IS NULL AND abandoned_at IS NULL));

CREATE FUNCTION protect_certificate_abandonment() RETURNS TRIGGER AS $$
BEGIN
 IF OLD.state = 'ABANDONED' AND (NEW.abandoned_by, NEW.abandoned_at) IS DISTINCT FROM (OLD.abandoned_by, OLD.abandoned_at) THEN
  RAISE EXCEPTION 'abandonment audit is immutable';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_certificate_abandonment BEFORE UPDATE ON certificate_issuances
 FOR EACH ROW EXECUTE FUNCTION protect_certificate_abandonment();
