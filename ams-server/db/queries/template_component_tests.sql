-- name: CreateTemplateComponentTest :one
INSERT INTO template_component_tests (
    display_id,
    template_component_id, test_id, position, created_at
)
VALUES (
    next_display_id('template_component_test_display_id_seq'),
    sqlc.arg(template_component_id),
    sqlc.arg(test_id),
    COALESCE((SELECT MAX(position) + 1 FROM template_component_tests WHERE template_component_id = sqlc.arg(template_component_id)), 1),
    NOW()
)
RETURNING
    template_component_test_id,
    display_id,
    template_component_id,
    test_id,
    position,
    created_at;

-- name: GetTemplateComponentTestsByComponentID :many
SELECT
    template_component_test_id,
    display_id,
    template_component_id,
    test_id,
    position,
    created_at
FROM template_component_tests
WHERE template_component_id = $1
ORDER BY position ASC, created_at ASC;

-- name: GetTemplateComponentTestByID :one
SELECT
    template_component_test_id,
    display_id,
    template_component_id,
    test_id,
    position,
    created_at
FROM template_component_tests
WHERE template_component_test_id = $1
LIMIT 1;

-- name: DeleteTemplateComponentTest :execrows
DELETE FROM template_component_tests WHERE template_component_test_id = $1;

-- name: DeleteTemplateComponentTestsByComponentID :execrows
DELETE FROM template_component_tests
WHERE template_component_id = $1;

-- name: CountTemplateComponentTestsByTestID :one
SELECT COUNT(*)
FROM template_component_tests
WHERE test_id = $1;

-- name: GetTemplateComponentTestsWithDetail :many
SELECT
    tct.template_component_test_id AS template_component_test_id,
    tct.display_id AS template_component_test_display_id,
    tct.template_component_id AS template_component_id,
    tct.test_id AS test_id,
    tct.position,
    tct.created_at,
    tt.test_name,
    tt.validity_duration,
    tt.description
FROM template_component_tests tct
JOIN test_types tt ON tt.test_id = tct.test_id
WHERE tct.template_component_id = $1
ORDER BY tct.position ASC, tct.created_at ASC;

-- name: GetTemplateComponentTestsWithDetailByTemplateID :many
SELECT
    tct.template_component_test_id AS template_component_test_id,
    tct.display_id AS template_component_test_display_id,
    tct.template_component_id AS template_component_id,
    tct.test_id AS test_id,
    tct.position,
    tct.created_at,
    tt.test_name,
    tt.validity_duration,
    tt.description
FROM template_component_tests tct
JOIN test_types tt ON tt.test_id = tct.test_id
JOIN template_components tc ON tc.template_component_id = tct.template_component_id
WHERE tc.template_id = $1
ORDER BY tc.position ASC, tct.position ASC, tct.created_at ASC;
