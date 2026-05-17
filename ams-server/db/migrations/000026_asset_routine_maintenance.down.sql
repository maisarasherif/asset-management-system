DROP INDEX IF EXISTS idx_assets_maintenance_required;
DROP INDEX IF EXISTS idx_asset_maintenance_events_status;
DROP INDEX IF EXISTS idx_asset_maintenance_events_asset_id;
DROP INDEX IF EXISTS idx_asset_maintenance_events_open_required;

DROP SEQUENCE IF EXISTS asset_maintenance_event_display_id_seq;
DROP TABLE IF EXISTS asset_maintenance_events;

ALTER TABLE assets
DROP COLUMN IF EXISTS last_maintenance_completed_hours,
DROP COLUMN IF EXISTS last_maintenance_completed_at,
DROP COLUMN IF EXISTS maintenance_required_at,
DROP COLUMN IF EXISTS next_maintenance_due_hours,
DROP COLUMN IF EXISTS maintenance_interval_hours,
DROP COLUMN IF EXISTS working_hours_note,
DROP COLUMN IF EXISTS working_hours;
