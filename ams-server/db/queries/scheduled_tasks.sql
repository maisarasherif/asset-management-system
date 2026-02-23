-- name: CreateScheduledTask :one
INSERT INTO scheduled_tasks (task_id, certificate_id, type, status, sent_at)
VALUES ($1, $2, $3, $4, NOW())
RETURNING *;

-- name: HasRecentScheduledTask :one
SELECT COUNT(*) FROM scheduled_tasks
WHERE certificate_id = $1
  AND type = $2
  AND status = 'SENT'
  AND sent_at >= NOW() - INTERVAL '6 months';