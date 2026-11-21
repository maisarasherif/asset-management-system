
DO $$
BEGIN
    IF to_regclass('public.asset_maintenance_events') IS NOT NULL
       OR EXISTS (SELECT 1 FROM maintenance_work_orders)
       OR EXISTS (SELECT 1 FROM maintenance_part_usage) THEN
        RAISE EXCEPTION 'Legacy events survived or appeared in the new registers';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM assets WHERE display_id = '9001' AND status = 'INACTIVE'
                   AND working_hours = 110 AND working_hours_note = 'Meter at cutover')
       OR (SELECT count(*) FROM maintenance_quarantines WHERE released_at IS NULL) <> 2
       OR NOT EXISTS (SELECT 1 FROM maintenance_quarantines WHERE asset_id = 'ea000000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'Equipment state or quarantine was lost';
    END IF;
    IF (SELECT count(*) FROM maintenance_plans) <> 2
       OR NOT EXISTS (SELECT 1 FROM maintenance_plans WHERE asset_id = 'ea000000-0000-4000-8000-000000000001'
                      AND next_due_hours = 105 AND interval_hours = 100 AND quarantine_when_due)
       OR NOT EXISTS (SELECT 1 FROM maintenance_plans WHERE asset_id = 'ea000000-0000-4000-8000-000000000003'
                      AND next_due_hours = 170 AND interval_hours = 100 AND quarantine_when_due) THEN
        RAISE EXCEPTION 'An existing service threshold was changed';
    END IF;
    IF (SELECT array_agg(id ORDER BY id) FROM river_job) IS DISTINCT FROM ARRAY[2,3]::bigint[]
       OR (SELECT array_agg(idempotency_key ORDER BY idempotency_key) FROM notification_deliveries)
          IS DISTINCT FROM ARRAY['upgrade-test-certificate','upgrade-test-hr']::text[] THEN
        RAISE EXCEPTION 'Legacy maintenance cleanup changed the wrong notifications';
    END IF;
    IF (SELECT count(*) FROM maintenance_stores WHERE project_id IS NULL) <> 1 THEN
        RAISE EXCEPTION 'The warehouse was not seeded';
    END IF;
END $$;
SELECT 'Maintenance upgrade rehearsal passed' AS result;
