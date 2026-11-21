package maintenance

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
)

type Service struct {
	Pool  *pgxpool.Pool
	River *river.Client[pgx.Tx]
}

type InputError string

func (e InputError) Error() string { return string(e) }

type Conflict string

func (e Conflict) Error() string { return string(e) }

func inTransaction[T any](ctx context.Context, pool *pgxpool.Pool, run func(pgx.Tx, *db.Queries) (T, error)) (T, error) {
	var empty T
	tx, err := pool.Begin(ctx)
	if err != nil {
		return empty, err
	}
	defer tx.Rollback(ctx)
	result, err := run(tx, db.New(tx))
	if err != nil {
		return empty, err
	}
	return result, tx.Commit(ctx)
}

// Every workflow that can change equipment availability locks the parent asset first.
func lockTarget(ctx context.Context, q *db.Queries, target dto.MaintenanceTarget) (db.Asset, *uuid.UUID, error) {
	if target.AssetID == uuid.Nil {
		return db.Asset{}, nil, InputError("Select equipment")
	}
	asset, err := q.LockMaintenanceAsset(ctx, target.AssetID)
	if err != nil || target.ComponentID == nil {
		return asset, nil, err
	}
	component, err := q.GetMaintenanceComponent(ctx, *target.ComponentID)
	if err != nil {
		return asset, nil, err
	}
	if component.AssetID != target.AssetID {
		return asset, nil, InputError("Component does not belong to the selected equipment")
	}
	if component.ComponentKind == "SELF" {
		return asset, nil, nil
	}
	return asset, target.ComponentID, nil
}

func (s Service) RaiseWorkOrder(ctx context.Context, actor uuid.UUID, input dto.WorkOrderInput) (db.MaintenanceWorkOrder, error) {
	title, description := strings.TrimSpace(input.Title), strings.TrimSpace(input.Description)
	if title == "" || description == "" {
		return db.MaintenanceWorkOrder{}, InputError("Enter a title and describe the work required")
	}
	return inTransaction(ctx, s.Pool, func(_ pgx.Tx, q *db.Queries) (db.MaintenanceWorkOrder, error) {
		asset, component, err := lockTarget(ctx, q, input.MaintenanceTarget)
		if err != nil {
			return db.MaintenanceWorkOrder{}, err
		}
		order, err := q.CreateMaintenanceWorkOrder(ctx, db.CreateMaintenanceWorkOrderParams{
			AssetID: asset.AssetID, ComponentID: component, Title: title, Description: description, CreatedBy: &actor,
		})
		if err == nil && input.Quarantine {
			_, err = tag(ctx, q, asset.AssetID, component, description, &actor, &order.WorkOrderID)
		}
		return order, err
	})
}

func isOpen(order db.MaintenanceWorkOrder) bool {
	return order.Status == "OPEN" || order.Status == "IN_PROGRESS"
}

func (s Service) WorkOrderAction(ctx context.Context, id, actor uuid.UUID, action string, input dto.WorkOrderAction) (db.MaintenanceWorkOrder, error) {
	return inTransaction(ctx, s.Pool, func(_ pgx.Tx, q *db.Queries) (db.MaintenanceWorkOrder, error) {
		order, err := q.GetMaintenanceWorkOrder(ctx, id)
		if err != nil {
			return order, err
		}
		asset, err := q.LockMaintenanceAsset(ctx, order.AssetID)
		if err != nil {
			return order, err
		}
		order, err = q.LockMaintenanceWorkOrder(ctx, id)
		if err != nil {
			return order, err
		}
		if !isOpen(order) {
			return order, Conflict("This work order is closed")
		}
		notes := strings.TrimSpace(input.Notes)
		switch action {
		case "assign":
			if input.AssigneeID != nil {
				valid, err := q.IsMaintenanceTechnician(ctx, *input.AssigneeID)
				if err != nil {
					return order, err
				}
				if !valid {
					return order, InputError("Select an active AMS staff member")
				}
			}
			err = q.UpdateMaintenanceAssignee(ctx, db.UpdateMaintenanceAssigneeParams{WorkOrderID: id, AssigneeID: input.AssigneeID})
		case "start":
			err = q.StartMaintenanceWorkOrder(ctx, id)
		case "complete", "cancel":
			if notes == "" {
				return order, InputError("Enter notes for closing this work order")
			}
			status := "COMPLETED"
			if action == "cancel" {
				if order.PlanID != nil {
					return order, Conflict("Routine work orders must be completed to advance their service plan")
				}
				status = "CANCELLED"
			}
			if order.PlanID != nil {
				if err := advancePlan(ctx, q, *order.PlanID, asset.WorkingHours); err != nil {
					return order, err
				}
			}
			err = q.CloseMaintenanceWorkOrder(ctx, db.CloseMaintenanceWorkOrderParams{
				WorkOrderID: id, Status: status, ClosedBy: &actor, CompletionNotes: notes,
			})
		default:
			return order, pgx.ErrNoRows
		}
		if err != nil {
			return order, err
		}
		return q.GetMaintenanceWorkOrder(ctx, id)
	})
}

func (s Service) SaveMeter(ctx context.Context, id uuid.UUID, hours int64, note string) ([]db.MaintenanceWorkOrder, error) {
	return inTransaction(ctx, s.Pool, func(tx pgx.Tx, q *db.Queries) ([]db.MaintenanceWorkOrder, error) {
		asset, err := q.LockMaintenanceAsset(ctx, id)
		if err != nil {
			return nil, err
		}
		if hours < asset.WorkingHours {
			return nil, InputError("Working hours cannot be lower than the current counter")
		}
		if err := q.SaveMaintenanceMeter(ctx, db.SaveMaintenanceMeterParams{AssetID: id, WorkingHours: hours, Note: strings.TrimSpace(note)}); err != nil {
			return nil, err
		}
		asset.WorkingHours = hours
		return s.evaluate(ctx, tx, q, asset)
	})
}

func missing(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
