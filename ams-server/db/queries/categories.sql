-- name: GetAllCategoriesPaginated :many
SELECT
    c.category_id,
    c.display_id,
    c.main_category_id,
    c.sort_order,
    c.category_name,
    c.description,
    c.created_at,
    c.updated_at
FROM categories c
LEFT JOIN main_categories mc ON mc.main_category_id = c.main_category_id
ORDER BY
    CASE WHEN mc.sort_order IS NULL THEN 1 ELSE 0 END,
    mc.sort_order ASC NULLS LAST,
    c.sort_order ASC,
    c.created_at ASC
LIMIT $1 OFFSET $2;

-- name: GetCategoriesByMainCategoryIDPaginated :many
SELECT
    category_id,
    display_id,
    main_category_id,
    sort_order,
    category_name,
    description,
    created_at,
    updated_at
FROM categories
WHERE main_category_id = sqlc.arg(main_category_id)
ORDER BY sort_order ASC, created_at ASC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountCategoriesByMainCategoryIDPaginated :one
SELECT COUNT(*)
FROM categories
WHERE main_category_id = sqlc.arg(main_category_id);

-- name: CountCategories :one
SELECT COUNT(*) FROM categories;

-- name: GetCategoryByID :one
SELECT
    category_id,
    display_id,
    main_category_id,
    sort_order,
    category_name,
    description,
    created_at,
    updated_at
FROM categories
WHERE category_id = $1
LIMIT 1;

-- name: GetExistingCategoryIDs :many
SELECT category_id
FROM categories
WHERE category_id = ANY($1::uuid[])
ORDER BY category_id ASC;

-- name: CreateCategory :one
INSERT INTO categories (display_id, main_category_id, sort_order, category_name, description, created_at, updated_at)
VALUES (
    next_display_id('category_display_id_seq'),
    sqlc.arg(main_category_id),
    sqlc.arg(sort_order),
    sqlc.arg(category_name),
    sqlc.arg(description),
    NOW(),
    NOW()
)
RETURNING
    category_id,
    display_id,
    main_category_id,
    sort_order,
    category_name,
    description,
    created_at,
    updated_at;

-- name: UpdateCategory :execrows
UPDATE categories
SET main_category_id = sqlc.arg(main_category_id),
    sort_order = sqlc.arg(sort_order),
    category_name = sqlc.arg(category_name),
    description = sqlc.arg(description),
    updated_at = NOW()
WHERE category_id = sqlc.arg(category_id);

-- name: DeleteCategory :execrows
DELETE FROM categories WHERE category_id = $1;
