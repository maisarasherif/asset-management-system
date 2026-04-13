CREATE OR REPLACE FUNCTION sync_asset_template_uuid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.template_id IS NULL THEN
        NEW.template_uuid := NULL;
    ELSIF NEW.template_uuid IS NULL THEN
        SELECT uuid INTO NEW.template_uuid
        FROM asset_templates
        WHERE template_id = NEW.template_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_category_main_category_uuid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.main_category_id IS NULL THEN
        NEW.main_category_uuid := NULL;
    ELSIF NEW.main_category_uuid IS NULL THEN
        SELECT uuid INTO NEW.main_category_uuid
        FROM main_categories
        WHERE main_category_id = NEW.main_category_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_template_component_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.template_uuid IS NULL THEN
        SELECT uuid INTO NEW.template_uuid
        FROM asset_templates
        WHERE template_id = NEW.template_id;
    END IF;

    IF NEW.category_uuid IS NULL THEN
        SELECT uuid INTO NEW.category_uuid
        FROM categories
        WHERE category_id = NEW.category_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_template_component_test_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.template_component_uuid IS NULL THEN
        SELECT uuid INTO NEW.template_component_uuid
        FROM template_components
        WHERE template_component_id = NEW.template_component_id;
    END IF;

    IF NEW.test_uuid IS NULL THEN
        SELECT uuid INTO NEW.test_uuid
        FROM test_types
        WHERE test_id = NEW.test_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_component_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.asset_uuid IS NULL THEN
        SELECT uuid INTO NEW.asset_uuid
        FROM assets
        WHERE asset_id = NEW.asset_id;
    END IF;

    IF NEW.category_uuid IS NULL THEN
        SELECT uuid INTO NEW.category_uuid
        FROM categories
        WHERE category_id = NEW.category_id;
    END IF;

    IF NEW.template_component_ref_id IS NULL THEN
        NEW.template_component_uuid := NULL;
    ELSIF NEW.template_component_uuid IS NULL THEN
        SELECT uuid INTO NEW.template_component_uuid
        FROM template_components
        WHERE id = NEW.template_component_ref_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_certificate_shadow_uuids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.component_uuid IS NULL THEN
        SELECT uuid INTO NEW.component_uuid
        FROM components
        WHERE component_id = NEW.component_id;
    END IF;

    IF NEW.test_uuid IS NULL THEN
        SELECT uuid INTO NEW.test_uuid
        FROM test_types
        WHERE test_id = NEW.test_id;
    END IF;

    IF NEW.template_component_test_ref_id IS NULL THEN
        NEW.template_component_test_uuid := NULL;
    ELSIF NEW.template_component_test_uuid IS NULL THEN
        SELECT uuid INTO NEW.template_component_test_uuid
        FROM template_component_tests
        WHERE id = NEW.template_component_test_ref_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_scheduled_task_certificate_uuid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.certificate_uuid IS NULL THEN
        SELECT uuid INTO NEW.certificate_uuid
        FROM certificates
        WHERE certificate_id = NEW.certificate_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_certificate_upload_audit_certificate_uuid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.certificate_uuid IS NULL THEN
        SELECT uuid INTO NEW.certificate_uuid
        FROM certificates
        WHERE certificate_id = NEW.certificate_id;
    END IF;

    RETURN NEW;
END;
$$;

ALTER TABLE assets ADD COLUMN template_uuid UUID;

UPDATE assets a
SET template_uuid = at.uuid
FROM asset_templates at
WHERE a.template_id = at.template_id
  AND a.template_id IS NOT NULL;

ALTER TABLE assets
ADD CONSTRAINT assets_template_uuid_fkey
FOREIGN KEY (template_uuid) REFERENCES asset_templates(uuid) ON DELETE SET NULL;

CREATE INDEX idx_assets_template_uuid ON assets(template_uuid);

CREATE TRIGGER trg_assets_sync_template_uuid
BEFORE INSERT OR UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION sync_asset_template_uuid();

ALTER TABLE categories ADD COLUMN main_category_uuid UUID;

UPDATE categories c
SET main_category_uuid = mc.uuid
FROM main_categories mc
WHERE c.main_category_id = mc.main_category_id;

