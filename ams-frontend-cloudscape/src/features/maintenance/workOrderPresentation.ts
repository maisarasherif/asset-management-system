
import type { WorkOrderDetail } from "../../types/maintenance";

const dueDateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});

export function workOrderType(order: WorkOrderDetail) {
  return order.work_type === "INSPECTION" ? "Inspection" : "Maintenance";
}

export function workOrderDue(order: WorkOrderDetail) {
  const thresholds = [];
  if (order.due_hours != null) thresholds.push(`${order.due_hours.toLocaleString()} h`);
  if (order.due_date) thresholds.push(dueDateFormat.format(new Date(order.due_date)));
  return thresholds.join(" or ");
}
