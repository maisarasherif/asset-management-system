-- name: GetHRAdminPersonsPaginated :many
SELECT
    person_id,
    display_id,
    person_code,
    full_name,
    department,
    role_title,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at
FROM hr_admin_persons
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountHRAdminPersons :one
SELECT COUNT(*) FROM hr_admin_persons;

-- name: GetHRAdminPersonByID :one
SELECT
    person_id,
    display_id,
    person_code,
    full_name,
    department,
    role_title,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at
FROM hr_admin_persons
WHERE person_id = $1
LIMIT 1;

-- name: CreateHRAdminPerson :one
INSERT INTO hr_admin_persons (
    display_id,
    person_code,
    full_name,
    department,
    role_title
)
VALUES (
    next_display_id('hr_admin_person_display_id_seq'),
    $1, $2, $3, $4
)
RETURNING
    person_id,
    display_id,
    person_code,
    full_name,
    department,
    role_title,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at;

-- name: UpdateHRAdminPerson :execrows
UPDATE hr_admin_persons
SET
    person_code = $1,
    full_name = $2,
    department = $3,
    role_title = $4,
    updated_at = NOW()
WHERE person_id = sqlc.arg(person_id);

-- name: ArchiveHRAdminPerson :execrows
UPDATE hr_admin_persons
SET
    status = 'ARCHIVED',
    archive_reason = sqlc.arg(archive_reason),
    archived_at = NOW(),
    archived_by = sqlc.arg(archived_by),
    updated_at = NOW()
WHERE person_id = sqlc.arg(person_id)
  AND status = 'ACTIVE';

-- name: GetHRAdminVehiclesPaginated :many
SELECT
    vehicle_id,
    display_id,
    plate_number,
    make,
    model,
    vehicle_year,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at
FROM hr_admin_vehicles
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountHRAdminVehicles :one
SELECT COUNT(*) FROM hr_admin_vehicles;

-- name: GetHRAdminVehicleByID :one
SELECT
    vehicle_id,
    display_id,
    plate_number,
    make,
    model,
    vehicle_year,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at
FROM hr_admin_vehicles
WHERE vehicle_id = $1
LIMIT 1;

-- name: CreateHRAdminVehicle :one
INSERT INTO hr_admin_vehicles (
    display_id,
    plate_number,
    make,
    model,
    vehicle_year
)
VALUES (
    next_display_id('hr_admin_vehicle_display_id_seq'),
    $1, $2, $3, $4
)
RETURNING
    vehicle_id,
    display_id,
    plate_number,
    make,
    model,
    vehicle_year,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at;

-- name: UpdateHRAdminVehicle :execrows
UPDATE hr_admin_vehicles
SET
    plate_number = $1,
    make = $2,
    model = $3,
    vehicle_year = $4,
    updated_at = NOW()
WHERE vehicle_id = sqlc.arg(vehicle_id);

-- name: ArchiveHRAdminVehicle :execrows
UPDATE hr_admin_vehicles
SET
    status = 'ARCHIVED',
    archive_reason = sqlc.arg(archive_reason),
    archived_at = NOW(),
    archived_by = sqlc.arg(archived_by),
    updated_at = NOW()
WHERE vehicle_id = sqlc.arg(vehicle_id)
  AND status = 'ACTIVE';

-- name: GetHRAdminCompaniesPaginated :many
SELECT
    company_id,
    display_id,
    company_code,
    company_name,
    company_kind,
    location,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at
FROM hr_admin_companies
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountHRAdminCompanies :one
SELECT COUNT(*) FROM hr_admin_companies;

-- name: GetHRAdminCompanyByID :one
SELECT
    company_id,
    display_id,
    company_code,
    company_name,
    company_kind,
    location,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at
FROM hr_admin_companies
WHERE company_id = $1
LIMIT 1;

