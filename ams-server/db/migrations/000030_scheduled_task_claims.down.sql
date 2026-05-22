DROP INDEX IF EXISTS idx_scheduled_tasks_claim_guard;

UPDATE scheduled_tasks
SET status = 'FAILED'
WHERE status = 'IN_PROGRESS';

ALTER TABLE scheduled_tasks
DROP CONSTRAINT IF EXISTS scheduled_tasks_status_check;

ALTER TABLE scheduled_tasks
ADD CONSTRAINT scheduled_tasks_status_check
CHECK (status IN ('SENT', 'FAILED'));
