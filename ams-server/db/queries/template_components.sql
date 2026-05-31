-- name: CreateTemplateComponent :one
INSERT INTO template_components (
    display_id,
    template_id, category_id, scope_category_id, position, name, description,
    serial_number, manufacturer, location, assigned_project, equipment_type,
    structure, model, class, class_code, safety_critical, created_at
)
VALUES (
    next_display_id('template_component_display_id_seq'),
    sqlc.arg(template_id),
    sqlc.arg(category_id),
    sqlc.arg(scope_category_id),
    COALESCE((SELECT MAX(position) + 1 FROM template_components WHERE template_id = sqlc.arg(template_id)), 1),
    sqlc.arg(name),
    sqlc.arg(description),
    sqlc.arg(serial_number),
    sqlc.arg(manufacturer),
    sqlc.arg(location),
    sqlc.arg(assigned_project),
    sqlc.arg(equipment_type),
    sqlc.arg(structure),
    sqlc.arg(model),
    sqlc.arg(class),
    sqlc.arg(class_code),
    sqlc.arg(safety_critical),
    NOW()
)
RETURNING
    template_component_id,
    display_id,
    template_id,
    category_id,
    scope_category_id,
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
    tc.template_component_id,
    tc.display_id,
    tc.template_id,
    tc.category_id,
    tc.scope_category_id,
    tc.position,
    tc.name,
    tc.description,
    tc.serial_number,
    tc.manufacturer,
    tc.equipment_type,
    tc.structure,
    tc.model,
    tc.class,
    tc.class_code,
    tc.safety_critical,
    tc.created_at,
    tc.location,
    tc.assigned_project
FROM template_components tc
JOIN categories c ON c.category_id = tc.category_id
LEFT JOIN main_categories mc ON mc.main_category_id = c.main_category_id
WHERE tc.template_id = $1
ORDER BY
    CASE WHEN mc.sort_order IS NULL THEN 1 ELSE 0 END,
    mc.sort_order ASC NULLS LAST,
    c.sort_order ASC,
    tc.position ASC,
    tc.created_at ASC;

-- name: GetTemplateComponentByID :one
SELECT
    template_component_id,
    display_id,
    template_id,
    category_id,
    scope_category_id,
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
WHERE template_component_id = $1
LIMIT 1;

-- name: UpdateTemplateComponent :execrows
UPDATE template_components
SET category_id = sqlc.arg(category_id),
    scope_category_id = sqlc.arg(scope_category_id),
    name = sqlc.arg(name),
    description = sqlc.arg(description),
    serial_number = sqlc.arg(serial_number),
    manufacturer = sqlc.arg(manufacturer),
    location = sqlc.arg(location),
    assigned_project = sqlc.arg(assigned_project),
    equipment_type = sqlc.arg(equipment_type),
    structure = sqlc.arg(structure),
    model = sqlc.arg(model),
    class = sqlc.arg(class),
    class_code = sqlc.arg(class_code),
    safety_critical = sqlc.arg(safety_critical)
WHERE template_component_id = sqlc.arg(template_component_id);

-- name: DeleteTemplateComponent :execrows
DELETE FROM template_components WHERE template_component_id = $1;

-- name: DeleteTemplateComponentsByTemplateID :execrows
DELETE FROM template_components
WHERE template_id = $1;

-- name: CountTemplateComponentsByTemplateID :one
SELECT COUNT(*)
FROM template_components
WHERE template_id = $1;

-- name: CountTemplateComponentsByCategoryID :one
SELECT COUNT(*)
FROM template_components
WHERE category_id = $1;

-- name: CountTemplateComponentsByScopeCategoryID :one
SELECT COUNT(*)
FROM template_components
WHERE scope_category_id = $1;
