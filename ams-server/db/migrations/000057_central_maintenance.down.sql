
DROP TRIGGER guard_component_deployment ON components;
DROP TRIGGER guard_asset_deployment ON assets;
DROP FUNCTION guard_quarantined_deployment();
DROP TABLE maintenance_quarantine_orders;
DROP TABLE maintenance_quarantines;
DROP TABLE maintenance_work_orders;
DELETE FROM display_id_allocators WHERE allocator_name = 'maintenance_work_orders.display_id';
DROP TABLE maintenance_plans;
