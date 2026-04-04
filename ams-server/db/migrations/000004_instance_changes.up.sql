-- name: 000004_instance_changes.up.sql

-- assets get an optional template reference
ALTER TABLE assets
    ADD COLUMN template_id TEXT REFERENCES asset_templates(template_id) ON DELETE SET NULL;

-- components get an optional back-reference to their template origin
ALTER TABLE components
    ADD COLUMN template_component_id TEXT REFERENCES template_components(template_component_id) ON DELETE SET NULL;

-- certificates get PENDING status and nullable dates for empty slots
ALTER TABLE certificates
    ALTER COLUMN issue_date DROP NOT NULL,
    ALTER COLUMN expiry_date DROP NOT NULL,
    DROP CONSTRAINT certificates_status_check,
    ADD CONSTRAINT certificates_status_check CHECK (status IN ('VALID', 'EXPIRED', 'EXPIRING_SOON', 'PENDING'));

-- back-reference to template test that created this cert slot
ALTER TABLE certificates
    ADD COLUMN template_component_test_id TEXT REFERENCES template_component_tests(template_component_test_id) ON DELETE SET NULL;

CREATE INDEX idx_assets_template_id ON assets(template_id);
CREATE INDEX idx_components_template_component_id ON components(template_component_id);
CREATE INDEX idx_certificates_template_component_test_id ON certificates(template_component_test_id);