-- name: LockHRAdminPerson :one
SELECT display_id, status FROM hr_admin_persons WHERE person_id = $1 FOR UPDATE;

-- name: LockHRAdminVehicle :one
SELECT display_id, status FROM hr_admin_vehicles WHERE vehicle_id = $1 FOR UPDATE;

-- name: LockHRAdminCompany :one
SELECT display_id, status FROM hr_admin_companies WHERE company_id = $1 FOR UPDATE;

-- name: CountHRAdminLinkedRecords :one
SELECT COUNT(*) FROM compliance_records
WHERE subject_type = $1 AND subject_id = $2
  AND (NOT sqlc.arg(active_only)::boolean OR status = 'ACTIVE');

-- name: DeleteArchivedHRAdminPerson :exec
DELETE FROM hr_admin_persons WHERE person_id = $1 AND status = 'ARCHIVED';

-- name: DeleteArchivedHRAdminVehicle :exec
DELETE FROM hr_admin_vehicles WHERE vehicle_id = $1 AND status = 'ARCHIVED';

-- name: DeleteArchivedHRAdminCompany :exec
DELETE FROM hr_admin_companies WHERE company_id = $1 AND status = 'ARCHIVED';

-- name: LockComplianceRecord :one
SELECT * FROM compliance_records WHERE record_id = $1 FOR UPDATE;

-- name: DeleteArchivedComplianceRecord :exec
DELETE FROM compliance_records WHERE record_id = $1 AND status = 'ARCHIVED';

-- name: WriteHRAdminDeletionAudit :exec
INSERT INTO hr_admin_deletion_audit (item_type, item_id, display_id, deleted_by, reason)
VALUES ($1, $2, $3, $4, $5);

-- name: RegisterHRAdminDocument :exec
INSERT INTO hr_admin_document_uploads (object_key) VALUES ($1);

-- name: LockHRAdminDocument :one
SELECT * FROM hr_admin_document_uploads WHERE object_key = $1 FOR UPDATE;

-- name: ListComplianceRecordDocumentKeys :many
SELECT DISTINCT document_file
FROM compliance_record_versions
WHERE record_id = $1 AND document_file <> ''
ORDER BY document_file;

-- name: RequestHRAdminDocumentPurge :execrows
UPDATE hr_admin_document_uploads
SET purge_requested_at = now()
WHERE object_key = $1 AND purge_requested_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM compliance_record_versions WHERE document_file = $1
);

-- name: FinishHRAdminDocumentPurge :exec
UPDATE hr_admin_document_uploads SET purged_at = now()
WHERE object_key = $1 AND purge_requested_at IS NOT NULL AND purged_at IS NULL;

-- name: IsHRAdminDocumentPurgePending :one
SELECT EXISTS (
    SELECT 1 FROM hr_admin_document_uploads
    WHERE object_key = $1 AND purge_requested_at IS NOT NULL AND purged_at IS NULL
);
