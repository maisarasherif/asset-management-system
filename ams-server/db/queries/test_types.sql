-- name: GetAllTestTypes :many
SELECT
    test_id,
    display_id,
    test_name,
    validity_duration,
    description
FROM test_types
ORDER BY test_name ASC;

-- name: GetTestTypeByID :one
SELECT
    test_id,
    display_id,
    test_name,
    validity_duration,
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
INSERT INTO test_types (display_id, test_name, validity_duration, description)
VALUES (next_display_id('test_type_display_id_seq'), $1, $2, $3)
RETURNING
    test_id,
    display_id,
    test_name,
    validity_duration,
    description;

-- name: UpdateTestType :execrows
UPDATE test_types
SET test_name = $1, validity_duration = $2, description = $3
WHERE test_id = sqlc.arg(test_id);

-- name: DeleteTestType :execrows
DELETE FROM test_types WHERE test_id = $1;
