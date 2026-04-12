-- name: CreateTemplateComponent :one
INSERT INTO template_components (
    template_id, template_ref_id, category_id, category_ref_id, position, name, description,
    serial_number, manufacturer, location, assigned_project, equipment_type,
    structure, model, class, class_code, safety_critical, created_at
)
VALUES (
    $1,
    (SELECT id FROM asset_templates WHERE template_id = $1),
    $2,
    (SELECT id FROM categories WHERE category_id = $2),
    COALESCE((SELECT MAX(position) + 1 FROM template_components WHERE template_id = $1), 1),
    $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()
)
RETURNING
    id,
    template_component_id,
    template_id,
    category_id,
    position,
    name,
    description,
    serial_number,
    manufacturer,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    location,
    assigned_project;

-- name: GetTemplateComponentsByTemplateID :many
SELECT
    id,
    template_component_id,
    template_id,
    category_id,
    position,
    name,
    description,
    serial_number,
    manufacturer,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    location,
    assigned_project
FROM template_components
WHERE template_id = $1
ORDER BY position ASC, created_at ASC;

-- name: GetTemplateComponentByID :one
SELECT
    id,
    template_component_id,
    template_id,
    category_id,
    position,
    name,
    description,
    serial_number,
    manufacturer,
    equipment_type,
    structure,
    model,
    class,
    class_code,
    safety_critical,
    created_at,
    location,
    assigned_project
FROM template_components
WHERE template_component_id = $1 LIMIT 1;

-- name: UpdateTemplateComponent :execrows
UPDATE template_components
SET category_id = $1,
    category_ref_id = (SELECT id FROM categories WHERE category_id = $1),
    name = $2, description = $3, serial_number = $4,
    manufacturer = $5, location = $6, assigned_project = $7, equipment_type = $8, structure = $9, model = $10,
    class = $11, class_code = $12, safety_critical = $13
WHERE template_component_id = $14;

-- name: DeleteTemplateComponent :execrows
DELETE FROM template_components WHERE template_component_id = $1;

-- name: DeleteTemplateComponentsByTemplateID :execrows
DELETE FROM template_components WHERE template_id = $1;

-- name: CountTemplateComponentsByTemplateID :one
SELECT COUNT(*) FROM template_components WHERE template_id = $1;

-- name: CountTemplateComponentsByCategoryID :one
SELECT COUNT(*) FROM template_components WHERE category_id = $1;
