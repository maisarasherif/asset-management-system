package dto

import "github.com/google/uuid"

type MaintenanceTarget struct {
	AssetID     uuid.UUID  `json:"asset_id"`
	ComponentID *uuid.UUID `json:"component_id"`
}

type WorkOrderInput struct {
	MaintenanceTarget
	Title       string `json:"title"`
	Description string `json:"description"`
	Quarantine  bool   `json:"quarantine"`
}

type WorkOrderAction struct {
	AssigneeID *uuid.UUID `json:"assignee_id"`
	Notes      string     `json:"notes"`
}

type MaintenancePlanInput struct {
	MaintenanceTarget
	Title             string `json:"title"`
	IntervalHours     *int64 `json:"interval_hours"`
	IntervalMonths    *int32 `json:"interval_months"`
	NextDueHours      *int64 `json:"next_due_hours"`
	NextDueDate       string `json:"next_due_date"`
	QuarantineWhenDue bool   `json:"quarantine_when_due"`
	Active            bool   `json:"active"`
}

type QuarantineInput struct {
	MaintenanceTarget
	WorkOrderID *uuid.UUID `json:"work_order_id"`
	Reason      string     `json:"reason"`
}

type StockCountInput struct {
	Quantity *int64 `json:"quantity"`
	Version  *int64 `json:"version"`
	Reason   string `json:"reason"`
}

type PartUsageInput struct {
	RequestID uuid.UUID `json:"request_id"`
	StoreID   uuid.UUID `json:"store_id"`
	PartID    uuid.UUID `json:"part_id"`
	Quantity  int64     `json:"quantity"`
}

type PartUsageCorrection struct {
	RequestID uuid.UUID `json:"request_id"`
	Quantity  *int64    `json:"quantity"`
	Version   int64     `json:"version"`
	Reason    string    `json:"reason"`
}
