-- name: GetAllCertificatesPaginated :many
SELECT * FROM certificates
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountCertificates :one
SELECT COUNT(*) FROM certificates;

-- name: GetCertificatesByComponentIDPaginated :many
SELECT * FROM certificates
WHERE component_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountCertificatesByComponentID :one
SELECT COUNT(*) FROM certificates WHERE component_id = $1;

-- name: CountCertificatesByTestID :one
SELECT COUNT(*) FROM certificates WHERE test_id = $1;

-- name: GetCertificateByID :one
SELECT * FROM certificates WHERE certificate_id = $1 LIMIT 1;

-- name: CreateCertificate :one
INSERT INTO certificates (certificate_id, component_id, certificate_name, issue_date, expiry_date, certificate_file, issuing_authority, status, test_id, imca_ref, imca_d018, maintenance_notes, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
RETURNING *;

-- name: UpdateCertificate :execrows
UPDATE certificates
SET component_id = $1, certificate_name = $2, issue_date = $3, expiry_date = $4,
    certificate_file = $5, issuing_authority = $6, status = $7, test_id = $8,
    imca_ref = $9, imca_d018 = $10, maintenance_notes = $11, updated_at = NOW()
WHERE certificate_id = $12;

-- name: UpdateCertificateFile :execrows
UPDATE certificates
SET certificate_file = $1, updated_at = NOW()
WHERE certificate_id = $2;

-- name: DeleteCertificate :execrows
DELETE FROM certificates WHERE certificate_id = $1;

-- name: GetExpiringCertificates :many
SELECT * FROM certificates
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
JOIN components comp ON comp.component_id = cert.component_id
JOIN assets asset ON asset.asset_id = comp.asset_id
WHERE cert.expiry_date <= $1 AND cert.expiry_date >= NOW()
ORDER BY cert.expiry_date ASC;
