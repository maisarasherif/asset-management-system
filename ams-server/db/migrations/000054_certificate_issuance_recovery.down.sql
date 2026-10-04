DROP TRIGGER IF EXISTS protect_certificate_abandonment ON certificate_issuances;
DROP FUNCTION IF EXISTS protect_certificate_abandonment();
ALTER TABLE certificate_issuances DROP CONSTRAINT issuance_cleanup_only_abandoned;
ALTER TABLE certificate_issuances DROP COLUMN cleanup_failure_code;
ALTER TABLE certificate_issuances DROP COLUMN cleanup_generation;
ALTER TABLE certificate_issuances DROP COLUMN abandoned_by;
ALTER TABLE certificate_issuances DROP COLUMN abandoned_at;
