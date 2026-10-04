-- name: LockCertificateForApproval :one
SELECT renewal_version FROM certificates WHERE certificate_id = $1 FOR UPDATE;

-- name: AllocateCertificateNumber :one
INSERT INTO certificate_number_counters(component_id, issue_date, last_sequence)
VALUES ($1, $2, 1)
ON CONFLICT (component_id, issue_date) DO UPDATE
SET last_sequence = certificate_number_counters.last_sequence + 1
RETURNING last_sequence;

-- name: InsertGeneratedIssuance :one
INSERT INTO certificate_issuances
(issuance_id, approval_id, certificate_id, certificate_ref, component_id, source, actor_id, actor_ref,
 signature_id, document_number, sequence, issue_date, expiry_date, snapshot, base_version, file_key)
VALUES (sqlc.arg(issuance_id), sqlc.arg(approval_id), sqlc.arg(certificate_id), sqlc.arg(certificate_id),
 sqlc.arg(component_id), 'GENERATED', sqlc.arg(actor_id), sqlc.arg(actor_id), sqlc.arg(signature_id),
 sqlc.arg(document_number), sqlc.arg(sequence), sqlc.arg(issue_date), sqlc.narg(expiry_date),
 sqlc.arg(snapshot), sqlc.arg(base_version), sqlc.arg(file_key))
RETURNING *;

-- name: GetCertificateIssuanceByApproval :one
SELECT * FROM certificate_issuances WHERE approval_id = $1;

-- name: GetCertificateIssuance :one
SELECT * FROM certificate_issuances WHERE issuance_id = $1 AND certificate_id = $2;

-- name: ListCertificateIssuances :many
SELECT * FROM certificate_issuances WHERE certificate_id = $1
ORDER BY approved_at DESC, issuance_id DESC LIMIT $2 OFFSET $3;

-- name: CountCertificateIssuances :one
SELECT count(*) FROM certificate_issuances WHERE certificate_id = $1;

-- name: ClaimCertificateIssuance :one
UPDATE certificate_issuances SET state = 'PROCESSING', attempt_id = $2,
 lease_until = NOW() + INTERVAL '5 minutes', failure_code = '', updated_at = NOW()
WHERE issuance_id = $1 AND (state IN ('APPROVED', 'FAILED') OR (state = 'PROCESSING' AND lease_until < NOW()))
RETURNING *;

-- name: RecordIssuanceDocument :execrows
UPDATE certificate_issuances SET document_sha256 = $3, document_size = $4, updated_at = NOW()
WHERE issuance_id = $1 AND attempt_id = $2 AND state = 'PROCESSING';

-- name: FailCertificateIssuance :execrows
UPDATE certificate_issuances SET state = 'FAILED', failure_code = $3, lease_until = NULL, updated_at = NOW()
WHERE issuance_id = $1 AND attempt_id = $2 AND state = 'PROCESSING';

-- name: LockProcessingIssuance :one
SELECT * FROM certificate_issuances WHERE issuance_id = $1 AND attempt_id = $2 AND state = 'PROCESSING' FOR UPDATE;

-- name: PublishIssuedCertificate :execrows
UPDATE certificates SET certificate_file = sqlc.arg(file_key), issue_date = sqlc.arg(issue_date),
 expiry_date = sqlc.narg(expiry_date), status = sqlc.arg(status), updated_at = NOW()
WHERE certificate_id = sqlc.arg(certificate_id) AND renewal_version = sqlc.arg(base_version)
AND EXISTS (SELECT 1 FROM users u WHERE u.user_id = sqlc.arg(actor_id) AND u.status = 'ACTIVE'
 AND (u.role = 'SUPER_ADMIN' OR (u.role = 'ADMIN' AND sqlc.arg(owner_kind)::TEXT = 'ACCOUNT' AND sqlc.arg(signer_id)::UUID = u.user_id)));

-- name: CompleteCertificateIssuance :execrows
UPDATE certificate_issuances SET state = 'COMPLETED', completed_at = NOW(), updated_at = NOW(), lease_until = NULL
WHERE issuance_id = $1 AND attempt_id = $2 AND state = 'PROCESSING';

-- name: GetIssuanceSignature :one
SELECT signature_id, owner_id, owner_kind, file_key, sha256, byte_size
FROM certificate_signature_versions WHERE signature_id = $1 AND storage_state = 'STORED';
