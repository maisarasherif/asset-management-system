
-- Restores legacy schema for rollback. Recover discarded test entries from a backup.
ALTER TABLE assets DROP CONSTRAINT assets_status_check;
ALTER TABLE assets ADD CONSTRAINT assets_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE'));
ALTER TABLE assets
    ADD COLUMN maintenance_interval_hours BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN next_maintenance_due_hours BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN maintenance_required_at TIMESTAMPTZ,
    ADD COLUMN last_maintenance_completed_at TIMESTAMPTZ,
    ADD COLUMN last_maintenance_completed_hours BIGINT NOT NULL DEFAULT 0;

UPDATE assets a SET maintenance_interval_hours = p.interval_hours, next_maintenance_due_hours = p.next_due_hours
FROM maintenance_plans p WHERE p.asset_id = a.asset_id AND p.component_id IS NULL
    AND p.interval_hours IS NOT NULL AND p.title = 'Routine service';
UPDATE assets a SET status = 'MAINTENANCE', maintenance_required_at = q.tagged_at
FROM maintenance_quarantines q WHERE q.asset_id = a.asset_id AND q.component_id IS NULL AND q.released_at IS NULL;

CREATE TABLE asset_maintenance_events (
    maintenance_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL UNIQUE,
    asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    due_at_hours BIGINT NOT NULL,
    triggered_at_hours BIGINT NOT NULL,
    previous_asset_status TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('REQUIRED', 'COMPLETED', 'CANCELLED')),
    completed_at TIMESTAMPTZ,
    completion_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE SEQUENCE asset_maintenance_event_display_id_seq START WITH 1;
CREATE UNIQUE INDEX idx_asset_maintenance_events_open_required ON asset_maintenance_events(asset_id) WHERE status = 'REQUIRED';
CREATE INDEX idx_asset_maintenance_events_asset_id ON asset_maintenance_events(asset_id);
CREATE INDEX idx_asset_maintenance_events_status ON asset_maintenance_events(status);
CREATE INDEX idx_assets_maintenance_required ON assets(status, next_maintenance_due_hours);
