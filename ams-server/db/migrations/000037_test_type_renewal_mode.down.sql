ALTER TABLE test_types
DROP CONSTRAINT IF EXISTS test_types_renewal_validity_check;

UPDATE test_types
SET validity_duration = 1
WHERE validity_duration IS NULL;

ALTER TABLE test_types
ALTER COLUMN validity_duration SET NOT NULL;

ALTER TABLE test_types
DROP COLUMN IF EXISTS requires_renewal;
