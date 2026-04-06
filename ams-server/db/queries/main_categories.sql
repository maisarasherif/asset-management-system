-- name: GetAllMainCategoriesPaginated :many
SELECT * FROM main_categories
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountMainCategories :one
SELECT COUNT(*) FROM main_categories;

-- name: GetMainCategoryByID :one
SELECT * FROM main_categories WHERE main_category_id = $1 LIMIT 1;

-- name: CreateMainCategory :one
INSERT INTO main_categories (main_category_id, main_category_name, description, created_at, updated_at)
VALUES ($1, $2, $3, NOW(), NOW())
RETURNING *;

-- name: UpdateMainCategory :execrows
UPDATE main_categories
SET main_category_name = $1, description = $2, updated_at = NOW()
WHERE main_category_id = $3;

-- name: DeleteMainCategory :execrows
DELETE FROM main_categories WHERE main_category_id = $1;

-- name: CountCategoriesByMainCategoryID :one
SELECT COUNT(*) FROM categories WHERE main_category_id = $1;
