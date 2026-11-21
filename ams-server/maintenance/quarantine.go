package maintenance

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
)

func tag(ctx context.Context, q *db.Queries, assetID uuid.UUID, componentID *uuid.UUID, reason string, actor, orderID *uuid.UUID) (db.MaintenanceQuarantine, error) {
	hold, err := q.FindOpenMaintenanceQuarantine(ctx, db.FindOpenMaintenanceQuarantineParams{AssetID: assetID, ComponentID: componentID})
	if missing(err) {
		hold, err = q.CreateMaintenanceQuarantine(ctx, db.CreateMaintenanceQuarantineParams{
			AssetID: assetID, ComponentID: componentID, Reason: reason, TaggedBy: actor,
		})
	}
	if err == nil && orderID != nil {
		err = q.LinkMaintenanceQuarantineOrder(ctx, db.LinkMaintenanceQuarantineOrderParams{QuarantineID: hold.QuarantineID, WorkOrderID: *orderID})
	}
	return hold, err
}

func (s Service) Tag(ctx context.Context, actor uuid.UUID, input dto.QuarantineInput) (db.MaintenanceQuarantine, error) {
	reason := strings.TrimSpace(input.Reason)
	if reason == "" {
		return db.MaintenanceQuarantine{}, InputError("Enter a reason for quarantine")
	}
	return inTransaction(ctx, s.Pool, func(_ pgx.Tx, q *db.Queries) (db.MaintenanceQuarantine, error) {
		asset, component, err := lockTarget(ctx, q, input.MaintenanceTarget)
		if err != nil {
			return db.MaintenanceQuarantine{}, err
		}
		if input.WorkOrderID != nil {
			order, err := q.GetMaintenanceWorkOrder(ctx, *input.WorkOrderID)
			if err != nil {
				return db.MaintenanceQuarantine{}, err
			}
			if order.AssetID != asset.AssetID || component != nil && (order.ComponentID == nil || *order.ComponentID != *component) || !isOpen(order) {
				return db.MaintenanceQuarantine{}, InputError("Select an open work order for this equipment")
			}
		}
		return tag(ctx, q, asset.AssetID, component, reason, &actor, input.WorkOrderID)
	})
}

func (s Service) Release(ctx context.Context, id, actor uuid.UUID, notes string) (db.MaintenanceQuarantine, error) {
	notes = strings.TrimSpace(notes)
	if notes == "" {
		return db.MaintenanceQuarantine{}, InputError("Enter release notes")
	}
	return inTransaction(ctx, s.Pool, func(_ pgx.Tx, q *db.Queries) (db.MaintenanceQuarantine, error) {
		hold, err := q.GetMaintenanceQuarantine(ctx, id)
		if err != nil {
			return hold, err
		}
		if _, err := q.LockMaintenanceAsset(ctx, hold.AssetID); err != nil {
			return hold, err
		}
		blockers, err := q.GetBlockingMaintenanceWorkOrders(ctx, id)
		if err != nil {
			return hold, err
		}
		if len(blockers) > 0 {
			return hold, Conflict("Complete or resolve all blocking work orders before releasing equipment")
		}
		hold, err = q.ReleaseMaintenanceQuarantine(ctx, db.ReleaseMaintenanceQuarantineParams{QuarantineID: id, ReleasedBy: &actor, ReleaseNotes: notes})
		if missing(err) {
			return hold, Conflict("Equipment was already released")
		}
		return hold, err
	})
}
