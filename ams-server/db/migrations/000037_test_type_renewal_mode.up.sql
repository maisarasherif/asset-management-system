ALTER TABLE test_types
ADD COLUMN requires_renewal BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE test_types
ALTER COLUMN validity_duration DROP NOT NULL;

ALTER TABLE test_types
ADD CONSTRAINT test_types_renewal_validity_check CHECK (
    (requires_renewal = TRUE AND validity_duration IS NOT NULL AND validity_duration >= 1)
    OR
    (requires_renewal = FALSE AND validity_duration IS NULL)
);
