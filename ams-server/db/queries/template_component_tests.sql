-- name: CreateTemplateComponentTest :one
INSERT INTO template_component_tests (
    template_component_test_id, template_component_id, test_id, created_at
)
VALUES ($1, $2, $3, NOW())
RETURNING *;

-- name: GetTemplateComponentTestsByComponentID :many
SELECT * FROM template_component_tests
WHERE template_component_id = $1
ORDER BY created_at ASC;

-- name: GetTemplateComponentTestByID :one
SELECT * FROM template_component_tests
WHERE template_component_test_id = $1 LIMIT 1;

-- name: DeleteTemplateComponentTest :execrows
DELETE FROM template_component_tests WHERE template_component_test_id = $1;

-- name: CountTemplateComponentTestsByTestID :one
SELECT COUNT(*) FROM template_component_tests WHERE test_id = $1;

-- name: GetTemplateComponentTestsWithDetail :many
SELECT
    tct.template_component_test_id,
    tct.template_component_id,
    tct.test_id,
    tct.created_at,
    tt.test_name,
    tt.validity_duration,
    tt.description
FROM template_component_tests tct
JOIN test_types tt ON tt.test_id = tct.test_id
WHERE tct.template_component_id = $1
ORDER BY tct.created_at ASC;