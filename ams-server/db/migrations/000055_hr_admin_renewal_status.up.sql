CREATE FUNCTION hr_admin_days_until_expiry(expiry timestamptz, as_of timestamptz)
RETURNS integer LANGUAGE sql STABLE STRICT AS $$
    SELECT (expiry AT TIME ZONE 'Asia/Dubai')::date - (as_of AT TIME ZONE 'Asia/Dubai')::date;
$$;

CREATE VIEW hr_admin_renewal_status AS
WITH queue_base AS (
    SELECT
        cr.record_id,
        cr.display_id AS record_display_id,
        cr.subject_type,
        cr.subject_id,
        (CASE
            WHEN cr.subject_type = 'PERSON' THEN COALESCE(p.full_name, '')
            WHEN cr.subject_type = 'VEHICLE' THEN COALESCE(v.plate_number, '')
            WHEN cr.subject_type = 'COMPANY' THEN COALESCE(c.company_name, '')
            ELSE ''
        END)::text AS subject_name,
        crt.record_type_id,
        crt.type_name,
        crv.version_id,
        crv.expiry_date,
        (CASE
            WHEN CARDINALITY(crt.reminder_policy_days) > 0 THEN crt.reminder_policy_days
            ELSE COALESCE(pnc.default_reminder_days, ARRAY[30, 7, 1]::int[])
        END)::int[] AS effective_reminder_days,
        (CASE
            WHEN CARDINALITY(crt.reminder_policy_days) > 0 THEN 'RECORD_TYPE'
            ELSE 'PRODUCT_DEFAULT'
        END)::text AS reminder_policy_source,
        hr_admin_days_until_expiry(crv.expiry_date, NOW())::int AS days_until_expiry
    FROM compliance_records cr
    JOIN compliance_record_types crt ON crt.record_type_id = cr.record_type_id
    JOIN compliance_record_versions crv ON crv.record_id = cr.record_id AND crv.is_current
    LEFT JOIN product_notification_configurations pnc ON pnc.product_key = 'HR_ADMIN'
    LEFT JOIN hr_admin_persons p ON cr.subject_type = 'PERSON' AND p.person_id = cr.subject_id
    LEFT JOIN hr_admin_vehicles v ON cr.subject_type = 'VEHICLE' AND v.vehicle_id = cr.subject_id
    LEFT JOIN hr_admin_companies c ON cr.subject_type = 'COMPANY' AND c.company_id = cr.subject_id
    WHERE cr.status = 'ACTIVE'
      AND crt.active = TRUE
      AND crt.renewal_behavior = 'RENEWABLE'
      AND crv.expiry_date IS NOT NULL
      AND (
        (cr.subject_type = 'PERSON' AND p.status = 'ACTIVE')
        OR (cr.subject_type = 'VEHICLE' AND v.status = 'ACTIVE')
        OR (cr.subject_type = 'COMPANY' AND c.status = 'ACTIVE')
      )
),
queue_classified AS (
    SELECT
        queue_base.*,
        COALESCE((SELECT MAX(day) FROM UNNEST(queue_base.effective_reminder_days) AS day), 0)::int AS max_reminder_days,
        (CASE
            WHEN queue_base.days_until_expiry < 0 THEN 'EXPIRED'
            WHEN queue_base.days_until_expiry = ANY(queue_base.effective_reminder_days) THEN 'DUE_NOW'
            WHEN queue_base.days_until_expiry >= 0
              AND queue_base.days_until_expiry <= COALESCE((SELECT MAX(day) FROM UNNEST(queue_base.effective_reminder_days) AS day), 0) THEN 'UPCOMING'
            ELSE 'OK'
        END)::text AS queue_status
    FROM queue_base
)
SELECT
    record_id,
    record_display_id,
    subject_type,
    subject_id,
    subject_name,
    record_type_id,
    type_name,
    version_id,
    expiry_date,
    days_until_expiry,
    queue_status,
    effective_reminder_days,
    reminder_policy_source,
    max_reminder_days
FROM queue_classified;
