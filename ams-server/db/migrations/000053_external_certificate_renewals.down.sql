DROP TRIGGER protect_issuance_file_metadata ON certificate_issuances;
DROP FUNCTION protect_issuance_file_metadata();
ALTER TABLE certificate_upload_audit DROP COLUMN issuance_id;
ALTER TABLE certificate_issuances DROP CONSTRAINT external_issuance_document_metadata;
ALTER TABLE certificate_issuances DROP COLUMN file_name, DROP COLUMN content_type;
