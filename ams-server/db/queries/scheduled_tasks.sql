-- name: CreateScheduledTask :one
INSERT INTO scheduled_tasks (certificate_id, certificate_ref_id, type, status, external_task_id, sent_at)
VALUES ($1, (SELECT id FROM certificates WHERE certificate_id = $1), $2, $3, $4, NOW())
RETURNING *;

-- name: HasRecentScheduledTask :one
SELECT COUNT(*) FROM scheduled_tasks
WHERE certificate_id = $1
  AND type = $2
  AND status = 'SENT'
  AND sent_at >= NOW() - INTERVAL '6 months';
