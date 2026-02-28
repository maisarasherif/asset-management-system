-- name: GetAllTestTypes :many
SELECT * FROM test_types
ORDER BY test_name ASC;

-- name: GetTestTypeByID :one
SELECT * FROM test_types
WHERE test_id = $1
LIMIT 1;
