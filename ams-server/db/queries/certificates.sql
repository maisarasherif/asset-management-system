-- name: GetAllCertificatesPaginated :many
SELECT
    id,
    certificate_id,
    component_id,
    certificate_name,
    issue_date,
    expiry_date,
    certificate_file,
    issuing_authority,
    status,
    test_id,
    imca_ref,
    imca_d018,
    maintenance_notes,
    created_at,
    updated_at
FROM certificates
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountCertificates :one
SELECT COUNT(*) FROM certificates;

-- name: GetCertificatesByComponentIDPaginated :many
SELECT
    id,
    certificate_id,
    component_id,
    certificate_name,
    issue_date,
    expiry_date,
    certificate_file,
    issuing_authority,
    status,
    test_id,
    imca_ref,
    imca_d018,
    maintenance_notes,
    created_at,
    updated_at
FROM certificates
WHERE component_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountCertificatesByComponentID :one
SELECT COUNT(*) FROM certificates WHERE component_id = $1;

-- name: CountCertificatesByTestID :one
SELECT COUNT(*) FROM certificates WHERE test_id = $1;

-- name: GetCertificateByID :one
SELECT
    id,
    certificate_id,
    component_id,
    certificate_name,
    issue_date,
    expiry_date,
    certificate_file,
    issuing_authority,
    status,
    test_id,
    imca_ref,
    imca_d018,
    maintenance_notes,
    created_at,
    updated_at
FROM certificates
WHERE certificate_id = $1
LIMIT 1;

-- name: CreateCertificate :one
INSERT INTO certificates (
    component_id, component_ref_id, certificate_name, issue_date, expiry_date, certificate_file,
    issuing_authority, status, test_id, test_type_ref_id, imca_ref, imca_d018, maintenance_notes, created_at, updated_at
)
VALUES (
    $1,
    (SELECT id FROM components WHERE component_id = $1),
    $2, $3, $4, $5, $6, $7, $8,
    (SELECT id FROM test_types WHERE test_id = $8),
    $9, $10, $11, NOW(), NOW()
)
RETURNING
    id,
    certificate_id,
    component_id,
    certificate_name,
    issue_date,
    expiry_date,
    certificate_file,
    issuing_authority,
    status,
    test_id,
    imca_ref,
    imca_d018,
    maintenance_notes,
    created_at,
    updated_at;

-- name: UpdateCertificate :execrows
UPDATE certificates
SET component_id = $1,
    component_ref_id = (SELECT id FROM components WHERE component_id = $1),
    certificate_name = $2, issue_date = $3, expiry_date = $4,
    certificate_file = $5, issuing_authority = $6, status = $7, test_id = $8,
    test_type_ref_id = (SELECT id FROM test_types WHERE test_id = $8),
    imca_ref = $9, imca_d018 = $10, maintenance_notes = $11, updated_at = NOW()
WHERE certificate_id = $12;

-- name: UpdateCertificateFile :execrows
UPDATE certificates
SET certificate_file = $1, updated_at = NOW()
WHERE certificate_id = $2;

-- name: DeleteCertificate :execrows
DELETE FROM certificates WHERE certificate_id = $1;

-- name: GetExpiringCertificates :many
SELECT
    id,
    certificate_id,
    component_id,
    certificate_name,
    issue_date,
    expiry_date,
    certificate_file,
    issuing_authority,
    status,
    test_id,
    imca_ref,
    imca_d018,
    maintenance_notes,
    created_at,
    updated_at
FROM certificates
WHERE expiry_date <= $1 AND expiry_date >= NOW()
ORDER BY expiry_date ASC;

-- name: GetExpiringCertificatesWithContext :many
SELECT
    cert.certificate_id,
    cert.certificate_name,
    cert.expiry_date,
    cert.status,
    comp.component_id,
    comp.name AS component_name,
    asset.asset_id,
    asset.name AS asset_name
FROM certificates cert
JOIN components comp ON comp.id = cert.component_ref_id
JOIN assets asset ON asset.id = comp.asset_ref_id
WHERE cert.expiry_date <= $1 AND cert.expiry_date >= NOW()
ORDER BY cert.expiry_date ASC;


-- name: GetAllCertificatesWithContextPaginated :many
SELECT
    cert.certificate_id,
    cert.certificate_name,
    cert.issue_date,
    cert.expiry_date,
    cert.status,
    cert.issuing_authority,
    cert.test_id,
    cert.imca_ref,
    cert.imca_d018,
    cert.maintenance_notes,
    cert.certificate_file,
    comp.component_id,
    comp.name AS component_name,
    asset.asset_id,
    asset.name AS asset_name
FROM certificates cert
JOIN components comp ON comp.id = cert.component_ref_id
JOIN assets asset ON asset.id = comp.asset_ref_id
ORDER BY cert.expiry_date ASC
LIMIT $1 OFFSET $2;

-- name: CountAllCertificatesWithContext :one
SELECT COUNT(*) FROM certificates;

-- name: GetCertificateUploadAuditByCertificateIDPaginated :many
SELECT certificate_id, file_key, file_name, uploaded_by, uploaded_at
FROM certificate_upload_audit
WHERE certificate_id = $1
ORDER BY uploaded_at DESC
LIMIT $2 OFFSET $3;

-- name: CountCertificateUploadAuditByCertificateID :one
SELECT COUNT(*)
FROM certificate_upload_audit
WHERE certificate_id = $1;

-- name: CreatePendingCertificate :one
INSERT INTO certificates (
    component_id, component_ref_id, certificate_name, certificate_file,
    issuing_authority, status, test_id, test_type_ref_id, imca_ref, imca_d018,
    maintenance_notes, created_at, updated_at
)
VALUES (
    $1,
    (SELECT id FROM components WHERE component_id = $1),
    $2,
    '',
    '',
    'PENDING',
    $3,
    (SELECT id FROM test_types WHERE test_id = $3),
    '',
    '',
    '',
    NOW(),
    NOW()
)
RETURNING
    id,
    certificate_id,
    component_id,
    certificate_name,
    issue_date,
    expiry_date,
    certificate_file,
    issuing_authority,
    status,
    test_id,
    imca_ref,
    imca_d018,
    maintenance_notes,
    created_at,
    updated_at;

-- name: FillPendingCertificate :execrows
UPDATE certificates
SET issue_date = $1, expiry_date = $2, issuing_authority = $3,
    imca_ref = $4, imca_d018 = $5, maintenance_notes = $6,
    status = $7, updated_at = NOW()
WHERE certificate_id = $8;

-- name: CreateCertificateUploadAuditEntry :execrows
INSERT INTO certificate_upload_audit (certificate_id, certificate_ref_id, file_key, file_name, uploaded_by, uploaded_at)
VALUES ($1, (SELECT id FROM certificates WHERE certificate_id = $1), $2, $3, $4, NOW());
