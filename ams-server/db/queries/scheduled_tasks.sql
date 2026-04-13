-- name: CreateScheduledTask :one
INSERT INTO scheduled_tasks (display_id, certificate_id, type, status, external_task_id, sent_at)
VALUES (
    next_display_id('scheduled_task_display_id_seq'),
    sqlc.arg(certificate_id),
    sqlc.arg(type),
    sqlc.arg(status),
    sqlc.arg(external_task_id),
    NOW()
)
RETURNING
    task_id,
    display_id,
    certificate_id,
    type,
    status,
    sent_at,
    external_task_id;

-- name: HasRecentScheduledTask :one
SELECT COUNT(*) FROM scheduled_tasks
WHERE certificate_id = sqlc.arg(certificate_id)
  AND type = sqlc.arg(type)
  AND status = 'SENT'
  AND sent_at >= NOW() - INTERVAL '6 months';
