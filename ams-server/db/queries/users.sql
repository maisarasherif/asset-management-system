-- name: GetAllUsersPaginated :many
SELECT
    user_id,
    display_id,
    first_name,
    last_name,
    email,
    role,
    status,
    created_at,
    updated_at
FROM users
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: CountUsersByEmail :one
SELECT COUNT(*) FROM users WHERE email = $1;

-- name: CountUsersByEmailExcluding :one
SELECT COUNT(*) FROM users WHERE email = $1 AND user_id != sqlc.arg(user_id);

-- name: CreateUser :one
INSERT INTO users (display_id, first_name, last_name, email, password, role, status, created_at, updated_at)
VALUES (next_display_id('user_display_id_seq'), $1, $2, $3, $4, $5, sqlc.arg(status), NOW(), NOW())
RETURNING
    user_id,
    display_id,
    first_name,
    last_name,
    email,
    password,
    role,
    status,
    token,
    refresh_token,
    created_at,
    updated_at;

-- name: GetUserByEmail :one
SELECT
    user_id,
    display_id,
    first_name,
    last_name,
    email,
    password,
    role,
    status,
    token,
    refresh_token,
    created_at,
    updated_at
FROM users
WHERE email = $1
LIMIT 1;

-- name: GetUserByID :one
SELECT
    user_id,
    display_id,
    first_name,
    last_name,
    email,
    role,
    status,
    created_at,
    updated_at
FROM users
WHERE user_id = $1
LIMIT 1;

-- name: GetUserPasswordByID :one
SELECT password FROM users WHERE user_id = $1 LIMIT 1;

-- name: GetUserStatusByID :one
SELECT status FROM users WHERE user_id = $1 LIMIT 1;

-- name: UpdateUser :execrows
UPDATE users
SET first_name = $1, last_name = $2, email = $3, role = $4, status = sqlc.arg(status), updated_at = NOW()
WHERE user_id = sqlc.arg(user_id);

-- name: UpdateUserRoleByEmail :execrows
UPDATE users
SET role = $2, status = 'ACTIVE', updated_at = NOW()
WHERE email = $1;

-- name: UpdateUserPassword :execrows
UPDATE users
SET password = $1, updated_at = NOW()
WHERE user_id = sqlc.arg(user_id);

-- name: DeleteUser :execrows
DELETE FROM users WHERE user_id = sqlc.arg(user_id);

-- name: UpdateUserTokens :exec
UPDATE users SET token = $1, refresh_token = $2, updated_at = NOW()
WHERE user_id = sqlc.arg(user_id);

-- name: CreateUserManagementAuditLog :one
INSERT INTO user_management_audit_logs (
    actor_user_id,
    actor_email,
    action,
    target_user_id,
    target_email,
    target_role_before,
    target_role_after,
    details,
    ip_address
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING
    audit_id,
    actor_user_id,
    actor_email,
    action,
    target_user_id,
    target_email,
    target_role_before,
    target_role_after,
    details,
    ip_address,
    created_at;

-- name: GetUserManagementAuditLogsPaginated :many
SELECT
    audit_id,
    actor_user_id,
    actor_email,
    action,
    target_user_id,
    target_email,
    target_role_before,
    target_role_after,
    details,
    ip_address,
    created_at
FROM user_management_audit_logs
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountUserManagementAuditLogs :one
SELECT COUNT(*) FROM user_management_audit_logs;