-- name: CreateHRAdminCompany :one
INSERT INTO hr_admin_companies (
    display_id,
    company_code,
    company_name,
    company_kind,
    location
)
VALUES (
    next_display_id('hr_admin_company_display_id_seq'),
    $1, $2, $3, $4
)
RETURNING
    company_id,
    display_id,
    company_code,
    company_name,
    company_kind,
    location,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at;

-- name: UpdateHRAdminCompany :execrows
UPDATE hr_admin_companies
SET
    company_code = $1,
    company_name = $2,
    company_kind = $3,
    location = $4,
    updated_at = NOW()
WHERE company_id = sqlc.arg(company_id);

-- name: ArchiveHRAdminCompany :execrows
UPDATE hr_admin_companies
SET
    status = 'ARCHIVED',
    archive_reason = sqlc.arg(archive_reason),
    archived_at = NOW(),
    archived_by = sqlc.arg(archived_by),
    updated_at = NOW()
WHERE company_id = sqlc.arg(company_id)
  AND status = 'ACTIVE';

-- name: GetComplianceRecordTypesPaginated :many
SELECT
    record_type_id,
    display_id,
    subject_type,
    type_name,
    renewal_behavior,
    default_validity_months,
    reminder_policy_days,
    requires_document,
    active,
    description,
    created_at,
    updated_at
FROM compliance_record_types
ORDER BY subject_type ASC, type_name ASC
LIMIT $1 OFFSET $2;

-- name: CountComplianceRecordTypes :one
SELECT COUNT(*) FROM compliance_record_types;

-- name: GetComplianceRecordTypeByID :one
SELECT
    record_type_id,
    display_id,
    subject_type,
    type_name,
    renewal_behavior,
    default_validity_months,
    reminder_policy_days,
    requires_document,
    active,
    description,
    created_at,
    updated_at
FROM compliance_record_types
WHERE record_type_id = $1
LIMIT 1;

-- name: CreateComplianceRecordType :one
INSERT INTO compliance_record_types (
    display_id,
    subject_type,
    type_name,
    renewal_behavior,
    default_validity_months,
    reminder_policy_days,
    requires_document,
    active,
    description
)
VALUES (
    next_display_id('compliance_record_type_display_id_seq'),
    sqlc.arg(subject_type),
    sqlc.arg(type_name),
    sqlc.arg(renewal_behavior),
    sqlc.arg(default_validity_months),
    sqlc.arg(reminder_policy_days)::int[],
    sqlc.arg(requires_document),
    sqlc.arg(active),
    sqlc.arg(description)
)
RETURNING
    record_type_id,
    display_id,
    subject_type,
    type_name,
    renewal_behavior,
    default_validity_months,
    reminder_policy_days,
    requires_document,
    active,
    description,
    created_at,
    updated_at;

-- name: UpdateComplianceRecordType :execrows
UPDATE compliance_record_types
SET
    subject_type = sqlc.arg(subject_type),
    type_name = sqlc.arg(type_name),
    renewal_behavior = sqlc.arg(renewal_behavior),
    default_validity_months = sqlc.arg(default_validity_months),
    reminder_policy_days = sqlc.arg(reminder_policy_days)::int[],
    requires_document = sqlc.arg(requires_document),
    active = sqlc.arg(active),
    description = sqlc.arg(description),
    updated_at = NOW()
WHERE record_type_id = sqlc.arg(record_type_id);

-- name: GetComplianceRecordsPaginated :many
SELECT
    cr.record_id,
    cr.display_id,
    cr.subject_type,
    cr.subject_id,
    CASE
        WHEN cr.subject_type = 'PERSON' THEN COALESCE(p.full_name, '')
        WHEN cr.subject_type = 'VEHICLE' THEN COALESCE(v.plate_number, '')
        WHEN cr.subject_type = 'COMPANY' THEN COALESCE(c.company_name, '')
        ELSE ''
    END::text AS subject_name,
    crt.record_type_id,
    crt.display_id AS record_type_display_id,
    crt.type_name,
    crt.renewal_behavior,
    cr.status,
    cr.archive_reason,
    cr.archived_at,
    cr.archived_by,
    crv.version_id,
    crv.display_id AS version_display_id,
    crv.version_number,
    crv.issue_date,
    crv.expiry_date,
    crv.document_file,
    crv.issuing_authority,
    crv.notes,
    cr.created_at,
    cr.updated_at
