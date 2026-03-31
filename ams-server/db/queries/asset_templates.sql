-- name: GetAllActiveAssetTemplates :many
SELECT * FROM asset_templates
WHERE is_deleted = FALSE
ORDER BY name ASC;

-- name: GetActiveAssetTemplateByID :one
SELECT * FROM asset_templates
WHERE template_id = $1 AND is_deleted = FALSE
LIMIT 1;

-- name: CreateAssetTemplate :one
INSERT INTO asset_templates (template_id, name, is_deleted, created_at, updated_at)
VALUES ($1, $2, FALSE, NOW(), NOW())
RETURNING *;

-- name: UpdateAssetTemplate :execrows
UPDATE asset_templates
SET name = $1, updated_at = NOW()
WHERE template_id = $2 AND is_deleted = FALSE;

-- name: SoftDeleteAssetTemplate :execrows
UPDATE asset_templates
SET is_deleted = TRUE, updated_at = NOW()
WHERE template_id = $1 AND is_deleted = FALSE;

-- name: GetActiveTemplateCategoriesByTemplateID :many
SELECT * FROM asset_template_categories
WHERE template_id = $1 AND is_archived = FALSE
ORDER BY sort_order ASC, created_at ASC;

-- name: GetAllTemplateCategoriesByTemplateID :many
SELECT * FROM asset_template_categories
WHERE template_id = $1
ORDER BY sort_order ASC, created_at ASC;

-- name: CreateTemplateCategory :one
INSERT INTO asset_template_categories (template_category_id, template_id, category_id, sort_order, is_archived, created_at, updated_at)
VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW())
RETURNING *;

-- name: UpdateTemplateCategory :execrows
UPDATE asset_template_categories
SET category_id = $1, sort_order = $2, updated_at = NOW()
WHERE template_category_id = $3;

-- name: ArchiveTemplateCategory :execrows
UPDATE asset_template_categories
SET is_archived = TRUE, updated_at = NOW()
WHERE template_category_id = $1 AND is_archived = FALSE;

-- name: GetActiveTemplateComponentsByTemplateID :many
SELECT comp.*
FROM asset_template_components comp
JOIN asset_template_categories cat ON cat.template_category_id = comp.template_category_id
WHERE cat.template_id = $1
  AND cat.is_archived = FALSE
  AND comp.is_archived = FALSE
ORDER BY comp.sort_order ASC, comp.created_at ASC;

-- name: GetAllTemplateComponentsByTemplateID :many
SELECT comp.*
FROM asset_template_components comp
JOIN asset_template_categories cat ON cat.template_category_id = comp.template_category_id
WHERE cat.template_id = $1
ORDER BY comp.sort_order ASC, comp.created_at ASC;

-- name: CreateTemplateComponent :one
INSERT INTO asset_template_components (
    template_component_id, template_category_id, name, serial_number, manufacturer, description,
    equipment_type, structure, model, class, class_code, safety_critical, sort_order, is_archived, created_at, updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, NOW(), NOW())
RETURNING *;

-- name: UpdateTemplateComponent :execrows
UPDATE asset_template_components
SET template_category_id = $1, name = $2, serial_number = $3, manufacturer = $4, description = $5,
    equipment_type = $6, structure = $7, model = $8, class = $9, class_code = $10,
    safety_critical = $11, sort_order = $12, updated_at = NOW()
WHERE template_component_id = $13;

-- name: ArchiveTemplateComponent :execrows
UPDATE asset_template_components
SET is_archived = TRUE, updated_at = NOW()
WHERE template_component_id = $1 AND is_archived = FALSE;

-- name: GetActiveTemplateRequirementsByTemplateID :many
SELECT req.*
FROM asset_template_test_requirements req
JOIN asset_template_components comp ON comp.template_component_id = req.template_component_id
JOIN asset_template_categories cat ON cat.template_category_id = comp.template_category_id
WHERE cat.template_id = $1
  AND cat.is_archived = FALSE
  AND comp.is_archived = FALSE
  AND req.is_archived = FALSE
ORDER BY req.sort_order ASC, req.created_at ASC;

-- name: GetAllTemplateRequirementsByTemplateID :many
SELECT req.*
FROM asset_template_test_requirements req
JOIN asset_template_components comp ON comp.template_component_id = req.template_component_id
JOIN asset_template_categories cat ON cat.template_category_id = comp.template_category_id
WHERE cat.template_id = $1
ORDER BY req.sort_order ASC, req.created_at ASC;

-- name: CreateTemplateRequirement :one
INSERT INTO asset_template_test_requirements (
    template_requirement_id, template_component_id, test_id, label, sort_order, is_archived, created_at, updated_at
)
VALUES ($1, $2, $3, $4, $5, FALSE, NOW(), NOW())
RETURNING *;

-- name: UpdateTemplateRequirement :execrows
UPDATE asset_template_test_requirements
SET template_component_id = $1, test_id = $2, label = $3, sort_order = $4, updated_at = NOW()
WHERE template_requirement_id = $5;

-- name: ArchiveTemplateRequirement :execrows
UPDATE asset_template_test_requirements
SET is_archived = TRUE, updated_at = NOW()
WHERE template_requirement_id = $1 AND is_archived = FALSE;
