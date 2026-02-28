DROP INDEX IF EXISTS idx_certificates_test_id;

ALTER TABLE certificates
DROP CONSTRAINT IF EXISTS fk_certificates_test_id;

ALTER TABLE certificates
DROP COLUMN IF EXISTS maintenance_notes,
DROP COLUMN IF EXISTS imca_d018,
DROP COLUMN IF EXISTS imca_ref,
DROP COLUMN IF EXISTS test_id;

DROP TABLE IF EXISTS test_types;
