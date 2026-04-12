-- name: CreateTemplateComponentTest :one
INSERT INTO template_component_tests (
    template_component_id, template_component_ref_id, test_id, test_type_ref_id, position, created_at
)
VALUES (
    $1,
    (SELECT id FROM template_components WHERE template_component_id = $1),
    $2,
    (SELECT id FROM test_types WHERE test_id = $2),
    COALESCE((SELECT MAX(position) + 1 FROM template_component_tests WHERE template_component_id = $1), 1),
    NOW()
)
RETURNING
    id,
    template_component_test_id,
    template_component_id,
    test_id,
    position,
    created_at;

-- name: GetTemplateComponentTestsByComponentID :many
SELECT
    id,
    template_component_test_id,
    template_component_id,
    test_id,
    position,
    created_at
FROM template_component_tests
WHERE template_component_id = $1
ORDER BY position ASC, created_at ASC;

-- name: GetTemplateComponentTestByID :one
SELECT
    id,
    template_component_test_id,
    template_component_id,
    test_id,
    position,
    created_at
FROM template_component_tests
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
    tct.position,
    tct.created_at,
    tt.test_name,
    tt.validity_duration,
    tt.description
FROM template_component_tests tct
JOIN test_types tt ON tt.id = tct.test_type_ref_id
WHERE tct.template_component_id = $1
ORDER BY tct.position ASC, tct.created_at ASC;
