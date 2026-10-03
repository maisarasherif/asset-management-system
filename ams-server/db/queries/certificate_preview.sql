-- name: GetCertificatePreviewSource :one
SELECT c.certificate_id, c.component_id, c.test_id,
       c.updated_at AS certificate_updated_at, c.issue_date AS current_issue_date,
       c.expiry_date AS current_expiry_date, c.certificate_file AS current_file,
       c.certificate_name, c.imca_ref, c.imca_d018,
       p.display_id AS component_display_id, p.name AS component_name,
       p.serial_number, COALESCE(NULLIF(p.location, ''), a.location)::TEXT AS location,
       a.asset_id, a.name AS equipment_name,
       t.test_name, t.description AS test_description,
       t.requires_renewal, COALESCE(t.validity_duration, 0)::INTEGER AS validity_months
FROM certificates c
JOIN components p ON p.component_id = c.component_id
JOIN assets a ON a.asset_id = p.asset_id
JOIN test_types t ON t.test_id = c.test_id
WHERE c.certificate_id = $1;
