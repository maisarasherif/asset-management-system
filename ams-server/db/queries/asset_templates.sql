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

-- name: SearchAssetTemplates :many
SELECT
    template_id,
    display_id,
    template_name,
    description,
    created_at,
    updated_at
FROM asset_templates
WHERE strpos(lower(concat_ws(' ', display_id, template_name, description)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::text = '' OR EXISTS (
    SELECT 1 FROM assets a WHERE a.template_id = asset_templates.template_id AND lower(a.assigned_project) = lower(sqlc.arg(filter_project))
  ))
ORDER BY created_at DESC, template_id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountSearchAssetTemplates :one
SELECT COUNT(*)
FROM asset_templates
WHERE strpos(lower(concat_ws(' ', display_id, template_name, description)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::text = '' OR EXISTS (
    SELECT 1 FROM assets a WHERE a.template_id = asset_templates.template_id AND lower(a.assigned_project) = lower(sqlc.arg(filter_project))
  ));