ALTER TABLE categories
ADD CONSTRAINT categories_main_category_uuid_fkey
FOREIGN KEY (main_category_uuid) REFERENCES main_categories(uuid) ON DELETE RESTRICT;

CREATE INDEX idx_categories_main_category_uuid ON categories(main_category_uuid);

CREATE TRIGGER trg_categories_sync_main_category_uuid
BEFORE INSERT OR UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION sync_category_main_category_uuid();

ALTER TABLE template_components
ADD COLUMN template_uuid UUID,
ADD COLUMN category_uuid UUID;

UPDATE template_components tc
SET template_uuid = at.uuid
FROM asset_templates at
WHERE tc.template_id = at.template_id;

UPDATE template_components tc
SET category_uuid = c.uuid
FROM categories c
WHERE tc.category_id = c.category_id;

ALTER TABLE template_components
ALTER COLUMN template_uuid SET NOT NULL,
ALTER COLUMN category_uuid SET NOT NULL;

ALTER TABLE template_components
ADD CONSTRAINT template_components_template_uuid_fkey
FOREIGN KEY (template_uuid) REFERENCES asset_templates(uuid) ON DELETE CASCADE,
ADD CONSTRAINT template_components_category_uuid_fkey
FOREIGN KEY (category_uuid) REFERENCES categories(uuid) ON DELETE RESTRICT;

CREATE INDEX idx_template_components_template_uuid ON template_components(template_uuid);
CREATE INDEX idx_template_components_category_uuid ON template_components(category_uuid);

CREATE TRIGGER trg_template_components_sync_shadow_uuids
BEFORE INSERT OR UPDATE ON template_components
FOR EACH ROW
EXECUTE FUNCTION sync_template_component_shadow_uuids();

ALTER TABLE template_component_tests
ADD COLUMN template_component_uuid UUID,
ADD COLUMN test_uuid UUID;

UPDATE template_component_tests tct
SET template_component_uuid = tc.uuid
FROM template_components tc
WHERE tct.template_component_id = tc.template_component_id;

UPDATE template_component_tests tct
SET test_uuid = tt.uuid
FROM test_types tt
WHERE tct.test_id = tt.test_id;

ALTER TABLE template_component_tests
ALTER COLUMN template_component_uuid SET NOT NULL,
ALTER COLUMN test_uuid SET NOT NULL;

ALTER TABLE template_component_tests
ADD CONSTRAINT template_component_tests_template_component_uuid_fkey
FOREIGN KEY (template_component_uuid) REFERENCES template_components(uuid) ON DELETE CASCADE,
ADD CONSTRAINT template_component_tests_test_uuid_fkey
FOREIGN KEY (test_uuid) REFERENCES test_types(uuid) ON DELETE RESTRICT;

CREATE INDEX idx_template_component_tests_template_component_uuid ON template_component_tests(template_component_uuid);
CREATE INDEX idx_template_component_tests_test_uuid ON template_component_tests(test_uuid);

CREATE TRIGGER trg_template_component_tests_sync_shadow_uuids
BEFORE INSERT OR UPDATE ON template_component_tests
FOR EACH ROW
EXECUTE FUNCTION sync_template_component_test_shadow_uuids();

ALTER TABLE components
ADD COLUMN asset_uuid UUID,
ADD COLUMN category_uuid UUID,
ADD COLUMN template_component_uuid UUID;

UPDATE components c
SET asset_uuid = a.uuid
FROM assets a
WHERE c.asset_id = a.asset_id;

UPDATE components c
SET category_uuid = cat.uuid
FROM categories cat
WHERE c.category_id = cat.category_id;

UPDATE components c
SET template_component_uuid = tc.uuid
FROM template_components tc
WHERE c.template_component_ref_id = tc.id;

ALTER TABLE components
ALTER COLUMN asset_uuid SET NOT NULL,
ALTER COLUMN category_uuid SET NOT NULL;

ALTER TABLE components
ADD CONSTRAINT components_asset_uuid_fkey
FOREIGN KEY (asset_uuid) REFERENCES assets(uuid) ON DELETE CASCADE,
ADD CONSTRAINT components_category_uuid_fkey
FOREIGN KEY (category_uuid) REFERENCES categories(uuid) ON DELETE RESTRICT,
ADD CONSTRAINT components_template_component_uuid_fkey
FOREIGN KEY (template_component_uuid) REFERENCES template_components(uuid) ON DELETE SET NULL;

