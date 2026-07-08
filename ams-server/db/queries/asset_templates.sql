-- name: CreateAssetTemplate :one
INSERT INTO asset_templates (display_id, template_name, description, created_at, updated_at)
VALUES (allocate_display_id('asset_templates.display_id', 'asset_templates'::REGCLASS), $1, $2, NOW(), NOW())
RETURNING
    template_id,
    display_id,
    template_name,
    description,
    created_at,
    updated_at;

-- name: GetAllAssetTemplates :many
SELECT
    template_id,
    display_id,
    template_name,
    description,
    created_at,
    updated_at
FROM asset_templates
ORDER BY created_at DESC;

-- name: GetAssetTemplateByID :one
SELECT
    template_id,
    display_id,
    template_name,
    description,
    created_at,
    updated_at
FROM asset_templates
WHERE template_id = $1
LIMIT 1;

-- name: UpdateAssetTemplate :execrows
UPDATE asset_templates
SET template_name = $1, description = $2, updated_at = NOW()
WHERE template_id = sqlc.arg(template_id);

-- name: DeleteAssetTemplate :execrows
DELETE FROM asset_templates WHERE template_id = $1;

-- name: CountAssetsByTemplateID :one
SELECT COUNT(*)
FROM assets
WHERE template_id = $1;
