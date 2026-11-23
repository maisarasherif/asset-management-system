
export interface MaintenanceTarget {
  asset_id: string;
  component_id: string | null;
}

export interface WorkOrder extends MaintenanceTarget {
  work_order_id: string;
  display_id: string;
  plan_id: string | null;
  title: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  assignee_id: string | null;
  created_at: string;
  closed_at: string | null;
  completion_notes: string;
  due_hours: number | null;
  due_date: string | null;
}

export interface WorkOrderDetail extends WorkOrder {
  work_type: "INSPECTION" | "MAINTENANCE";
  certificate_id: string | null;
  issuance_id: string | null;
  asset_name: string;
  asset_number: string;
  component_name: string;
  assignee_name: string;
}

export interface RoutinePlan extends MaintenanceTarget {
  plan_id: string;
  asset_name: string;
  component_name: string;
  working_hours: number;
  title: string;
  interval_hours: number | null;
  interval_months: number | null;
  next_due_hours: number | null;
  next_due_date: string | null;
  quarantine_when_due: boolean;
  active: boolean;
}

export interface QuarantineRecord extends MaintenanceTarget {
  quarantine_id: string;
  asset_name: string;
  component_name: string;
  reason: string;
  tagged_at: string;
  tagged_by_name: string;
  released_at: string | null;
  released_by_name: string;
  release_notes: string;
  blocking_orders: number;
}

export interface Store {
  store_id: string;
  project_id: string | null;
  name: string;
}

export interface StockBalance {
  part_id: string;
  part_number: string;
  name: string;
  quantity: number;
  version: number;
}

export interface PartUsage {
  usage_id: string;
  work_order_id: string;
  work_order_number: string;
  asset_id: string;
  asset_name: string;
  store_id: string;
  store_name: string;
  part_id: string;
  part_number: string;
  part_name: string;
  quantity: number;
  version: number;
  actor_name: string;
  recorded_at: string;
}

export interface StockChange {
  change_id: string;
  previous_quantity: number;
  quantity: number;
  reason: string;
  actor_name: string;
  changed_at: string;
}

export interface Technician {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}
