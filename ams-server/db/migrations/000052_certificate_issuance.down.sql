DROP TABLE certificate_issuances;
DROP FUNCTION protect_certificate_issuance_content();
DROP TABLE certificate_number_counters;
DROP TRIGGER advance_certificate_renewal_version ON certificates;
DROP FUNCTION advance_certificate_renewal_version();
ALTER TABLE certificates DROP COLUMN renewal_version;
