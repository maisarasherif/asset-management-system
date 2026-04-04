-- name: 000004_instance_changes.down.sql

DROP INDEX IF EXISTS idx_certificates_template_component_test_id;
DROP INDEX IF EXISTS idx_components_template_component_id;
DROP INDEX IF EXISTS idx_assets_template_id;

ALTER TABLE certificates
    DROP COLUMN template_component_test_id,
    DROP CONSTRAINT certificates_status_check,
    ADD CONSTRAINT certificates_status_check CHECK (status IN ('VALID', 'EXPIRED', 'EXPIRING_SOON')),
    ALTER COLUMN expiry_date SET NOT NULL,
    ALTER COLUMN issue_date SET NOT NULL;

ALTER TABLE components
    DROP COLUMN template_component_id;

ALTER TABLE assets
    DROP COLUMN template_id;