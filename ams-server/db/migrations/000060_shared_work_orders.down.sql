
DROP VIEW shared_work_orders;
DROP TRIGGER complete_inspection_on_issuance ON certificate_issuances;
DROP FUNCTION complete_inspection_on_issuance();
DROP TRIGGER refresh_inspection_on_certificate_change ON certificates;
DROP FUNCTION update_inspection_on_certificate_change();
DROP FUNCTION refresh_inspection_work_orders(uuid);
DROP TABLE inspection_work_orders;
DROP SEQUENCE inspection_work_order_number_seq;
