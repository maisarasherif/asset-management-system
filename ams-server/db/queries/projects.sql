-- name: GetAllProjects :many
SELECT
    project_id,
    project_name,
    description,
    status,
    created_at,
    updated_at
FROM projects
ORDER BY project_name ASC;

-- name: GetProjectByID :one
SELECT
    project_id,
    project_name,
    description,
    status,
    created_at,
    updated_at
FROM projects
WHERE project_id = $1
LIMIT 1;

-- name: GetProjectByName :one
SELECT
    project_id,
    project_name,
    description,
    status,
    created_at,
    updated_at
FROM projects
WHERE LOWER(TRIM(project_name)) = LOWER(TRIM(sqlc.arg(project_name)))
LIMIT 1;

-- name: CreateProject :one
INSERT INTO projects (
    project_name,
    description,
    status,
    created_at,
    updated_at
)
VALUES (
    sqlc.arg(project_name),
    sqlc.arg(description),
    sqlc.arg(status),
    NOW(),
    NOW()
)
RETURNING
    project_id,
    project_name,
    description,
    status,
    created_at,
    updated_at;

-- name: UpdateProject :execrows
UPDATE projects
SET project_name = sqlc.arg(project_name),
    description = sqlc.arg(description),
    status = sqlc.arg(status),
    updated_at = NOW()
WHERE project_id = sqlc.arg(project_id);

-- name: ListAllUserProjectAccess :many
SELECT
    upa.access_id,
    upa.user_id,
    COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email)::text AS user_name,
    u.email AS user_email,
    u.role AS user_role,
    u.status AS user_status,
    upa.project_id,
    p.project_name,
    p.status AS project_status,
    upa.status,
    upa.created_at,
    upa.updated_at
FROM user_project_access upa
JOIN users u ON u.user_id = upa.user_id
JOIN projects p ON p.project_id = upa.project_id
ORDER BY p.project_name ASC, user_name ASC;

-- name: ListUserProjectAccessByUser :many
SELECT
    upa.access_id,
    upa.user_id,
    upa.project_id,
    p.project_name,
    p.status AS project_status,
    upa.status,
    upa.created_at,
    upa.updated_at
FROM user_project_access upa
JOIN projects p ON p.project_id = upa.project_id
WHERE upa.user_id = $1
ORDER BY p.project_name ASC;

-- name: UpsertUserProjectAccess :one
INSERT INTO user_project_access (
    user_id,
    project_id,
    status,
    created_at,
    updated_at
)
VALUES (
    sqlc.arg(user_id),
    sqlc.arg(project_id),
    sqlc.arg(status),
    NOW(),
    NOW()
)
ON CONFLICT (user_id, project_id)
DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
RETURNING
    access_id,
    user_id,
    project_id,
    status,
    created_at,
    updated_at;

-- name: UpdateUserProjectAccessStatus :execrows
UPDATE user_project_access
SET status = sqlc.arg(status), updated_at = NOW()
WHERE access_id = sqlc.arg(access_id);

-- name: DeleteUserProjectAccess :execrows
DELETE FROM user_project_access
WHERE access_id = $1;

-- name: SearchProjects :many
SELECT
    project_id,
    project_name,
    description,
    status,
    created_at,
    updated_at
FROM projects
WHERE strpos(lower(concat_ws(' ', project_name, description)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_status)::text = '' OR status = sqlc.arg(filter_status))
ORDER BY project_name ASC, project_id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountSearchProjects :one
SELECT COUNT(*)
FROM projects
WHERE strpos(lower(concat_ws(' ', project_name, description)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_status)::text = '' OR status = sqlc.arg(filter_status));

-- name: SearchUserProjectAccess :many
SELECT
    upa.access_id,
    upa.user_id,
    COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email)::text AS user_name,
    u.email AS user_email,
    u.role AS user_role,
    u.status AS user_status,
    upa.project_id,
    p.project_name,
    p.status AS project_status,
    upa.status,
    upa.created_at,
    upa.updated_at
FROM user_project_access upa
JOIN users u ON u.user_id = upa.user_id
JOIN projects p ON p.project_id = upa.project_id
WHERE strpos(lower(concat_ws(' ', u.first_name, u.last_name, u.email, p.project_name)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::uuid = '00000000-0000-0000-0000-000000000000' OR upa.project_id = sqlc.arg(filter_project))
  AND (sqlc.arg(filter_user)::uuid = '00000000-0000-0000-0000-000000000000' OR upa.user_id = sqlc.arg(filter_user))
  AND (sqlc.arg(filter_status)::text = '' OR upa.status = sqlc.arg(filter_status))
ORDER BY p.project_name ASC, user_name ASC, upa.access_id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountSearchUserProjectAccess :one
SELECT COUNT(*)
FROM user_project_access upa
JOIN users u ON u.user_id = upa.user_id
JOIN projects p ON p.project_id = upa.project_id
WHERE strpos(lower(concat_ws(' ', u.first_name, u.last_name, u.email, p.project_name)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::uuid = '00000000-0000-0000-0000-000000000000' OR upa.project_id = sqlc.arg(filter_project))
  AND (sqlc.arg(filter_user)::uuid = '00000000-0000-0000-0000-000000000000' OR upa.user_id = sqlc.arg(filter_user))
  AND (sqlc.arg(filter_status)::text = '' OR upa.status = sqlc.arg(filter_status));
