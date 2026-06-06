-- name: ClaimNotificationDelivery :one
INSERT INTO notification_deliveries (
    source_type,
    source_id,
    channel,
    tier,
    idempotency_key
)
VALUES (
    sqlc.arg(source_type),
    sqlc.arg(source_id),
    sqlc.arg(channel),
    sqlc.arg(tier),
    sqlc.arg(idempotency_key)
)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING
    delivery_id,
    display_id,
    source_type,
    source_id,
    channel,
    status,
    tier,
    idempotency_key,
    external_id,
    error_message,
    created_at,
    updated_at,
    sent_at,
    failed_at;

-- name: MarkNotificationDeliveryAttemptFailure :exec
UPDATE notification_deliveries
SET
    error_message = sqlc.arg(error_message),
    failed_at = NOW(),
    updated_at = NOW()
WHERE delivery_id = sqlc.arg(delivery_id);

-- name: MarkNotificationDeliveryFailed :exec
UPDATE notification_deliveries
SET
    status = 'FAILED',
    error_message = sqlc.arg(error_message),
    failed_at = NOW(),
    updated_at = NOW()
WHERE delivery_id = sqlc.arg(delivery_id);

-- name: MarkNotificationDeliverySent :exec
UPDATE notification_deliveries
SET
    status = 'SENT',
    external_id = sqlc.arg(external_id),
    error_message = '',
    sent_at = NOW(),
    updated_at = NOW()
WHERE delivery_id = sqlc.arg(delivery_id);

-- name: CountUnresolvedNotificationDeliveryErrors :one
SELECT COUNT(*)
FROM notification_deliveries
WHERE source_type = sqlc.arg(source_type)
  AND source_id = sqlc.arg(source_id)
  AND status != 'SENT'
  AND error_message != '';

-- name: GetCertificateNotificationDeliveriesPaginated :many
SELECT
    nd.delivery_id AS task_id,
    nd.display_id,
    nd.source_type,
    nd.source_id::text AS source_id,
    CASE
        WHEN nd.source_type = 'certificate_expiry' THEN COALESCE(cert.display_id, '')
        WHEN nd.source_type = 'routine_maintenance' THEN COALESCE(ame.display_id, '')
        ELSE ''
    END AS source_display_id,
    (CASE
        WHEN nd.source_type = 'certificate_expiry' THEN COALESCE(cert.certificate_name, '')
        WHEN nd.source_type = 'routine_maintenance' THEN 'Routine maintenance'
        ELSE nd.source_type
    END)::text AS source_name,
    COALESCE(cert.certificate_id::text, '')::text AS certificate_id,
    COALESCE(cert.display_id, '') AS certificate_display_id,
    COALESCE(cert.certificate_name, '') AS certificate_name,
    cert.expiry_date,
    COALESCE(comp.component_id::text, '')::text AS component_id,
    COALESCE(comp.display_id, '') AS component_display_id,
    COALESCE(comp.name, '') AS component_name,
    COALESCE(cert_asset.asset_id::text, maintenance_asset.asset_id::text, '')::text AS asset_id,
    COALESCE(cert_asset.display_id, maintenance_asset.display_id, '') AS asset_display_id,
    COALESCE(cert_asset.name, maintenance_asset.name, '') AS asset_name,
    nd.channel AS type,
    nd.tier,
    nd.status,
    nd.external_id AS external_task_id,
    nd.idempotency_key,
    COALESCE(nd.sent_at, nd.failed_at, nd.created_at) AS sent_at
FROM notification_deliveries nd
LEFT JOIN certificates cert ON nd.source_type = 'certificate_expiry' AND cert.certificate_id = nd.source_id
LEFT JOIN components comp ON comp.component_id = cert.component_id
LEFT JOIN assets cert_asset ON cert_asset.asset_id = comp.asset_id
LEFT JOIN asset_maintenance_events ame ON nd.source_type = 'routine_maintenance' AND ame.maintenance_event_id = nd.source_id
LEFT JOIN assets maintenance_asset ON maintenance_asset.asset_id = ame.asset_id
ORDER BY COALESCE(nd.sent_at, nd.failed_at, nd.created_at) DESC
LIMIT $1 OFFSET $2;

-- name: CountCertificateNotificationDeliveries :one
SELECT COUNT(*)
FROM notification_deliveries;

-- name: GetCertificateNotificationDeliveryFailuresPaginated :many
SELECT
    nd.delivery_id AS id,
    nd.source_type,
    nd.source_id::text AS source_id,
    CASE
        WHEN nd.source_type = 'certificate_expiry' THEN COALESCE(cert.display_id, '')
        WHEN nd.source_type = 'routine_maintenance' THEN COALESCE(ame.display_id, '')
        ELSE ''
    END AS source_display_id,
    (CASE
        WHEN nd.source_type = 'certificate_expiry' THEN COALESCE(cert.certificate_name, '')
        WHEN nd.source_type = 'routine_maintenance' THEN 'Routine maintenance'
        ELSE nd.source_type
    END)::text AS source_name,
    COALESCE(cert.certificate_id::text, '')::text AS certificate_id,
    COALESCE(cert.display_id, '') AS certificate_display_id,
    COALESCE(cert.certificate_name, '') AS certificate_name,
    cert.expiry_date,
    COALESCE(comp.component_id::text, '')::text AS component_id,
    COALESCE(comp.display_id, '') AS component_display_id,
    COALESCE(comp.name, '') AS component_name,
    COALESCE(cert_asset.asset_id::text, maintenance_asset.asset_id::text, '')::text AS asset_id,
    COALESCE(cert_asset.display_id, maintenance_asset.display_id, '') AS asset_display_id,
    COALESCE(cert_asset.name, maintenance_asset.name, '') AS asset_name,
    nd.idempotency_key,
    nd.channel,
    nd.tier,
    nd.error_message,
    COALESCE(nd.failed_at, nd.updated_at) AS failed_at
FROM notification_deliveries nd
LEFT JOIN certificates cert ON nd.source_type = 'certificate_expiry' AND cert.certificate_id = nd.source_id
LEFT JOIN components comp ON comp.component_id = cert.component_id
LEFT JOIN assets cert_asset ON cert_asset.asset_id = comp.asset_id
LEFT JOIN asset_maintenance_events ame ON nd.source_type = 'routine_maintenance' AND ame.maintenance_event_id = nd.source_id
LEFT JOIN assets maintenance_asset ON maintenance_asset.asset_id = ame.asset_id
WHERE nd.status = 'FAILED'
ORDER BY COALESCE(nd.failed_at, nd.updated_at) DESC
LIMIT $1 OFFSET $2;

-- name: CountCertificateNotificationDeliveryFailures :one
SELECT COUNT(*)
FROM notification_deliveries
WHERE status = 'FAILED';

-- name: GetRoutineMaintenanceNotificationDeliveriesForAsset :many
SELECT
    nd.delivery_id,
    nd.source_id AS maintenance_event_id,
    nd.channel,
    nd.status,
    nd.external_id,
    nd.error_message,
    nd.created_at,
    nd.updated_at,
    nd.sent_at,
    nd.failed_at
FROM notification_deliveries nd
JOIN asset_maintenance_events ame ON ame.maintenance_event_id = nd.source_id
WHERE nd.source_type = 'routine_maintenance'
  AND ame.asset_id = $1
ORDER BY COALESCE(nd.sent_at, nd.failed_at, nd.updated_at, nd.created_at) DESC;
