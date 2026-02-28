-- name: GetAllTestTypes :many
SELECT * FROM test_types
ORDER BY test_name ASC;

-- name: GetTestTypeByID :one
SELECT * FROM test_types
WHERE test_id = $1
LIMIT 1;

-- name: CreateTestType :one
INSERT INTO test_types (test_id, test_name, validity_duration, description)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateTestType :execrows
UPDATE test_types
SET test_name = $1, validity_duration = $2, description = $3
WHERE test_id = $4;

-- name: DeleteTestType :execrows
DELETE FROM test_types WHERE test_id = $1;