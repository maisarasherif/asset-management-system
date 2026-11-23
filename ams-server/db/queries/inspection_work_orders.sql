
-- name: RefreshInspectionWorkOrders :exec
SELECT refresh_inspection_work_orders();

-- name: StartInspectionWorkOrder :execrows
UPDATE inspection_work_orders SET status = 'IN_PROGRESS'
WHERE work_order_id = $1 AND status IN ('OPEN', 'IN_PROGRESS');
