DROP INDEX IF EXISTS idx_notification_failures_key;
DROP INDEX IF EXISTS idx_notification_failures_cert;
DROP TABLE IF EXISTS notification_failures;

DROP INDEX IF EXISTS uq_scheduled_tasks_idempotency_key;

DELETE FROM scheduled_tasks
WHERE status = 'PENDING';

ALTER TABLE scheduled_tasks
DROP CONSTRAINT IF EXISTS scheduled_tasks_status_check;

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_status_check
CHECK (status IN ('IN_PROGRESS', 'SENT', 'FAILED'));

ALTER TABLE scheduled_tasks
DROP COLUMN IF EXISTS idempotency_key,
DROP COLUMN IF EXISTS tier;

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_claim_guard
ON scheduled_tasks(certificate_id, type, status, sent_at);
