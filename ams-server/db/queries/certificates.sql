-- name: GetAllCertificatesPaginated :many
SELECT
    certificate_id,
    display_id,
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
    certificate_id,
    display_id,
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
WHERE component_id = sqlc.arg(component_id)
ORDER BY created_at DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountCertificatesByComponentID :one
SELECT COUNT(*)
FROM certificates
WHERE component_id = $1;

-- name: CountCertificatesByTestID :one
SELECT COUNT(*)
FROM certificates
WHERE test_id = $1;

-- name: GetCertificateByID :one
SELECT
    certificate_id,
    display_id,
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
    display_id,
    component_id, certificate_name, issue_date, expiry_date, certificate_file,
    issuing_authority, status, test_id, imca_ref, imca_d018, maintenance_notes, created_at, updated_at
)
VALUES (
    next_display_id('certificate_display_id_seq'),
    sqlc.arg(component_id),
    sqlc.arg(certificate_name),
    sqlc.arg(issue_date),
    sqlc.arg(expiry_date),
    sqlc.arg(certificate_file),
    sqlc.arg(issuing_authority),
    sqlc.arg(status),
    sqlc.arg(test_id),
    sqlc.arg(imca_ref),
    sqlc.arg(imca_d018),
    sqlc.arg(maintenance_notes),
    NOW(),
    NOW()
)
RETURNING
    certificate_id,
    display_id,
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
SET component_id = sqlc.arg(component_id),
    certificate_name = sqlc.arg(certificate_name),
    issue_date = sqlc.arg(issue_date),
    expiry_date = sqlc.arg(expiry_date),
    certificate_file = sqlc.arg(certificate_file),
    issuing_authority = sqlc.arg(issuing_authority),
    status = sqlc.arg(status),
    test_id = sqlc.arg(test_id),
    imca_ref = sqlc.arg(imca_ref),
    imca_d018 = sqlc.arg(imca_d018),
    maintenance_notes = sqlc.arg(maintenance_notes),
    updated_at = NOW()
WHERE certificate_id = sqlc.arg(certificate_id);

-- name: UpdateCertificateFile :execrows
UPDATE certificates
SET certificate_file = sqlc.arg(certificate_file), updated_at = NOW()
WHERE certificate_id = sqlc.arg(certificate_id);

-- name: DeleteCertificate :execrows
DELETE FROM certificates WHERE certificate_id = $1;

-- name: GetExpiringCertificates :many
SELECT
    certificate_id,
    display_id,
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
    cert.certificate_id AS certificate_id,
    cert.display_id AS certificate_display_id,
    cert.certificate_name,
    cert.expiry_date,
    cert.status,
    comp.component_id AS component_id,
    comp.display_id AS component_display_id,
    comp.name AS component_name,
    asset.asset_id AS asset_id,
    asset.display_id AS asset_display_id,
    asset.name AS asset_name
FROM certificates cert
JOIN components comp ON comp.component_id = cert.component_id
JOIN assets asset ON asset.asset_id = comp.asset_id
WHERE cert.expiry_date <= $1 AND cert.expiry_date >= NOW()
ORDER BY cert.expiry_date ASC;

-- name: GetAllCertificatesWithContextPaginated :many
SELECT
    cert.certificate_id AS certificate_id,
    cert.display_id AS certificate_display_id,
    cert.certificate_name,
    cert.issue_date,
    cert.expiry_date,
    cert.status,
    cert.issuing_authority,
    cert.test_id AS test_id,
    cert.imca_ref,
    cert.imca_d018,
    cert.maintenance_notes,
    cert.certificate_file,
    comp.component_id AS component_id,
    comp.display_id AS component_display_id,
    comp.name AS component_name,
    asset.asset_id AS asset_id,
    asset.display_id AS asset_display_id,
    asset.name AS asset_name
FROM certificates cert
JOIN components comp ON comp.component_id = cert.component_id
JOIN assets asset ON asset.asset_id = comp.asset_id
ORDER BY cert.expiry_date ASC
LIMIT $1 OFFSET $2;

-- name: CountAllCertificatesWithContext :one
SELECT COUNT(*) FROM certificates;

