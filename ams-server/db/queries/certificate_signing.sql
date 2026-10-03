-- name: GetAccountSigningProfile :one
SELECT u.user_id, u.first_name, u.last_name, u.role, u.status,
       COALESCE(p.organization, 'Porto Marine Services L.L.C.')::TEXT AS organization,
       p.competency_category_id, c.category_name AS competency_category_name,
       c.active AS competency_category_active, p.current_signature_id,
       COALESCE(p.updated_at, u.updated_at)::TIMESTAMPTZ AS updated_at
FROM users u
LEFT JOIN certificate_signing_profiles p ON p.user_id = u.user_id
LEFT JOIN competency_categories c ON c.competency_category_id = p.competency_category_id
WHERE u.user_id = $1;

-- name: EnsureOwnSigningProfile :one
INSERT INTO certificate_signing_profiles(user_id)
SELECT u.user_id FROM users u WHERE u.user_id = $1 AND u.role = 'ADMIN' AND u.status = 'ACTIVE'
ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
RETURNING certificate_signing_profiles.user_id, certificate_signing_profiles.current_signature_id;

-- name: UpdateOwnSigningOrganization :one
INSERT INTO certificate_signing_profiles(user_id, organization)
SELECT u.user_id, sqlc.arg(organization)::TEXT FROM users u
WHERE u.user_id = sqlc.arg(user_id) AND u.role = 'ADMIN' AND u.status = 'ACTIVE'
ON CONFLICT (user_id) DO UPDATE
SET organization = EXCLUDED.organization, updated_at = NOW()
RETURNING certificate_signing_profiles.user_id;

-- name: CreateAccountSignatureVersion :exec
INSERT INTO certificate_signature_versions
    (signature_id, owner_kind, owner_id, account_user_id, file_key, sha256,
     width, height, byte_size, created_by_user_id)
VALUES (sqlc.arg(signature_id), 'ACCOUNT', sqlc.arg(user_id), sqlc.arg(user_id),
        sqlc.arg(file_key), sqlc.arg(sha256), sqlc.arg(width), sqlc.arg(height),
        sqlc.arg(byte_size), sqlc.arg(user_id));

-- name: GetStoredAccountSignature :one
SELECT signature_id, owner_id, file_key, sha256, width, height, byte_size, created_at
FROM certificate_signature_versions
WHERE signature_id = $1 AND owner_kind = 'ACCOUNT' AND owner_id = $2
  AND storage_state = 'STORED';

-- name: MarkSignatureStored :execrows
UPDATE certificate_signature_versions SET storage_state = 'STORED'
WHERE signature_id = $1 AND owner_id = $2 AND owner_kind = 'ACCOUNT'
  AND storage_state = 'PENDING';

-- name: MarkSignatureFailed :exec
UPDATE certificate_signature_versions SET storage_state = 'FAILED'
WHERE signature_id = $1 AND storage_state = 'PENDING';

-- name: PublishOwnSignature :execrows
UPDATE certificate_signing_profiles p
SET current_signature_id = sqlc.arg(signature_id), updated_at = NOW()
WHERE p.user_id = sqlc.arg(user_id)
  AND p.current_signature_id IS NOT DISTINCT FROM sqlc.narg(previous_signature_id)::UUID
  AND EXISTS (SELECT 1 FROM users u WHERE u.user_id = p.user_id AND u.role = 'ADMIN' AND u.status = 'ACTIVE');
