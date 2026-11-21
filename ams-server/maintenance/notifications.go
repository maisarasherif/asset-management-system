package maintenance

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func (s Service) notifyDue(ctx context.Context, tx pgx.Tx, q *db.Queries, asset db.Asset, order db.MaintenanceWorkOrder) error {
	var thresholds []string
	if order.DueHours != nil {
		thresholds = append(thresholds, fmt.Sprintf("%d operating hours (current reading %d h)", *order.DueHours, asset.WorkingHours))
	}
	if order.DueDate.Valid {
		thresholds = append(thresholds, order.DueDate.Time.Format("02 Jan 2006"))
	}
	subject := fmt.Sprintf("Routine maintenance %s: %s", order.DisplayID, order.Title)
	target := fmt.Sprintf("%s (%s)", asset.Name, asset.DisplayID)
	if order.ComponentID != nil {
		detail, err := q.GetMaintenanceWorkOrderDetail(ctx, order.WorkOrderID)
		if err != nil {
			return err
		}
		target += " / " + detail.ComponentName
	}
	body := fmt.Sprintf("%s requires %s. Due at %s.", target, order.Title, strings.Join(thresholds, " or "))
	email := os.Getenv("ALERT_RECIPIENT_EMAIL")
	dueAt := time.Now()
	if order.DueDate.Valid && (order.DueHours == nil || asset.WorkingHours < *order.DueHours) {
		year, month, day := order.DueDate.Time.Date()
		dueAt = time.Date(year, month, day, 12, 0, 0, 0, dubai)
	}
	for _, channel := range []string{utils.NotificationChannelEmail, utils.NotificationChannelClickUp} {
		delivery := utils.NotificationDeliveryParams{
			SourceType: utils.NotificationSourceRoutineMaintenance, SourceID: order.WorkOrderID,
			Channel: channel, IdempotencyKey: "routine-maintenance:" + order.WorkOrderID.String() + ":" + channel,
			Tags: []string{"routine-maintenance", strings.ToLower(channel)},
		}
		switch {
		case s.River == nil:
			if err := recordConfigFailure(ctx, q, delivery, "River client is not configured"); err != nil {
				return err
			}
		case channel == utils.NotificationChannelEmail:
			if email == "" {
				if err := recordConfigFailure(ctx, q, delivery, "ALERT_RECIPIENT_EMAIL not set"); err != nil {
					return err
				}
				continue
			}
			if _, err := utils.EnqueueNotificationEmailTx(ctx, tx, s.River, delivery, utils.NotificationEmailArgs{
				ToAddress: email, Subject: subject, Body: body,
			}); err != nil {
				return err
			}
		default:
			if os.Getenv("CLICKUP_API_TOKEN") == "" || os.Getenv("CLICKUP_LIST_ID") == "" {
				if err := recordConfigFailure(ctx, q, delivery, "CLICKUP_API_TOKEN or CLICKUP_LIST_ID not set"); err != nil {
					return err
				}
				continue
			}
			if _, err := utils.EnqueueNotificationClickUpTx(ctx, tx, s.River, delivery, utils.NotificationClickUpArgs{
				Name: subject, Description: body, Priority: 2, DueAt: dueAt,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func recordConfigFailure(ctx context.Context, q *db.Queries, delivery utils.NotificationDeliveryParams, reason string) error {
	slot, err := q.ClaimNotificationDelivery(ctx, db.ClaimNotificationDeliveryParams{
		SourceType: delivery.SourceType, SourceID: delivery.SourceID, Channel: delivery.Channel, IdempotencyKey: delivery.IdempotencyKey,
	})
	if missing(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return q.MarkNotificationDeliveryFailed(ctx, db.MarkNotificationDeliveryFailedParams{DeliveryID: slot.DeliveryID, ErrorMessage: reason})
}