-- name: GetAssetComponentCertificateSheetRows :many
SELECT
    asset.asset_id AS asset_id,
    asset.display_id AS asset_display_id,
    asset.name AS asset_name,
    comp.component_id AS component_id,
    comp.display_id AS component_display_id,
    comp.name AS component_name,
    comp.serial_number AS component_serial_number,
    COALESCE(cert.display_id, '') AS certificate_number,
    cert.issue_date,
    cert.expiry_date,
    COALESCE(cert.status, '') AS certificate_status,
    COALESCE(cert.imca_d018, '') AS imca_d018,
    COALESCE(test.test_name, '') AS test_type
FROM components comp
JOIN assets asset ON asset.asset_id = comp.asset_id
JOIN categories cat ON cat.category_id = comp.category_id
LEFT JOIN main_categories mc ON mc.main_category_id = cat.main_category_id
LEFT JOIN template_components tc ON tc.template_component_id = comp.template_component_id
LEFT JOIN certificates cert ON cert.component_id = comp.component_id
LEFT JOIN test_types test ON test.test_id = cert.test_id
LEFT JOIN template_component_tests tct ON tct.template_component_test_id = cert.template_component_test_id
WHERE comp.asset_id = $1
ORDER BY
    CASE WHEN mc.sort_order IS NULL THEN 1 ELSE 0 END,
    mc.sort_order ASC NULLS LAST,
    cat.sort_order ASC,
    tc.position ASC NULLS LAST,
    comp.created_at ASC,
    comp.display_id ASC,
    tct.position ASC NULLS LAST,
    cert.expiry_date ASC NULLS LAST,
    cert.created_at ASC NULLS LAST,
    cert.display_id ASC NULLS LAST;

-- name: GetCertificateUploadAuditByCertificateIDPaginated :many
SELECT
    cua.uuid,
    cua.certificate_id,
    cua.file_key,
    cua.file_name,
    COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), 'Unknown')::text AS uploaded_by_name,
    cua.uploaded_at,
    cua.competent_person_id,
    COALESCE(cp.full_name, '') AS competent_person_name,
    COALESCE(cp.person_type, '') AS competent_person_type,
    cp.competency_category_id,
    COALESCE(cc.category_code, '') AS competency_category_code,
    COALESCE(cc.category_name, '') AS competency_category_name,
    COALESCE(cc.description, '') AS competency_category_description
FROM certificate_upload_audit cua
LEFT JOIN users u ON u.user_id::text = cua.uploaded_by
LEFT JOIN competent_persons cp ON cp.competent_person_id = cua.competent_person_id
LEFT JOIN competency_categories cc ON cc.competency_category_id = cp.competency_category_id
WHERE cua.certificate_id = sqlc.arg(certificate_id)
ORDER BY cua.uploaded_at DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: GetCertificateUploadAuditFileByID :one
SELECT file_key, file_name
FROM certificate_upload_audit
WHERE certificate_id = sqlc.arg(certificate_id)
  AND uuid = sqlc.arg(uuid)
LIMIT 1;

-- name: CountCertificateUploadAuditByCertificateID :one
SELECT COUNT(*)
FROM certificate_upload_audit
WHERE certificate_id = $1;

-- name: CreatePendingCertificate :one
INSERT INTO certificates (
    display_id,
    component_id, certificate_name, certificate_file,
    issuing_authority, status, test_id, imca_ref, imca_d018,
    maintenance_notes, created_at, updated_at
)
VALUES (
    next_display_id('certificate_display_id_seq'),
    sqlc.arg(component_id),
    sqlc.arg(certificate_name),
    '',
    '',
    'PENDING',
    sqlc.arg(test_id),
    '',
    '',
    '',
    NOW(),
    NOW()
)
RETURNING
    certificate_id,
    display_id,
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
INSERT INTO certificate_upload_audit (
    certificate_id,
    file_key,
    file_name,
    uploaded_by,
    competent_person_id,
    uploaded_at
)
VALUES (
    sqlc.arg(certificate_id),
    sqlc.arg(file_key),
    sqlc.arg(file_name),
    sqlc.arg(uploaded_by),
    sqlc.arg(competent_person_id),
    NOW()
);
