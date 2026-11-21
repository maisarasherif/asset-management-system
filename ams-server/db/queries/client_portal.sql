-- name: GetClientAssetByID :one
SELECT
    a.asset_id,
    a.display_id,
    a.name,
    a.photo,
    a.datasheet,
    a.description,
    a.status,
    a.asset_kind,
    a.location,
    a.assigned_project,
    a.working_hours,
    a.working_hours_note,
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = a.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) AS quarantined,
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
    a.asset_kind,
    a.location,
    a.assigned_project,
    a.working_hours,
    a.working_hours_note,
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = a.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) AS quarantined,
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
  AND strpos(lower(concat_ws(' ', a.display_id, a.name, a.description, a.location, a.assigned_project)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::text = '' OR lower(a.assigned_project) = lower(sqlc.arg(filter_project)))
  AND (sqlc.arg(filter_status)::text = '' OR CASE WHEN sqlc.arg(filter_status) = 'QUARANTINED' THEN EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = a.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) ELSE lower(a.status) = lower(sqlc.arg(filter_status)) AND NOT EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = a.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) END)
ORDER BY a.created_at DESC, a.asset_id
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
  AND u.status = 'ACTIVE'
  AND strpos(lower(concat_ws(' ', a.display_id, a.name, a.description, a.location, a.assigned_project)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_project)::text = '' OR lower(a.assigned_project) = lower(sqlc.arg(filter_project)))
  AND (sqlc.arg(filter_status)::text = '' OR CASE WHEN sqlc.arg(filter_status) = 'QUARANTINED' THEN EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = a.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) ELSE lower(a.status) = lower(sqlc.arg(filter_status)) AND NOT EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = a.asset_id AND q.component_id IS NULL AND q.released_at IS NULL) END);

-- name: GetClientComponentsByAsset :many
SELECT
    c.component_id,
    c.display_id,
    c.asset_id,
    c.category_id,
    c.component_kind,
    c.single_asset_equipment_id,
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
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = c.asset_id AND (q.component_id IS NULL OR q.component_id = c.component_id) AND q.released_at IS NULL) AS quarantined,
    c.assigned_project
FROM components c
LEFT JOIN categories cat ON cat.category_id = c.category_id
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
    test.validity_duration AS test_period_months,
    COALESCE(test.requires_renewal, TRUE)::boolean AS test_requires_renewal,
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

-- name: SearchClientAssetCertificates :many
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
    test.validity_duration AS test_period_months,
    COALESCE(test.requires_renewal, TRUE)::boolean AS test_requires_renewal,
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
  AND strpos(lower(concat_ws(' ', cert.display_id, cert.certificate_name, cert.issuing_authority, c.name, test.test_name)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_status)::text = '' OR sqlc.arg(filter_status) = CASE
      WHEN cert.expiry_date IS NULL THEN COALESCE(NULLIF(cert.status, ''), 'PENDING')
      WHEN (cert.expiry_date AT TIME ZONE 'UTC')::date < sqlc.arg(as_of)::text::date THEN 'EXPIRED'
      WHEN (cert.expiry_date AT TIME ZONE 'UTC')::date <= sqlc.arg(as_of)::text::date + 30 THEN 'EXPIRING_SOON'
      ELSE 'VALID'
  END)
  AND (sqlc.arg(filter_test)::uuid = '00000000-0000-0000-0000-000000000000' OR cert.test_id = sqlc.arg(filter_test))
  AND (sqlc.arg(filter_component)::uuid = '00000000-0000-0000-0000-000000000000' OR c.component_id = sqlc.arg(filter_component))
  AND (sqlc.arg(filter_category)::uuid = '00000000-0000-0000-0000-000000000000' OR c.category_id = sqlc.arg(filter_category) OR c.scope_category_id = sqlc.arg(filter_category))
ORDER BY cert.expiry_date ASC NULLS LAST, cert.created_at DESC, cert.certificate_id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountSearchClientAssetCertificates :one
SELECT COUNT(*)
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
  AND strpos(lower(concat_ws(' ', cert.display_id, cert.certificate_name, cert.issuing_authority, c.name, test.test_name)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_status)::text = '' OR sqlc.arg(filter_status) = CASE
      WHEN cert.expiry_date IS NULL THEN COALESCE(NULLIF(cert.status, ''), 'PENDING')
      WHEN (cert.expiry_date AT TIME ZONE 'UTC')::date < sqlc.arg(as_of)::text::date THEN 'EXPIRED'
      WHEN (cert.expiry_date AT TIME ZONE 'UTC')::date <= sqlc.arg(as_of)::text::date + 30 THEN 'EXPIRING_SOON'
      ELSE 'VALID'
  END)
  AND (sqlc.arg(filter_test)::uuid = '00000000-0000-0000-0000-000000000000' OR cert.test_id = sqlc.arg(filter_test))
  AND (sqlc.arg(filter_component)::uuid = '00000000-0000-0000-0000-000000000000' OR c.component_id = sqlc.arg(filter_component))
  AND (sqlc.arg(filter_category)::uuid = '00000000-0000-0000-0000-000000000000' OR c.category_id = sqlc.arg(filter_category) OR c.scope_category_id = sqlc.arg(filter_category));

-- name: SearchClientAssetComponents :many
SELECT
    c.component_id,
    c.display_id,
    c.asset_id,
    c.category_id,
    c.component_kind,
    c.single_asset_equipment_id,
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
    EXISTS (SELECT 1 FROM maintenance_quarantines q WHERE q.asset_id = c.asset_id AND (q.component_id IS NULL OR q.component_id = c.component_id) AND q.released_at IS NULL) AS quarantined,
    c.assigned_project
FROM components c
LEFT JOIN categories cat ON cat.category_id = c.category_id
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
  AND strpos(lower(concat_ws(' ', c.display_id, c.name, c.serial_number, c.manufacturer, cat.category_name)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_kind)::text = '' OR c.component_kind = sqlc.arg(filter_kind))
  AND (sqlc.arg(filter_category)::uuid = '00000000-0000-0000-0000-000000000000' OR c.category_id = sqlc.arg(filter_category) OR c.scope_category_id = sqlc.arg(filter_category))
ORDER BY c.created_at DESC, c.component_id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountSearchClientAssetComponents :one
SELECT COUNT(*)
FROM components c
LEFT JOIN categories cat ON cat.category_id = c.category_id
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
  AND strpos(lower(concat_ws(' ', c.display_id, c.name, c.serial_number, c.manufacturer, cat.category_name)), lower(sqlc.arg(search_text)::text)) > 0
  AND (sqlc.arg(filter_kind)::text = '' OR c.component_kind = sqlc.arg(filter_kind))
  AND (sqlc.arg(filter_category)::uuid = '00000000-0000-0000-0000-000000000000' OR c.category_id = sqlc.arg(filter_category) OR c.scope_category_id = sqlc.arg(filter_category));

-- name: SearchClientAssetCertificateTypes :many
SELECT DISTINCT test.test_id, test.test_name
FROM test_types test
JOIN certificates cert ON cert.test_id = test.test_id
JOIN components c ON c.component_id = cert.component_id
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
  AND strpos(lower(test.test_name), lower(sqlc.arg(search_text)::text)) > 0
ORDER BY test.test_name, test.test_id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountSearchClientAssetCertificateTypes :one
SELECT COUNT(DISTINCT test.test_id)
FROM test_types test
JOIN certificates cert ON cert.test_id = test.test_id
JOIN components c ON c.component_id = cert.component_id
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
  AND strpos(lower(test.test_name), lower(sqlc.arg(search_text)::text)) > 0;
