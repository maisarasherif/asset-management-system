package maintenance

import (
	"context"
	"math"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
)

func (s Service) SetStockCount(ctx context.Context, actor, store, part uuid.UUID, input dto.StockCountInput) (db.MaintenanceStock, error) {
	reason := strings.TrimSpace(input.Reason)
	if input.Quantity == nil || *input.Quantity < 0 || input.Version == nil || *input.Version < 0 || reason == "" {
		return db.MaintenanceStock{}, InputError("Enter a nonnegative whole count, the current version, and a reason")
	}
	return inTransaction(ctx, s.Pool, func(_ pgx.Tx, q *db.Queries) (db.MaintenanceStock, error) {
		if err := q.EnsureMaintenanceStock(ctx, db.EnsureMaintenanceStockParams{StoreID: store, PartID: part}); err != nil {
			return db.MaintenanceStock{}, err
		}
		stock, err := q.LockMaintenanceStock(ctx, db.LockMaintenanceStockParams{StoreID: store, PartID: part})
		if err != nil {
			return stock, err
		}
		if stock.Version != *input.Version {
			return stock, Conflict("Stock changed since you opened this form. Refresh the count and try again")
		}
		return changeStock(ctx, q, stock, *input.Quantity, db.CreateMaintenanceStockChangeParams{
			ChangeID: uuid.New(), Reason: reason, ChangedBy: &actor,
		})
	})
}

func changeStock(ctx context.Context, q *db.Queries, stock db.MaintenanceStock, quantity int64, log db.CreateMaintenanceStockChangeParams) (db.MaintenanceStock, error) {
	saved, err := q.SaveMaintenanceStock(ctx, db.SaveMaintenanceStockParams{StoreID: stock.StoreID, PartID: stock.PartID, Quantity: quantity})
	if err != nil {
		return saved, err
	}
	log.StoreID, log.PartID = stock.StoreID, stock.PartID
	log.PreviousQuantity, log.Quantity = stock.Quantity, saved.Quantity
	return saved, q.CreateMaintenanceStockChange(ctx, log)
}

func (s Service) RecordUsage(ctx context.Context, actor, orderID uuid.UUID, input dto.PartUsageInput) (db.MaintenancePartUsage, error) {
	if input.RequestID == uuid.Nil || input.StoreID == uuid.Nil || input.PartID == uuid.Nil || input.Quantity <= 0 {
		return db.MaintenancePartUsage{}, InputError("Select a store and part, and enter a positive whole quantity")
	}
	return inTransaction(ctx, s.Pool, func(_ pgx.Tx, q *db.Queries) (db.MaintenancePartUsage, error) {
		order, err := q.LockMaintenanceWorkOrder(ctx, orderID)
		if err != nil {
			return db.MaintenancePartUsage{}, err
		}
		usage, err := q.GetMaintenanceUsage(ctx, input.RequestID)
		if err == nil {
			change, err := q.GetMaintenanceStockChange(ctx, input.RequestID)
			if err != nil {
				return usage, err
			}
			if usage.WorkOrderID != orderID || usage.StoreID != input.StoreID || usage.PartID != input.PartID ||
				change.ChangedBy == nil || *change.ChangedBy != actor || change.ResultingUsage == nil || *change.ResultingUsage != input.Quantity {
				return usage, Conflict("This request ID already belongs to another usage entry")
			}
			return usage, nil
		}
		if !missing(err) {
			return usage, err
		}
		if !isOpen(order) {
			return usage, Conflict("This work order is closed")
		}
		stock, err := q.LockMaintenanceStock(ctx, db.LockMaintenanceStockParams{StoreID: input.StoreID, PartID: input.PartID})
		if missing(err) || err == nil && input.Quantity > stock.Quantity {
			return usage, Conflict("Insufficient stock at the selected store")
		}
		if err != nil {
			return usage, err
		}
		usage, err = q.CreateMaintenanceUsage(ctx, db.CreateMaintenanceUsageParams{
			UsageID: input.RequestID, WorkOrderID: orderID, StoreID: input.StoreID,
			PartID: input.PartID, Quantity: input.Quantity, RecordedBy: &actor,
		})
		if err != nil {
			return usage, err
		}
		_, err = changeStock(ctx, q, stock, stock.Quantity-input.Quantity, db.CreateMaintenanceStockChangeParams{
			ChangeID: input.RequestID, UsageID: &usage.UsageID, ResultingUsage: &input.Quantity, Reason: "Work order usage", ChangedBy: &actor,
		})
		return usage, err
	})
}

func (s Service) CorrectUsage(ctx context.Context, actor, id uuid.UUID, input dto.PartUsageCorrection) (db.MaintenancePartUsage, error) {
	reason := strings.TrimSpace(input.Reason)
	if input.RequestID == uuid.Nil || input.RequestID == id || input.Quantity == nil || *input.Quantity < 0 || input.Version < 1 || reason == "" {
		return db.MaintenancePartUsage{}, InputError("Enter a whole quantity and explain the correction")
	}
	return inTransaction(ctx, s.Pool, func(_ pgx.Tx, q *db.Queries) (db.MaintenancePartUsage, error) {
		usage, err := q.GetMaintenanceUsage(ctx, id)
		if err != nil {
			return usage, err
		}
		order, err := q.LockMaintenanceWorkOrder(ctx, usage.WorkOrderID)
		if err != nil {
			return usage, err
		}
		usage, err = q.GetMaintenanceUsage(ctx, id)
		if err != nil {
			return usage, err
		}
		change, err := q.GetMaintenanceStockChange(ctx, input.RequestID)
		if err == nil {
			if change.UsageID == nil || *change.UsageID != id || change.ChangedBy == nil || *change.ChangedBy != actor ||
				change.ResultingUsage == nil || *change.ResultingUsage != *input.Quantity || change.Reason != reason {
				return usage, Conflict("This request ID already belongs to another change")
			}
			return usage, nil
		}
		if !missing(err) {
			return usage, err
		}
		if !isOpen(order) {
			return usage, Conflict("This work order is closed")
		}
		if usage.Version != input.Version {
			return usage, Conflict("Usage changed since you opened this form. Refresh and try again")
		}
		stock, err := q.LockMaintenanceStock(ctx, db.LockMaintenanceStockParams{StoreID: usage.StoreID, PartID: usage.PartID})
		if err != nil {
			return usage, err
		}
		delta := *input.Quantity - usage.Quantity
		if delta > stock.Quantity {
			return usage, Conflict("Insufficient stock at the original store")
		}
		if delta < 0 && stock.Quantity > math.MaxInt64+delta {
			return usage, Conflict("Correcting this entry would exceed the maximum stock balance")
		}
		usage, err = q.SaveMaintenanceUsage(ctx, db.SaveMaintenanceUsageParams{UsageID: id, Quantity: *input.Quantity})
		if err != nil {
			return usage, err
		}
		_, err = changeStock(ctx, q, stock, stock.Quantity-delta, db.CreateMaintenanceStockChangeParams{
			ChangeID: input.RequestID, UsageID: &id, ResultingUsage: input.Quantity, Reason: reason, ChangedBy: &actor,
		})
		return usage, err
	})
}
