-- name: ClaimNotificationSlot :one
INSERT INTO scheduled_tasks (
    display_id,
    certificate_id,
    type,
    tier,
    status,
    external_task_id,
    idempotency_key,
    sent_at
)
VALUES (
    next_display_id('scheduled_task_display_id_seq'),
    sqlc.arg(certificate_id),
    sqlc.arg(type),
    sqlc.arg(tier),
    'PENDING',
    '',
    sqlc.arg(idempotency_key),
    NOW()
)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING
    task_id,
    display_id,
    certificate_id,
    type,
    tier,
    status,
    sent_at,
    external_task_id,
    idempotency_key;

-- name: FinalizeNotificationSlot :exec
UPDATE scheduled_tasks
SET
    status = 'SENT',
    external_task_id = sqlc.arg(external_task_id),
    sent_at = NOW()
WHERE task_id = sqlc.arg(task_id);

-- name: ReleaseNotificationSlot :exec
DELETE FROM scheduled_tasks
WHERE task_id = $1;

-- name: ReleaseStalePendingSlots :exec
DELETE FROM scheduled_tasks
WHERE status = 'PENDING'
  AND sent_at < NOW() - sqlc.arg(stale_minutes)::int * INTERVAL '1 minute';

-- name: RecordNotificationFailure :exec
INSERT INTO notification_failures (
    certificate_id,
    idempotency_key,
    channel,
    tier,
    error_message
)
VALUES (
    sqlc.arg(certificate_id),
    sqlc.arg(idempotency_key),
    sqlc.arg(channel),
    sqlc.arg(tier),
    sqlc.arg(error_message)
);

-- name: DeleteScheduledTasksByKeyPrefix :execrows
DELETE FROM scheduled_tasks
WHERE certificate_id = sqlc.arg(certificate_id)
  AND idempotency_key LIKE sqlc.arg(idempotency_key);

-- name: GetCertificateNotificationTasksPaginated :many
SELECT
    st.task_id,
    st.display_id,
    st.certificate_id,
    cert.display_id AS certificate_display_id,
    cert.certificate_name,
    cert.expiry_date,
    comp.component_id,
    comp.display_id AS component_display_id,
    comp.name AS component_name,
    asset.asset_id,
    asset.display_id AS asset_display_id,
    asset.name AS asset_name,
    st.type,
    st.tier,
    st.status,
    st.external_task_id,
    st.idempotency_key,
    st.sent_at
FROM scheduled_tasks st
JOIN certificates cert ON cert.certificate_id = st.certificate_id
JOIN components comp ON comp.component_id = cert.component_id
JOIN assets asset ON asset.asset_id = comp.asset_id
WHERE st.idempotency_key LIKE 'cert-expiry:%'
ORDER BY st.sent_at DESC
LIMIT $1 OFFSET $2;

-- name: CountCertificateNotificationTasks :one
SELECT COUNT(*)
FROM scheduled_tasks
WHERE idempotency_key LIKE 'cert-expiry:%';

-- name: GetCertificateNotificationFailuresPaginated :many
SELECT
    nf.id,
    nf.certificate_id,
    cert.display_id AS certificate_display_id,
    cert.certificate_name,
    cert.expiry_date,
    comp.component_id,
    comp.display_id AS component_display_id,
    comp.name AS component_name,
    asset.asset_id,
    asset.display_id AS asset_display_id,
    asset.name AS asset_name,
    nf.idempotency_key,
    nf.channel,
    nf.tier,
    nf.error_message,
    nf.failed_at
FROM notification_failures nf
JOIN certificates cert ON cert.certificate_id = nf.certificate_id
JOIN components comp ON comp.component_id = cert.component_id
JOIN assets asset ON asset.asset_id = comp.asset_id
ORDER BY nf.failed_at DESC
LIMIT $1 OFFSET $2;

-- name: CountCertificateNotificationFailures :one
SELECT COUNT(*) FROM notification_failures;
