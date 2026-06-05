DELETE FROM river_job
WHERE kind IN ('certificate_expiry_email', 'certificate_expiry_clickup');

ALTER TABLE asset_maintenance_events
DROP COLUMN IF EXISTS clickup_task_id,
DROP COLUMN IF EXISTS notification_error,
DROP COLUMN IF EXISTS notified_at;

DROP TABLE IF EXISTS notification_failures;
DROP TABLE IF EXISTS scheduled_tasks;
DROP SEQUENCE IF EXISTS scheduled_task_display_id_seq;