FROM compliance_records cr
JOIN compliance_record_types crt ON crt.record_type_id = cr.record_type_id
LEFT JOIN compliance_record_versions crv ON crv.record_id = cr.record_id AND crv.is_current
LEFT JOIN hr_admin_persons p ON cr.subject_type = 'PERSON' AND p.person_id = cr.subject_id
LEFT JOIN hr_admin_vehicles v ON cr.subject_type = 'VEHICLE' AND v.vehicle_id = cr.subject_id
LEFT JOIN hr_admin_companies c ON cr.subject_type = 'COMPANY' AND c.company_id = cr.subject_id
ORDER BY cr.created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountComplianceRecords :one
SELECT COUNT(*) FROM compliance_records;

-- name: GetComplianceRecordByID :one
SELECT
    cr.record_id,
    cr.display_id,
    cr.subject_type,
    cr.subject_id,
    crt.record_type_id,
    crt.type_name,
    crt.renewal_behavior,
    cr.status,
    cr.archive_reason,
    cr.archived_at,
    cr.archived_by,
    cr.created_at,
    cr.updated_at
FROM compliance_records cr
JOIN compliance_record_types crt ON crt.record_type_id = cr.record_type_id
WHERE cr.record_id = $1
LIMIT 1;

-- name: CreateComplianceRecord :one
INSERT INTO compliance_records (
    display_id,
    subject_type,
    subject_id,
    record_type_id
)
VALUES (
    next_display_id('compliance_record_display_id_seq'),
    sqlc.arg(subject_type),
    sqlc.arg(subject_id),
    sqlc.arg(record_type_id)
)
RETURNING
    record_id,
    display_id,
    subject_type,
    subject_id,
    record_type_id,
    status,
    archive_reason,
    archived_at,
    archived_by,
    created_at,
    updated_at;

-- name: ArchiveComplianceRecord :execrows
UPDATE compliance_records
SET
    status = 'ARCHIVED',
    archive_reason = sqlc.arg(archive_reason),
    archived_at = NOW(),
    archived_by = sqlc.arg(archived_by),
    updated_at = NOW()
WHERE record_id = sqlc.arg(record_id)
  AND status = 'ACTIVE';

-- name: SupersedeCurrentComplianceRecordVersion :exec
UPDATE compliance_record_versions
SET
    is_current = FALSE,
    superseded_at = NOW(),
    updated_at = NOW()
WHERE record_id = $1
  AND is_current = TRUE;

-- name: CreateComplianceRecordVersion :one
INSERT INTO compliance_record_versions (
    display_id,
    record_id,
    version_number,
    issue_date,
    expiry_date,
    document_file,
    issuing_authority,
    notes
)
VALUES (
    next_display_id('compliance_record_version_display_id_seq'),
    sqlc.arg(record_id),
    COALESCE((SELECT MAX(version_number) + 1 FROM compliance_record_versions WHERE record_id = sqlc.arg(record_id)), 1),
    sqlc.arg(issue_date),
    sqlc.arg(expiry_date),
    sqlc.arg(document_file),
    sqlc.arg(issuing_authority),
    sqlc.arg(notes)
)
RETURNING
    version_id,
    display_id,
    record_id,
    version_number,
    issue_date,
    expiry_date,
    document_file,
    issuing_authority,
    notes,
    is_current,
    superseded_at,
    created_at,
    updated_at;

-- name: GetComplianceRecordVersions :many
SELECT
    version_id,
    display_id,
    record_id,
    version_number,
    issue_date,
    expiry_date,
    document_file,
    issuing_authority,
    notes,
    is_current,
    superseded_at,
    created_at,
    updated_at
FROM compliance_record_versions
WHERE record_id = $1
ORDER BY version_number DESC;
