package maintenance

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
)

var dubai = time.FixedZone("Asia/Dubai", 4*60*60)

func dubaiDate(now time.Time) pgtype.Date {
	year, month, day := now.In(dubai).Date()
	return pgtype.Date{Time: time.Date(year, month, day, 0, 0, 0, 0, time.UTC), Valid: true}
}

func addMonths(date pgtype.Date, months int32) pgtype.Date {
	year, month, day := date.Time.Date()
	first := time.Date(year, month+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1).Day()
	return pgtype.Date{Time: first.AddDate(0, 0, min(day, last)-1), Valid: true}
}

func nextHours(reading int64, interval *int64) (*int64, error) {
	if interval == nil {
		return nil, nil
	}
	if reading > math.MaxInt64-*interval {
		return nil, InputError("Working hours plus interval exceed the supported range")
	}
	next := reading + *interval
	return &next, nil
}

func (s Service) SavePlan(ctx context.Context, id *uuid.UUID, input dto.MaintenancePlanInput) (db.MaintenancePlan, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" || input.IntervalHours == nil && input.IntervalMonths == nil {
		return db.MaintenancePlan{}, InputError("Enter a title and at least one service interval")
	}
	if input.IntervalHours != nil && *input.IntervalHours <= 0 ||
		input.IntervalMonths != nil && (*input.IntervalMonths <= 0 || *input.IntervalMonths > 1200) {
		return db.MaintenancePlan{}, InputError("Intervals must be positive and calendar intervals cannot exceed 1200 months")
	}
	if input.NextDueHours != nil && (input.IntervalHours == nil || *input.NextDueHours < 0) ||
		input.NextDueDate != "" && input.IntervalMonths == nil {
		return db.MaintenancePlan{}, InputError("Enter a due threshold only for a configured interval")
	}
	var date pgtype.Date
	if input.NextDueDate != "" {
		parsed, err := time.Parse(time.DateOnly, input.NextDueDate)
		if err != nil || parsed.Year() < 1 {
			return db.MaintenancePlan{}, InputError("Enter a valid due date")
		}
		date = pgtype.Date{Time: parsed, Valid: true}
	} else if input.IntervalMonths != nil {
		date = addMonths(dubaiDate(time.Now()), *input.IntervalMonths)
	}

	return inTransaction(ctx, s.Pool, func(tx pgx.Tx, q *db.Queries) (db.MaintenancePlan, error) {
		var plan db.MaintenancePlan
		if id != nil {
			existing, err := q.GetMaintenancePlan(ctx, *id)
			if err != nil {
				return plan, err
			}
			input.MaintenanceTarget = dto.MaintenanceTarget{AssetID: existing.AssetID, ComponentID: existing.ComponentID}
		}
		asset, component, err := lockTarget(ctx, q, input.MaintenanceTarget)
		if err != nil {
			return plan, err
		}
		hours := input.NextDueHours
		if hours == nil {
			hours, err = nextHours(asset.WorkingHours, input.IntervalHours)
			if err != nil {
				return plan, err
			}
		}
		if id == nil {
			plan, err = q.CreateMaintenancePlan(ctx, db.CreateMaintenancePlanParams{
				AssetID: asset.AssetID, ComponentID: component, Title: title, IntervalHours: input.IntervalHours,
				IntervalMonths: input.IntervalMonths, NextDueHours: hours, NextDueDate: date,
				QuarantineWhenDue: input.QuarantineWhenDue, Active: input.Active,
			})
		} else {
			plan, err = q.UpdateMaintenancePlan(ctx, db.UpdateMaintenancePlanParams{
				PlanID: *id, Title: title, IntervalHours: input.IntervalHours, IntervalMonths: input.IntervalMonths,
				NextDueHours: hours, NextDueDate: date, QuarantineWhenDue: input.QuarantineWhenDue, Active: input.Active,
			})
		}
		if err != nil {
			return plan, err
		}
		_, err = s.evaluate(ctx, tx, q, asset)
		return plan, err
	})
}

func advancePlan(ctx context.Context, q *db.Queries, id uuid.UUID, reading int64) error {
	plan, err := q.GetMaintenancePlan(ctx, id)
	if err != nil {
		return err
	}
	hours, err := nextHours(reading, plan.IntervalHours)
	if err != nil {
		return err
	}
	var date pgtype.Date
	if plan.IntervalMonths != nil {
		date = addMonths(dubaiDate(time.Now()), *plan.IntervalMonths)
	}
	return q.AdvanceMaintenancePlan(ctx, db.AdvanceMaintenancePlanParams{PlanID: id, NextDueHours: hours, NextDueDate: date})
}

func (s Service) evaluate(ctx context.Context, tx pgx.Tx, q *db.Queries, asset db.Asset) ([]db.MaintenanceWorkOrder, error) {
	plans, err := q.LockDueMaintenancePlans(ctx, db.LockDueMaintenancePlansParams{
		AssetID: asset.AssetID, Today: dubaiDate(time.Now()), WorkingHours: asset.WorkingHours,
	})
	if err != nil {
		return nil, err
	}
	orders := make([]db.MaintenanceWorkOrder, 0, len(plans))
	for _, plan := range plans {
		order, err := q.CreateMaintenanceWorkOrder(ctx, db.CreateMaintenanceWorkOrderParams{
			AssetID: asset.AssetID, ComponentID: plan.ComponentID, PlanID: &plan.PlanID,
			Title: plan.Title, DueHours: plan.NextDueHours, DueDate: plan.NextDueDate,
		})
		if err != nil {
			return nil, err
		}
		if plan.QuarantineWhenDue {
			if _, err := tag(ctx, q, asset.AssetID, plan.ComponentID, "Routine service due: "+plan.Title, nil, &order.WorkOrderID); err != nil {
				return nil, err
			}
		}
		if err := s.notifyDue(ctx, tx, q, asset, order); err != nil {
			return nil, err
		}
		orders = append(orders, order)
	}
	return orders, nil
}

func (s Service) ScanDue(ctx context.Context) error {
	queries := db.New(s.Pool)
	inspectionErr := queries.RefreshInspectionWorkOrders(ctx)
	ids, err := queries.MaintenanceDueAssets(ctx, dubaiDate(time.Now()))
	if err != nil {
		return err
	}
	var failures error
	for _, id := range ids {
		_, err := inTransaction(ctx, s.Pool, func(tx pgx.Tx, q *db.Queries) ([]db.MaintenanceWorkOrder, error) {
			asset, err := q.LockMaintenanceAsset(ctx, id)
			if err != nil {
				return nil, err
			}
			return s.evaluate(ctx, tx, q, asset)
		})
		if err != nil && !missing(err) {
			failures = errors.Join(failures, fmt.Errorf("asset %s: %w", id, err))
		}
	}
	return errors.Join(inspectionErr, failures)
}

func (s Service) StartScanner(ctx context.Context) {
	go func() {
		for ctx.Err() == nil {
			scanCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
			err := s.ScanDue(scanCtx)
			cancel()
			now := time.Now().In(dubai)
			delay := time.Until(time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, dubai))
			if err != nil && ctx.Err() == nil {
				logger.Log.Error().Err(err).Msg("Routine maintenance scan failed")
				delay = min(delay, time.Minute)
			}
			timer := time.NewTimer(delay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
		}
	}()
}
