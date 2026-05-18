-- name: GetClientAssetByID :one
SELECT
    a.asset_id,
    a.display_id,
    a.name,
    a.photo,
    a.datasheet,
    a.description,
    a.status,
    a.location,
    a.assigned_project,
    a.working_hours,
    a.working_hours_note,
    a.maintenance_interval_hours,
    a.next_maintenance_due_hours,
    a.maintenance_required_at,
    a.last_maintenance_completed_at,
    a.last_maintenance_completed_hours,
    a.template_id,
    a.created_at,
    a.updated_at
FROM assets a
JOIN projects p ON LOWER(TRIM(p.project_name)) = LOWER(TRIM(a.assigned_project))
JOIN user_project_access upa ON upa.project_id = p.project_id
JOIN users u ON u.user_id = upa.user_id
WHERE a.asset_id = sqlc.arg(asset_id)
  AND upa.user_id = sqlc.arg(user_id)
  AND upa.status = 'ACTIVE'
  AND p.status = 'ACTIVE'
  AND u.status = 'ACTIVE'
LIMIT 1;

-- name: GetClientAssetsPaginated :many
SELECT DISTINCT
    a.asset_id,
    a.display_id,
    a.name,
    a.photo,
    a.datasheet,
    a.description,
    a.status,
    a.location,
    a.assigned_project,
    a.working_hours,
    a.working_hours_note,
    a.maintenance_interval_hours,
    a.next_maintenance_due_hours,
    a.maintenance_required_at,
    a.last_maintenance_completed_at,
    a.last_maintenance_completed_hours,
    a.template_id,
    a.created_at,
    a.updated_at
FROM assets a
JOIN projects p ON LOWER(TRIM(p.project_name)) = LOWER(TRIM(a.assigned_project))
JOIN user_project_access upa ON upa.project_id = p.project_id
JOIN users u ON u.user_id = upa.user_id
WHERE upa.user_id = sqlc.arg(user_id)
  AND upa.status = 'ACTIVE'
  AND p.status = 'ACTIVE'
  AND u.status = 'ACTIVE'
ORDER BY a.created_at DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountClientAssets :one
SELECT COUNT(DISTINCT a.asset_id)
FROM assets a
JOIN projects p ON LOWER(TRIM(p.project_name)) = LOWER(TRIM(a.assigned_project))
JOIN user_project_access upa ON upa.project_id = p.project_id
JOIN users u ON u.user_id = upa.user_id
WHERE upa.user_id = sqlc.arg(user_id)
  AND upa.status = 'ACTIVE'
  AND p.status = 'ACTIVE'
  AND u.status = 'ACTIVE';

-- name: GetClientComponentsByAsset :many
SELECT
    c.component_id,
    c.display_id,
    c.asset_id,
    c.category_id,
    COALESCE(mc.main_category_name, '') AS main_category_name,
    COALESCE(cat.category_name, '') AS category_name,
    c.name,
    c.serial_number,
    c.manufacturer,
    c.description,
    c.equipment_type,
    c.structure,
    c.model,
    c.class,
    c.class_code,
    c.safety_critical,
    c.created_at,
    c.updated_at,
    c.location,
    c.assigned_project
FROM components c
JOIN categories cat ON cat.category_id = c.category_id
LEFT JOIN main_categories mc ON mc.main_category_id = cat.main_category_id
WHERE c.asset_id = sqlc.arg(asset_id)
  AND EXISTS (
      SELECT 1
      FROM assets a
      JOIN projects p ON LOWER(TRIM(p.project_name)) = LOWER(TRIM(a.assigned_project))
      JOIN user_project_access upa ON upa.project_id = p.project_id
      JOIN users u ON u.user_id = upa.user_id
      WHERE a.asset_id = c.asset_id
        AND upa.user_id = sqlc.arg(user_id)
        AND upa.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
        AND u.status = 'ACTIVE'
  )
ORDER BY c.created_at DESC;

-- name: GetClientCertificatesByAsset :many
SELECT
    cert.certificate_id,
    cert.display_id,
    cert.component_id,
    cert.certificate_name,
    cert.issue_date,
    cert.expiry_date,
    cert.issuing_authority,
    cert.status,
    cert.test_id,
    COALESCE(test.test_name, '') AS test_name,
    COALESCE(test.validity_duration, 0)::int AS test_period_months,
    cert.imca_ref,
    cert.imca_d018,
    cert.maintenance_notes,
    cert.certificate_file <> '' AS has_file,
    cert.created_at,
    cert.updated_at
FROM certificates cert
JOIN components c ON c.component_id = cert.component_id
LEFT JOIN test_types test ON test.test_id = cert.test_id
WHERE c.asset_id = sqlc.arg(asset_id)
  AND EXISTS (
      SELECT 1
      FROM assets a
      JOIN projects p ON LOWER(TRIM(p.project_name)) = LOWER(TRIM(a.assigned_project))
      JOIN user_project_access upa ON upa.project_id = p.project_id
      JOIN users u ON u.user_id = upa.user_id
      WHERE a.asset_id = c.asset_id
        AND upa.user_id = sqlc.arg(user_id)
        AND upa.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
        AND u.status = 'ACTIVE'
  )
ORDER BY cert.expiry_date ASC NULLS LAST, cert.created_at DESC;

-- name: GetClientCertificateFileForUser :one
SELECT cert.certificate_file
FROM certificates cert
JOIN components c ON c.component_id = cert.component_id
JOIN assets a ON a.asset_id = c.asset_id
JOIN projects p ON LOWER(TRIM(p.project_name)) = LOWER(TRIM(a.assigned_project))
JOIN user_project_access upa ON upa.project_id = p.project_id
JOIN users u ON u.user_id = upa.user_id
WHERE cert.certificate_id = sqlc.arg(certificate_id)
  AND upa.user_id = sqlc.arg(user_id)
  AND upa.status = 'ACTIVE'
  AND p.status = 'ACTIVE'
  AND u.status = 'ACTIVE'
  AND cert.certificate_file <> ''
LIMIT 1;
