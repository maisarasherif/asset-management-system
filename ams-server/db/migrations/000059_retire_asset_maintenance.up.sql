
INSERT INTO maintenance_plans (asset_id, title, interval_hours, next_due_hours, quarantine_when_due)
SELECT asset_id, 'Routine service', maintenance_interval_hours, next_maintenance_due_hours, TRUE
FROM assets WHERE maintenance_interval_hours > 0;

INSERT INTO maintenance_quarantines (asset_id, reason, tagged_at)
SELECT asset_id, 'Equipment was marked for maintenance at cutover', COALESCE(maintenance_required_at, NOW())
FROM assets WHERE status = 'MAINTENANCE';

UPDATE assets SET status = COALESCE((
    SELECT CASE WHEN e.previous_asset_status = 'INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END
    FROM asset_maintenance_events e
    WHERE e.asset_id = assets.asset_id AND e.status = 'REQUIRED'
), 'ACTIVE') WHERE status = 'MAINTENANCE';

DO $$
BEGIN
    IF to_regclass('public.river_job') IS NOT NULL THEN
        DELETE FROM river_job j USING asset_maintenance_events e
        WHERE j.args->>'source_type' = 'routine_maintenance'
          AND j.args->>'source_id' = e.maintenance_event_id::text;
    END IF;
END $$;

DELETE FROM notification_deliveries WHERE source_type = 'routine_maintenance';
DELETE FROM display_id_allocators WHERE allocator_name = 'asset_maintenance_events.display_id';
DROP TABLE asset_maintenance_events;
DROP SEQUENCE asset_maintenance_event_display_id_seq;
DROP INDEX idx_assets_maintenance_required;
ALTER TABLE assets DROP COLUMN maintenance_interval_hours, DROP COLUMN next_maintenance_due_hours,
    DROP COLUMN maintenance_required_at, DROP COLUMN last_maintenance_completed_at,
    DROP COLUMN last_maintenance_completed_hours;
ALTER TABLE assets DROP CONSTRAINT assets_status_check;
ALTER TABLE assets ADD CONSTRAINT assets_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'));
