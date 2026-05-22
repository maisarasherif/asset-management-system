DROP INDEX IF EXISTS idx_scheduled_tasks_claim_guard;

ALTER TABLE scheduled_tasks
ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT '';

UPDATE scheduled_tasks
SET idempotency_key = 'legacy:' || task_id::text
WHERE idempotency_key IS NULL;

ALTER TABLE scheduled_tasks
ALTER COLUMN idempotency_key SET NOT NULL;

UPDATE scheduled_tasks
SET status = 'FAILED'
WHERE status = 'IN_PROGRESS';

ALTER TABLE scheduled_tasks
DROP CONSTRAINT IF EXISTS scheduled_tasks_status_check;

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_status_check
CHECK (status IN ('PENDING', 'SENT', 'FAILED'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_tasks_idempotency_key
ON scheduled_tasks(idempotency_key);

CREATE TABLE IF NOT EXISTS notification_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES certificates(certificate_id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    channel TEXT NOT NULL,
    tier TEXT NOT NULL,
    error_message TEXT NOT NULL,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_failures_cert
ON notification_failures(certificate_id);

CREATE INDEX IF NOT EXISTS idx_notification_failures_key
ON notification_failures(idempotency_key);
