
import type { PaginatedResponse } from "../../types/ams";
import type {
  PartUsage, QuarantineRecord, RoutinePlan, StockBalance, StockChange, Store, Technician, WorkOrder, WorkOrderDetail,
} from "../../types/maintenance";
import { apiRequest } from "./client";
import { listQueryString, type ListQuery } from "./list-query";

const BASE = "/v1/maintenance";

function list<T>(path: string, query: ListQuery) {
  return apiRequest<PaginatedResponse<T>>(`${BASE}/${path}?${listQueryString(query)}`);
}

export function maintenanceWrite<T = unknown>(path: string, body?: object, method = "POST") {
  return apiRequest<T>(`${BASE}/${path}`, { method, body: body ? JSON.stringify(body) : undefined });
}

export const listWorkOrders = (query: ListQuery) => list<WorkOrderDetail>("work-orders", query);
export const listPlans = (query: ListQuery) => list<RoutinePlan>("plans", query);
export const listQuarantine = (query: ListQuery) => list<QuarantineRecord>("quarantine", query);
export const listTechnicians = (query: ListQuery) => list<Technician>("technicians", query);
export const listStores = () => apiRequest<Store[]>(`${BASE}/stores`);
export const listStock = (store: string, query: ListQuery) => list<StockBalance>(`stores/${store}/stock`, query);
export const listStockChanges = (store: string, part: string, query: ListQuery) =>
  list<StockChange>(`stores/${store}/stock/${part}/changes`, query);
export const listPartUsage = (query: ListQuery) => list<PartUsage>("usage", query);
export const getWorkOrder = (id: string) => apiRequest<WorkOrderDetail>(`${BASE}/work-orders/${id}`);
export const getQuarantineBlockers = (id: string) => apiRequest<WorkOrder[]>(`${BASE}/quarantine/${id}/blockers`);
