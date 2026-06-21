-- name: GetProductAccessForUser :many
SELECT
    access_id,
    display_id,
    user_id,
    product_key,
    product_role,
    status,
    created_at,
    updated_at
FROM product_access
WHERE user_id = $1
ORDER BY product_key ASC;

-- name: GetActiveProductAccessByUserAndProduct :one
SELECT
    access_id,
    display_id,
    user_id,
    product_key,
    product_role,
    status,
    created_at,
    updated_at
FROM product_access
WHERE user_id = sqlc.arg(user_id)
  AND product_key = sqlc.arg(product_key)
  AND status = 'ACTIVE'
LIMIT 1;

-- name: GetProductAccessPaginated :many
SELECT
    pa.access_id,
    pa.display_id,
    pa.user_id,
    u.display_id AS user_display_id,
    u.first_name,
    u.last_name,
    u.email,
    pa.product_key,
    pa.product_role,
    pa.status,
    pa.created_at,
    pa.updated_at
FROM product_access pa
JOIN users u ON u.user_id = pa.user_id
ORDER BY pa.updated_at DESC, pa.created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountProductAccess :one
SELECT COUNT(*) FROM product_access;

-- name: UpsertProductAccess :one
INSERT INTO product_access (
    display_id,
    user_id,
    product_key,
    product_role,
    status
)
VALUES (
    next_display_id('product_access_display_id_seq'),
    sqlc.arg(user_id),
    sqlc.arg(product_key),
    sqlc.arg(product_role),
    sqlc.arg(status)
)
ON CONFLICT (user_id, product_key)
DO UPDATE SET
    product_role = EXCLUDED.product_role,
    status = EXCLUDED.status,
    updated_at = NOW()
RETURNING
    access_id,
    display_id,
    user_id,
    product_key,
    product_role,
    status,
    created_at,
    updated_at;

-- name: DeleteProductAccess :execrows
DELETE FROM product_access
WHERE access_id = $1;

-- name: GetProductNotificationConfiguration :one
SELECT
    product_key,
    email_recipients,
    clickup_list_id,
    clickup_assignee_ids,
    updated_by,
    created_at,
    updated_at
FROM product_notification_configurations
WHERE product_key = $1
LIMIT 1;

-- name: UpsertProductNotificationConfiguration :one
INSERT INTO product_notification_configurations (
    product_key,
    email_recipients,
    clickup_list_id,
    clickup_assignee_ids,
    updated_by
)
VALUES (
    sqlc.arg(product_key),
    sqlc.arg(email_recipients),
    sqlc.arg(clickup_list_id),
    sqlc.arg(clickup_assignee_ids),
    sqlc.arg(updated_by)
)
ON CONFLICT (product_key)
DO UPDATE SET
    email_recipients = EXCLUDED.email_recipients,
    clickup_list_id = EXCLUDED.clickup_list_id,
    clickup_assignee_ids = EXCLUDED.clickup_assignee_ids,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
RETURNING
    product_key,
    email_recipients,
    clickup_list_id,
    clickup_assignee_ids,
    updated_by,
    created_at,
    updated_at;
