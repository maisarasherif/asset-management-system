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
 AND (u.role = 'SUPER_ADMIN' OR (u.role = 'ADMIN' AND (sqlc.arg(source)::TEXT = 'EXTERNAL' OR (sqlc.arg(owner_kind)::TEXT = 'ACCOUNT' AND sqlc.arg(signer_id)::UUID = u.user_id)))));

-- name: CompleteCertificateIssuance :execrows
UPDATE certificate_issuances SET state = 'COMPLETED', completed_at = NOW(), updated_at = NOW(), lease_until = NULL
WHERE issuance_id = $1 AND attempt_id = $2 AND state = 'PROCESSING';

-- name: GetIssuanceSignature :one
SELECT signature_id, owner_id, owner_kind, file_key, sha256, byte_size
FROM certificate_signature_versions WHERE signature_id = $1 AND storage_state = 'STORED';

-- name: InsertExternalIssuance :one
INSERT INTO certificate_issuances
(issuance_id, approval_id, certificate_id, certificate_ref, component_id, source, actor_id, actor_ref,
 issue_date, expiry_date, snapshot, base_version, file_key, file_name, content_type, document_sha256, document_size)
VALUES ($1, $2, $3, $3, $4, 'EXTERNAL', $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *;

-- name: CreateIssuedUploadAudit :exec
INSERT INTO certificate_upload_audit (certificate_id, file_key, file_name, uploaded_by, competent_person_id, issuance_id, uploaded_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW());

-- name: GetCertificateHistory :many
SELECT * FROM (
 SELECT issuance_id AS history_id, source, state, COALESCE(document_number, '')::TEXT AS document_number,
 file_name, content_type, issue_date, expiry_date,
 COALESCE(snapshot->'signer'->>'full_name', '')::TEXT AS signer_name,
 COALESCE(snapshot->'signer'->>'organization', '')::TEXT AS signer_organization,
 approved_at AS recorded_at, TRUE AS snapshot_available, actor_id::TEXT AS actor_id,
 failure_code, cleanup_state, cleanup_failure_code, lease_until,
 COALESCE(snapshot->'signer'->>'owner_kind', '')::TEXT AS owner_kind,
 COALESCE(snapshot->'signer'->>'signer_id', '')::TEXT AS signer_id
 FROM certificate_issuances ci WHERE ci.certificate_id = sqlc.arg(certificate_id)
 UNION ALL
 SELECT uuid, 'LEGACY', 'LEGACY', '', file_name, '', NULL::DATE, NULL::DATE,
 '', '', uploaded_at, FALSE, '', '', 'NONE', '', NULL::TIMESTAMPTZ, '', ''
 FROM certificate_upload_audit ua WHERE ua.certificate_id = sqlc.arg(certificate_id) AND ua.issuance_id IS NULL
) history ORDER BY recorded_at DESC, history_id DESC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountCertificateHistory :one
SELECT ((SELECT count(*) FROM certificate_issuances ci WHERE ci.certificate_id = $1)
 + (SELECT count(*) FROM certificate_upload_audit ua WHERE ua.certificate_id = $1 AND ua.issuance_id IS NULL))::BIGINT;

-- name: LockIssuanceForRecovery :one
SELECT * FROM certificate_issuances WHERE issuance_id = $1 AND certificate_id = $2 FOR UPDATE;

-- name: IssuanceDocumentReferenced :one
SELECT EXISTS (SELECT 1 FROM certificates WHERE certificate_file = $1)
 OR EXISTS (SELECT 1 FROM certificate_upload_audit WHERE file_key = $1)
 OR EXISTS (SELECT 1 FROM certificate_signature_versions WHERE file_key = $1)
 OR EXISTS (SELECT 1 FROM certificate_issuances WHERE file_key = $1 AND state = 'COMPLETED');

-- name: AbandonCertificateIssuance :one
UPDATE certificate_issuances SET state = 'ABANDONED', cleanup_state = 'PENDING',
 abandoned_by = $2, abandoned_at = NOW(), attempt_id = NULL, lease_until = NULL, updated_at = NOW()
WHERE issuance_id = $1 AND (state IN ('APPROVED', 'FAILED')
 OR (state = 'PROCESSING' AND lease_until < NOW())) RETURNING *;

-- name: ClaimIssuanceCleanup :one
UPDATE certificate_issuances SET cleanup_state = 'PENDING', cleanup_failure_code = '',
 attempt_id = $2, lease_until = NOW() + INTERVAL '5 minutes', updated_at = NOW()
WHERE issuance_id = $1 AND state = 'ABANDONED' AND cleanup_state IN ('PENDING', 'FAILED')
 AND (lease_until IS NULL OR lease_until < NOW()) RETURNING *;

-- name: FinishIssuanceCleanup :execrows
UPDATE certificate_issuances SET cleanup_state = $3, cleanup_failure_code = $4,
 lease_until = NULL, updated_at = NOW()
WHERE issuance_id = $1 AND state = 'ABANDONED' AND attempt_id = $2 AND cleanup_generation = $5;

-- name: RequeueLateIssuanceCleanup :exec
UPDATE certificate_issuances SET cleanup_state = 'PENDING', attempt_id = NULL,
 lease_until = NULL, cleanup_generation = cleanup_generation + 1, updated_at = NOW()
WHERE issuance_id = $1 AND state = 'ABANDONED';
