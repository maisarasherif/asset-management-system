-- name: GetActiveComponentRequirementsByComponentID :many
SELECT
    req.id,
    req.requirement_id,
    req.component_id,
    req.source_template_requirement_id,
    req.test_id,
    req.label,
    req.sort_order,
    req.is_archived,
    req.created_at,
    req.updated_at,
    tt.test_name,
    tt.validity_duration,
    tt.description AS test_description
FROM component_test_requirements req
JOIN test_types tt ON tt.test_id = req.test_id
WHERE req.component_id = $1 AND req.is_archived = FALSE
ORDER BY req.sort_order ASC, req.created_at ASC;

-- name: GetActiveComponentRequirementsByAssetID :many
SELECT
    req.id,
    req.requirement_id,
    req.component_id,
    req.source_template_requirement_id,
    req.test_id,
    req.label,
    req.sort_order,
    req.is_archived,
    req.created_at,
    req.updated_at,
    tt.test_name,
    tt.validity_duration,
    tt.description AS test_description
FROM component_test_requirements req
JOIN components comp ON comp.component_id = req.component_id
JOIN test_types tt ON tt.test_id = req.test_id
WHERE comp.asset_id = $1
  AND comp.is_archived = FALSE
  AND req.is_archived = FALSE
ORDER BY req.sort_order ASC, req.created_at ASC;

-- name: GetComponentRequirementByID :one
SELECT * FROM component_test_requirements
WHERE requirement_id = $1 AND is_archived = FALSE
LIMIT 1;

-- name: GetComponentRequirementByIDAny :one
SELECT * FROM component_test_requirements
WHERE requirement_id = $1
LIMIT 1;

-- name: CountComponentRequirementsByComponentID :one
SELECT COUNT(*) FROM component_test_requirements
WHERE component_id = $1 AND is_archived = FALSE;

-- name: CreateComponentRequirement :one
INSERT INTO component_test_requirements (
    requirement_id, component_id, source_template_requirement_id, test_id, label, sort_order, is_archived, created_at, updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NOW())
RETURNING *;

-- name: UpdateComponentRequirement :execrows
UPDATE component_test_requirements
SET component_id = $1, test_id = $2, label = $3, sort_order = $4, updated_at = NOW()
WHERE requirement_id = $5;

-- name: ArchiveComponentRequirement :execrows
UPDATE component_test_requirements
SET is_archived = TRUE, updated_at = NOW()
WHERE requirement_id = $1 AND is_archived = FALSE;

-- name: ArchiveActiveRequirementsByComponentID :execrows
UPDATE component_test_requirements
SET is_archived = TRUE, updated_at = NOW()
WHERE component_id = $1 AND is_archived = FALSE;
