-- name: CreateTemplateComponent :one
INSERT INTO template_components (
    template_component_id, template_id, category_id, name, description,
    serial_number, manufacturer, equipment_type, structure, model,
    class, class_code, safety_critical, created_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
RETURNING *;

-- name: GetTemplateComponentsByTemplateID :many
SELECT * FROM template_components
WHERE template_id = $1
ORDER BY category_id, name ASC;

-- name: GetTemplateComponentByID :one
SELECT * FROM template_components
WHERE template_component_id = $1 LIMIT 1;

-- name: UpdateTemplateComponent :execrows
UPDATE template_components
SET category_id = $1, name = $2, description = $3, serial_number = $4,
    manufacturer = $5, equipment_type = $6, structure = $7, model = $8,
    class = $9, class_code = $10, safety_critical = $11
WHERE template_component_id = $12;

-- name: DeleteTemplateComponent :execrows
DELETE FROM template_components WHERE template_component_id = $1;

-- name: CountTemplateComponentsByTemplateID :one
SELECT COUNT(*) FROM template_components WHERE template_id = $1;

-- name: CountTemplateComponentsByCategoryID :one
SELECT COUNT(*) FROM template_components WHERE category_id = $1;