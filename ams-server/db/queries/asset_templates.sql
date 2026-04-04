-- name: CreateAssetTemplate :one
INSERT INTO asset_templates (template_id, template_name, description, created_at, updated_at)
VALUES ($1, $2, $3, NOW(), NOW())
RETURNING *;

-- name: GetAllAssetTemplates :many
SELECT * FROM asset_templates
ORDER BY created_at DESC;

-- name: GetAssetTemplateByID :one
SELECT * FROM asset_templates
WHERE template_id = $1 LIMIT 1;

-- name: UpdateAssetTemplate :execrows
UPDATE asset_templates
SET template_name = $1, description = $2, updated_at = NOW()
WHERE template_id = $3;

-- name: DeleteAssetTemplate :execrows
DELETE FROM asset_templates WHERE template_id = $1;