-- name: GetAllTestTypes :many
SELECT * FROM test_types
ORDER BY test_name ASC;

-- name: GetTestTypeByID :one
SELECT * FROM test_types
WHERE test_id = $1
LIMIT 1;

-- name: GetExistingTestTypeIDs :many
SELECT test_id
FROM test_types
WHERE test_id = ANY($1::text[])
ORDER BY test_id ASC;

-- name: CreateTestType :one
INSERT INTO test_types (test_name, validity_duration, description)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpdateTestType :execrows
UPDATE test_types
SET test_name = $1, validity_duration = $2, description = $3
WHERE test_id = $4;

-- name: DeleteTestType :execrows
DELETE FROM test_types WHERE test_id = $1;