CREATE INDEX idx_components_asset_uuid ON components(asset_uuid);
CREATE INDEX idx_components_category_uuid ON components(category_uuid);
CREATE INDEX idx_components_template_component_uuid ON components(template_component_uuid);

CREATE TRIGGER trg_components_sync_shadow_uuids
BEFORE INSERT OR UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION sync_component_shadow_uuids();

ALTER TABLE certificates
ADD COLUMN component_uuid UUID,
ADD COLUMN test_uuid UUID,
ADD COLUMN template_component_test_uuid UUID;

UPDATE certificates cert
SET component_uuid = c.uuid
FROM components c
WHERE cert.component_id = c.component_id;

UPDATE certificates cert
SET test_uuid = tt.uuid
FROM test_types tt
WHERE cert.test_id = tt.test_id;

UPDATE certificates cert
SET template_component_test_uuid = tct.uuid
FROM template_component_tests tct
WHERE cert.template_component_test_ref_id = tct.id;

ALTER TABLE certificates
ALTER COLUMN component_uuid SET NOT NULL,
ALTER COLUMN test_uuid SET NOT NULL;

ALTER TABLE certificates
ADD CONSTRAINT certificates_component_uuid_fkey
FOREIGN KEY (component_uuid) REFERENCES components(uuid) ON DELETE CASCADE,
ADD CONSTRAINT certificates_test_uuid_fkey
FOREIGN KEY (test_uuid) REFERENCES test_types(uuid) ON DELETE RESTRICT,
ADD CONSTRAINT certificates_template_component_test_uuid_fkey
FOREIGN KEY (template_component_test_uuid) REFERENCES template_component_tests(uuid) ON DELETE SET NULL;

CREATE INDEX idx_certificates_component_uuid ON certificates(component_uuid);
CREATE INDEX idx_certificates_test_uuid ON certificates(test_uuid);
CREATE INDEX idx_certificates_template_component_test_uuid ON certificates(template_component_test_uuid);

CREATE TRIGGER trg_certificates_sync_shadow_uuids
BEFORE INSERT OR UPDATE ON certificates
FOR EACH ROW
EXECUTE FUNCTION sync_certificate_shadow_uuids();

ALTER TABLE scheduled_tasks ADD COLUMN certificate_uuid UUID;

UPDATE scheduled_tasks st
SET certificate_uuid = cert.uuid
FROM certificates cert
WHERE st.certificate_id = cert.certificate_id;

ALTER TABLE scheduled_tasks
ALTER COLUMN certificate_uuid SET NOT NULL;

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_certificate_uuid_fkey
FOREIGN KEY (certificate_uuid) REFERENCES certificates(uuid) ON DELETE CASCADE;

CREATE INDEX idx_scheduled_tasks_certificate_uuid ON scheduled_tasks(certificate_uuid);

CREATE TRIGGER trg_scheduled_tasks_sync_certificate_uuid
BEFORE INSERT OR UPDATE ON scheduled_tasks
FOR EACH ROW
EXECUTE FUNCTION sync_scheduled_task_certificate_uuid();

ALTER TABLE certificate_upload_audit ADD COLUMN certificate_uuid UUID;

UPDATE certificate_upload_audit cua
SET certificate_uuid = cert.uuid
FROM certificates cert
WHERE cua.certificate_id = cert.certificate_id;

ALTER TABLE certificate_upload_audit
ALTER COLUMN certificate_uuid SET NOT NULL;

ALTER TABLE certificate_upload_audit
ADD CONSTRAINT certificate_upload_audit_certificate_uuid_fkey
FOREIGN KEY (certificate_uuid) REFERENCES certificates(uuid) ON DELETE CASCADE;

CREATE INDEX idx_certificate_upload_audit_certificate_uuid ON certificate_upload_audit(certificate_uuid);

CREATE TRIGGER trg_certificate_upload_audit_sync_certificate_uuid
BEFORE INSERT OR UPDATE ON certificate_upload_audit
FOR EACH ROW
EXECUTE FUNCTION sync_certificate_upload_audit_certificate_uuid();
