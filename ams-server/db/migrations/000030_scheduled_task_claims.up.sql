ALTER TABLE scheduled_tasks
DROP CONSTRAINT IF EXISTS scheduled_tasks_status_check;

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_status_check
CHECK (status IN ('IN_PROGRESS', 'SENT', 'FAILED'));

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_claim_guard
ON scheduled_tasks(certificate_id, type, status, sent_at);
