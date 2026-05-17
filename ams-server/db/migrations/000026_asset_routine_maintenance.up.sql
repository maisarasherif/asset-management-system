ALTER TABLE assets
ADD COLUMN working_hours BIGINT NOT NULL DEFAULT 0,
ADD COLUMN working_hours_note TEXT NOT NULL DEFAULT '',
ADD COLUMN maintenance_interval_hours BIGINT NOT NULL DEFAULT 0,
ADD COLUMN next_maintenance_due_hours BIGINT NOT NULL DEFAULT 0,
ADD COLUMN maintenance_required_at TIMESTAMPTZ,
ADD COLUMN last_maintenance_completed_at TIMESTAMPTZ,
ADD COLUMN last_maintenance_completed_hours BIGINT NOT NULL DEFAULT 0;

CREATE TABLE asset_maintenance_events (
    maintenance_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL UNIQUE,
    asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    due_at_hours BIGINT NOT NULL,
    triggered_at_hours BIGINT NOT NULL,
    previous_asset_status TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('REQUIRED', 'COMPLETED', 'CANCELLED')),
    clickup_task_id TEXT NOT NULL DEFAULT '',
    notification_error TEXT NOT NULL DEFAULT '',
    notified_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE asset_maintenance_event_display_id_seq START WITH 1;

CREATE UNIQUE INDEX idx_asset_maintenance_events_open_required
ON asset_maintenance_events(asset_id)
WHERE status = 'REQUIRED';

CREATE INDEX idx_asset_maintenance_events_asset_id ON asset_maintenance_events(asset_id);
CREATE INDEX idx_asset_maintenance_events_status ON asset_maintenance_events(status);
CREATE INDEX idx_assets_maintenance_required ON assets(status, next_maintenance_due_hours);
