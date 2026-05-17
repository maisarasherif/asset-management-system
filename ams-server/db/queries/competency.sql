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
