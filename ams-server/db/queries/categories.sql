-- name: GetAllCategoriesPaginated :many
SELECT
    id,
    category_id,
    main_category_id,
    category_name,
    description,
    created_at,
    updated_at
FROM categories
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: GetCategoriesByMainCategoryIDPaginated :many
SELECT
    id,
    category_id,
    main_category_id,
    category_name,
    description,
    created_at,
    updated_at
FROM categories
WHERE main_category_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountCategoriesByMainCategoryIDPaginated :one
SELECT COUNT(*) FROM categories WHERE main_category_id = $1;

-- name: CountCategories :one
SELECT COUNT(*) FROM categories;

-- name: GetCategoryByID :one
SELECT
    id,
    category_id,
    main_category_id,
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
WHERE category_id = ANY($1::text[])
ORDER BY category_id ASC;

-- name: CreateCategory :one
INSERT INTO categories (main_category_id, main_category_ref_id, category_name, description, created_at, updated_at)
VALUES ($1, (SELECT id FROM main_categories WHERE main_category_id = $1), $2, $3, NOW(), NOW())
RETURNING
    id,
    category_id,
    main_category_id,
    category_name,
    description,
    created_at,
    updated_at;

-- name: UpdateCategory :execrows
UPDATE categories
SET main_category_id = $1,
    main_category_ref_id = (SELECT id FROM main_categories WHERE main_category_id = $1),
    category_name = $2,
    description = $3,
    updated_at = NOW()
WHERE category_id = $4;

-- name: DeleteCategory :execrows
DELETE FROM categories WHERE category_id = $1;
