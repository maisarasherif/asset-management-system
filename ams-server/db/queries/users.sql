-- name: GetAllUsersPaginated :many
SELECT user_id, first_name, last_name, email, role, created_at, updated_at
FROM users
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: CountUsersByEmail :one
SELECT COUNT(*) FROM users WHERE email = $1;

-- name: CountUsersByEmailExcluding :one
SELECT COUNT(*) FROM users WHERE email = $1 AND user_id != $2;

-- name: CreateUser :one
INSERT INTO users (first_name, last_name, email, password, role, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1 LIMIT 1;

-- name: GetUserByID :one
SELECT user_id, first_name, last_name, email, role, created_at, updated_at
FROM users WHERE user_id = $1 LIMIT 1;

-- name: GetUserPasswordByID :one
SELECT password FROM users WHERE user_id = $1 LIMIT 1;

-- name: UpdateUser :execrows
UPDATE users
SET first_name = $1, last_name = $2, email = $3, role = $4, updated_at = NOW()
WHERE user_id = $5;

-- name: UpdateUserPassword :execrows
UPDATE users
SET password = $1, updated_at = NOW()
WHERE user_id = $2;

-- name: DeleteUser :execrows
DELETE FROM users WHERE user_id = $1;

-- name: UpdateUserTokens :exec
UPDATE users SET token = $1, refresh_token = $2, updated_at = NOW()
WHERE user_id = $3;
