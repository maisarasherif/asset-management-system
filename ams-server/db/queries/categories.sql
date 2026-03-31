-- name: GetAllCategoriesPaginated :many
SELECT * FROM categories
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountCategories :one
SELECT COUNT(*) FROM categories;

-- name: GetCategoryByID :one
SELECT * FROM categories WHERE category_id = $1 LIMIT 1;

-- name: CreateCategory :one
INSERT INTO categories (category_id, category_name, description, created_at, updated_at)
VALUES ($1, $2, $3, NOW(), NOW())
RETURNING *;

-- name: UpdateCategory :execrows
UPDATE categories
SET category_name = $1, description = $2, updated_at = NOW()
WHERE category_id = $3;

-- name: DeleteCategory :execrows
DELETE FROM categories WHERE category_id = $1;

-- name: CountTemplateCategoriesByCategoryID :one
SELECT COUNT(*) FROM asset_template_categories WHERE category_id = $1;

-- name: CountAssetCategoriesByCategoryID :one
SELECT COUNT(*) FROM asset_categories WHERE category_id = $1;
