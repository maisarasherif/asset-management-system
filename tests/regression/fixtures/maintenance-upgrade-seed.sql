
-- Disposable database at migration 000056.
INSERT INTO assets (asset_id, display_id, name, status, working_hours, working_hours_note,
    maintenance_interval_hours, next_maintenance_due_hours, maintenance_required_at)
VALUES
    ('ea000000-0000-4000-8000-000000000001', '9001', 'Due service fixture', 'MAINTENANCE', 110, 'Meter at cutover', 100, 105, '2026-01-01T00:00:00Z'),
    ('ea000000-0000-4000-8000-000000000002', '9002', 'Manual hold fixture', 'MAINTENANCE', 23, '', 0, 0, NULL),
    ('ea000000-0000-4000-8000-000000000003', '9003', 'Future service fixture', 'ACTIVE', 40, '', 100, 170, NULL);

INSERT INTO asset_maintenance_events (maintenance_event_id, display_id, asset_id, due_at_hours, triggered_at_hours,
    previous_asset_status, status, completion_notes)
VALUES
    ('eb000000-0000-4000-8000-000000000001', '9001', 'ea000000-0000-4000-8000-000000000001', 105, 110, 'INACTIVE', 'REQUIRED', ''),
    ('eb000000-0000-4000-8000-000000000002', '9002', 'ea000000-0000-4000-8000-000000000001', 5, 5, 'ACTIVE', 'COMPLETED', 'Test event'),
    ('eb000000-0000-4000-8000-000000000003', '9003', 'ea000000-0000-4000-8000-000000000003', 100, 100, 'ACTIVE', 'CANCELLED', '');

INSERT INTO notification_deliveries (source_type, source_id, channel, idempotency_key)
VALUES
    ('routine_maintenance', 'eb000000-0000-4000-8000-000000000001', 'EMAIL', 'upgrade-test-maintenance'),
    ('certificate_expiry', 'eb000000-0000-4000-8000-000000000001', 'EMAIL', 'upgrade-test-certificate'),
    ('hr_admin_compliance_expiry', 'eb000000-0000-4000-8000-000000000001', 'CLICKUP', 'upgrade-test-hr');

-- Queue rows share worker kinds. Use the payload columns the cleanup migration reads.
CREATE TABLE river_job (id BIGINT PRIMARY KEY, kind TEXT NOT NULL, args JSONB NOT NULL);
INSERT INTO river_job VALUES
    (1, 'notification_email', '{"source_type":"routine_maintenance","source_id":"eb000000-0000-4000-8000-000000000001"}'),
    (2, 'notification_email', '{"source_type":"certificate_expiry","source_id":"eb000000-0000-4000-8000-000000000001"}'),
    (3, 'notification_clickup', '{"source_type":"hr_admin_compliance_expiry","source_id":"eb000000-0000-4000-8000-000000000001"}');
