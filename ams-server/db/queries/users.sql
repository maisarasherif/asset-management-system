-- name: CreateUser :one
INSERT INTO users (user_id, first_name, last_name, email, password, role, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1 LIMIT 1;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: CountUsersByEmail :one
SELECT COUNT(*) FROM users WHERE email = $1;

-- name: UpdateUserTokens :exec
UPDATE users SET token = $1, refresh_token = $2, updated_at = NOW()
WHERE user_id = $3;