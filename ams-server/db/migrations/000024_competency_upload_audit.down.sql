DROP INDEX IF EXISTS idx_certificate_upload_audit_competent_person_id;
DROP INDEX IF EXISTS idx_competent_persons_active;
DROP INDEX IF EXISTS idx_competent_persons_category_id;
DROP INDEX IF EXISTS idx_competency_categories_active;

ALTER TABLE certificate_upload_audit
DROP COLUMN IF EXISTS competent_person_id;

DROP TABLE IF EXISTS competent_persons;
DROP TABLE IF EXISTS competency_categories;
