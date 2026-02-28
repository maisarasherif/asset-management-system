CREATE TABLE test_types (
    test_id            TEXT PRIMARY KEY,
    test_name          TEXT NOT NULL,
    validity_duration  INTEGER NOT NULL,
    description        TEXT NOT NULL DEFAULT ''
);

ALTER TABLE certificates
ADD COLUMN test_id TEXT,
ADD COLUMN imca_ref TEXT NOT NULL DEFAULT '',
ADD COLUMN imca_d018 TEXT NOT NULL DEFAULT '',
ADD COLUMN maintenance_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE certificates
ADD CONSTRAINT fk_certificates_test_id
FOREIGN KEY (test_id) REFERENCES test_types(test_id);

CREATE INDEX idx_certificates_test_id ON certificates(test_id);
