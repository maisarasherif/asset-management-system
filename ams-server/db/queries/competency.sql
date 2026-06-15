-- name: GetAllCompetencyCategoriesPaginated :many
SELECT
    competency_category_id,
    category_code,
    category_name,
    description,
    active,
    created_at,
    updated_at
FROM competency_categories
ORDER BY category_name ASC
LIMIT $1 OFFSET $2;

-- name: GetActiveCompetencyCategories :many
SELECT
    competency_category_id,
    category_code,
    category_name,
    description,
    active,
    created_at,
    updated_at
FROM competency_categories
WHERE active = TRUE
ORDER BY category_name ASC;

-- name: CountCompetencyCategories :one
SELECT COUNT(*) FROM competency_categories;

-- name: GetCompetencyCategoryByID :one
SELECT
    competency_category_id,
    category_code,
    category_name,
    description,
    active,
    created_at,
    updated_at
FROM competency_categories
WHERE competency_category_id = $1
LIMIT 1;

-- name: CreateCompetencyCategory :one
INSERT INTO competency_categories (category_code, category_name, description, active, created_at, updated_at)
VALUES (
    sqlc.arg(category_code),
    sqlc.arg(category_name),
    sqlc.arg(description),
    sqlc.arg(active),
    NOW(),
    NOW()
)
RETURNING
    competency_category_id,
    category_code,
    category_name,
    description,
    active,
    created_at,
    updated_at;

-- name: UpdateCompetencyCategory :execrows
UPDATE competency_categories
SET category_code = sqlc.arg(category_code),
    category_name = sqlc.arg(category_name),
    description = sqlc.arg(description),
    active = sqlc.arg(active),
    updated_at = NOW()
WHERE competency_category_id = sqlc.arg(competency_category_id);

-- name: CountCompetentPersonsByCategoryID :one
SELECT COUNT(*)
FROM competent_persons
WHERE competency_category_id = $1;

-- name: GetAllCompetentPersonsPaginated :many
SELECT
    cp.competent_person_id,
    cp.full_name,
    cp.person_type,
    cp.organization,
    cp.competency_category_id,
    cc.category_code AS competency_category_code,
    cc.category_name AS competency_category_name,
    cc.description AS competency_category_description,
    cp.active,
    cp.created_at,
    cp.updated_at
FROM competent_persons cp
JOIN competency_categories cc ON cc.competency_category_id = cp.competency_category_id
ORDER BY cp.full_name ASC
LIMIT $1 OFFSET $2;

-- name: GetActiveCompetentPersons :many
SELECT
    cp.competent_person_id,
    cp.full_name,
    cp.person_type,
    cp.organization,
    cp.competency_category_id,
    cc.category_code AS competency_category_code,
    cc.category_name AS competency_category_name,
    cc.description AS competency_category_description,
    cp.active,
    cp.created_at,
    cp.updated_at
FROM competent_persons cp
JOIN competency_categories cc ON cc.competency_category_id = cp.competency_category_id
WHERE cp.active = TRUE AND cc.active = TRUE
ORDER BY cp.full_name ASC;

-- name: GetCompetencyCategoriesByTemplateComponentTestID :many
SELECT
    cc.competency_category_id,
    cc.category_code,
    cc.category_name,
    cc.description,
    cc.active,
    cc.created_at,
    cc.updated_at
FROM template_component_test_competency_categories tctcc
JOIN competency_categories cc ON cc.competency_category_id = tctcc.competency_category_id
WHERE tctcc.template_component_test_id = $1
ORDER BY cc.category_name ASC;

-- name: CountActiveCompetencyCategoriesByIDs :one
SELECT COUNT(*)
FROM competency_categories
WHERE active = TRUE
  AND competency_category_id = ANY($1::uuid[]);

-- name: DeleteTemplateComponentTestCompetencyCategories :execrows
DELETE FROM template_component_test_competency_categories
WHERE template_component_test_id = $1;

-- name: AddTemplateComponentTestCompetencyCategory :execrows
INSERT INTO template_component_test_competency_categories (template_component_test_id, competency_category_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: GetCompetencyCategoriesByCertificateID :many
SELECT
    cc.competency_category_id,
    cc.category_code,
    cc.category_name,
    cc.description,
    cc.active,
    cc.created_at,
    cc.updated_at
FROM certificate_competency_categories ccc
JOIN competency_categories cc ON cc.competency_category_id = ccc.competency_category_id
WHERE ccc.certificate_id = $1
ORDER BY cc.category_name ASC;

-- name: DeleteCertificateCompetencyCategories :execrows
DELETE FROM certificate_competency_categories
WHERE certificate_id = $1;

-- name: AddCertificateCompetencyCategory :execrows
INSERT INTO certificate_competency_categories (certificate_id, competency_category_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: CountCertificateCompetencyCategories :one
SELECT COUNT(*)
FROM certificate_competency_categories
WHERE certificate_id = $1;

-- name: CountCertificateCompetencyCategoryByIDs :one
SELECT COUNT(*)
FROM certificate_competency_categories
WHERE certificate_id = sqlc.arg(certificate_id)
  AND competency_category_id = sqlc.arg(competency_category_id);

-- name: CountCompetentPersons :one
SELECT COUNT(*) FROM competent_persons;

-- name: GetCompetentPersonByID :one
SELECT
    cp.competent_person_id,
    cp.full_name,
    cp.person_type,
    cp.organization,
    cp.competency_category_id,
    cc.category_code AS competency_category_code,
    cc.category_name AS competency_category_name,
    cc.description AS competency_category_description,
    cp.active,
    cp.created_at,
    cp.updated_at
FROM competent_persons cp
JOIN competency_categories cc ON cc.competency_category_id = cp.competency_category_id
WHERE cp.competent_person_id = $1
LIMIT 1;

-- name: CreateCompetentPerson :one
INSERT INTO competent_persons (
    full_name,
    person_type,
    organization,
    competency_category_id,
    active,
    created_at,
    updated_at
)
VALUES (
    sqlc.arg(full_name),
    sqlc.arg(person_type),
    sqlc.arg(organization),
    sqlc.arg(competency_category_id),
    sqlc.arg(active),
    NOW(),
    NOW()
)
RETURNING
    competent_person_id,
    full_name,
    person_type,
    organization,
    competency_category_id,
    active,
    created_at,
    updated_at;

-- name: UpdateCompetentPerson :execrows
UPDATE competent_persons
SET full_name = sqlc.arg(full_name),
    person_type = sqlc.arg(person_type),
    organization = sqlc.arg(organization),
    competency_category_id = sqlc.arg(competency_category_id),
    active = sqlc.arg(active),
    updated_at = NOW()
WHERE competent_person_id = sqlc.arg(competent_person_id);

-- name: CountCertificateUploadAuditByCompetentPersonID :one
SELECT COUNT(*)
FROM certificate_upload_audit
WHERE competent_person_id = $1;
