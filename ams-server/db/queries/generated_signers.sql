-- name: GetSigningActor :one
SELECT user_id, role, status FROM users WHERE user_id = $1;

-- name: GetCompetentSigningProfile :one
SELECT cp.competent_person_id, cp.full_name, cp.organization, cp.active,
       cp.competency_category_id, cc.category_name, cc.active AS category_active,
       p.current_signature_id, COALESCE(p.updated_at, cp.updated_at)::TIMESTAMPTZ AS updated_at
FROM competent_persons cp
JOIN competency_categories cc ON cc.competency_category_id = cp.competency_category_id
LEFT JOIN competent_person_signing_profiles p ON p.competent_person_id = cp.competent_person_id
WHERE cp.competent_person_id = $1;

-- name: EnsureCompetentSigningProfile :one
INSERT INTO competent_person_signing_profiles(competent_person_id)
SELECT cp.competent_person_id FROM competent_persons cp
WHERE cp.competent_person_id = sqlc.arg(person_id)
  AND EXISTS (SELECT 1 FROM users u WHERE u.user_id = sqlc.arg(actor_id) AND u.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE')
ON CONFLICT (competent_person_id) DO UPDATE SET competent_person_id = EXCLUDED.competent_person_id
RETURNING current_signature_id;

-- name: CreateCompetentSignatureVersion :exec
INSERT INTO certificate_signature_versions
    (signature_id, owner_kind, owner_id, competent_person_id, file_key, sha256,
     width, height, byte_size, created_by_user_id)
VALUES (sqlc.arg(signature_id), 'COMPETENT_PERSON', sqlc.arg(person_id), sqlc.arg(person_id),
        sqlc.arg(file_key), sqlc.arg(sha256), sqlc.arg(width), sqlc.arg(height),
        sqlc.arg(byte_size), sqlc.arg(actor_id));

-- name: GetStoredCompetentSignature :one
SELECT signature_id, owner_id, file_key, sha256, width, height, byte_size, created_at
FROM certificate_signature_versions
WHERE signature_id = $1 AND owner_kind = 'COMPETENT_PERSON' AND owner_id = $2
  AND storage_state = 'STORED';

-- name: MarkCompetentSignatureStored :execrows
UPDATE certificate_signature_versions SET storage_state = 'STORED'
WHERE signature_id = $1 AND owner_id = $2 AND owner_kind = 'COMPETENT_PERSON'
  AND storage_state = 'PENDING';

-- name: PublishCompetentSignature :execrows
UPDATE competent_person_signing_profiles p
SET current_signature_id = sqlc.arg(signature_id), updated_at = NOW()
WHERE p.competent_person_id = sqlc.arg(person_id)
  AND p.current_signature_id IS NOT DISTINCT FROM sqlc.narg(previous_signature_id)::UUID
  AND EXISTS (SELECT 1 FROM users u WHERE u.user_id = sqlc.arg(actor_id) AND u.role = 'SUPER_ADMIN' AND u.status = 'ACTIVE');

-- name: AssignAccountSigningCategory :execrows
INSERT INTO certificate_signing_profiles(user_id, competency_category_id)
SELECT target.user_id, sqlc.narg(category_id)::UUID FROM users target
WHERE target.user_id = sqlc.arg(user_id) AND target.role = 'ADMIN'
  AND EXISTS (SELECT 1 FROM users actor WHERE actor.user_id = sqlc.arg(actor_id) AND actor.role = 'SUPER_ADMIN' AND actor.status = 'ACTIVE')
  AND (sqlc.narg(category_id)::UUID IS NULL OR EXISTS (
    SELECT 1 FROM competency_categories c WHERE c.competency_category_id = sqlc.narg(category_id)::UUID AND c.active = TRUE))
ON CONFLICT (user_id) DO UPDATE SET competency_category_id = EXCLUDED.competency_category_id, updated_at = NOW();

-- name: ListEligibleCompetentSigners :many
SELECT cp.competent_person_id AS signer_id, cp.full_name, cp.organization,
       cp.competency_category_id, cc.category_name, s.signature_id, s.sha256,
       s.width, s.height, s.byte_size, s.created_at
FROM competent_persons cp
JOIN competency_categories cc ON cc.competency_category_id = cp.competency_category_id
JOIN competent_person_signing_profiles p ON p.competent_person_id = cp.competent_person_id
JOIN certificate_signature_versions s ON s.signature_id = p.current_signature_id
  AND s.owner_id = cp.competent_person_id AND s.owner_kind = 'COMPETENT_PERSON' AND s.storage_state = 'STORED'
WHERE cp.active = TRUE AND cc.active = TRUE
  AND btrim(cp.full_name) <> '' AND btrim(cp.organization) <> ''
  AND (NOT EXISTS (SELECT 1 FROM certificate_competency_categories ccc WHERE ccc.certificate_id = sqlc.arg(certificate_id))
    OR EXISTS (SELECT 1 FROM certificate_competency_categories ccc WHERE ccc.certificate_id = sqlc.arg(certificate_id) AND ccc.competency_category_id = cp.competency_category_id))
ORDER BY cp.full_name, cp.competent_person_id;

-- name: IsAccountSigningCategoryAllowed :one
SELECT EXISTS (
    SELECT 1 FROM certificate_signing_profiles p
    JOIN competency_categories cc ON cc.competency_category_id = p.competency_category_id AND cc.active = TRUE
    JOIN certificate_signature_versions s ON s.signature_id = p.current_signature_id
      AND s.owner_id = p.user_id AND s.owner_kind = 'ACCOUNT' AND s.storage_state = 'STORED'
    WHERE p.user_id = sqlc.arg(user_id)
      AND (NOT EXISTS (SELECT 1 FROM certificate_competency_categories ccc WHERE ccc.certificate_id = sqlc.arg(certificate_id))
        OR EXISTS (SELECT 1 FROM certificate_competency_categories ccc WHERE ccc.certificate_id = sqlc.arg(certificate_id) AND ccc.competency_category_id = p.competency_category_id))
)::BOOLEAN;
