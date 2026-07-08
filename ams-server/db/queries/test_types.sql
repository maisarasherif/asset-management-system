-- name: GetAllTestTypes :many
SELECT
    test_id,
    display_id,
    test_name,
    validity_duration,
    requires_renewal,
    description
FROM test_types
ORDER BY test_name ASC;

-- name: GetTestTypeByID :one
SELECT
    test_id,
    display_id,
    test_name,
    validity_duration,
    requires_renewal,
    description
FROM test_types
WHERE test_id = $1
LIMIT 1;

-- name: GetExistingTestTypeIDs :many
SELECT test_id
FROM test_types
WHERE test_id = ANY($1::uuid[])
ORDER BY test_id ASC;

-- name: CreateTestType :one
INSERT INTO test_types (display_id, test_name, validity_duration, requires_renewal, description)
VALUES (allocate_display_id('test_types.display_id', 'test_types'::REGCLASS), $1, $2, $3, $4)
RETURNING
    test_id,
    display_id,
    test_name,
    validity_duration,
    requires_renewal,
    description;

-- name: UpdateTestType :execrows
UPDATE test_types
SET test_name = $1, validity_duration = $2, requires_renewal = $3, description = $4
WHERE test_id = sqlc.arg(test_id);

-- name: DeleteTestType :execrows
DELETE FROM test_types WHERE test_id = $1;
