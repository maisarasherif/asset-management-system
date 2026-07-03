package utils

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/riverqueue/river"
)

const (
	NotificationEmailKind   = "notification_email"
	NotificationClickUpKind = "notification_clickup"

	NotificationSourceCertificateExpiry  = "certificate_expiry"
	NotificationSourceRoutineMaintenance = "routine_maintenance"
	NotificationSourceHRAdminCompliance  = "hr_admin_compliance_expiry"

	NotificationChannelEmail   = "EMAIL"
	NotificationChannelClickUp = "CLICKUP"
)

type NotificationDeliveryParams struct {
	SourceType     string
	SourceID       uuid.UUID
	Channel        string
	Tier           string
	IdempotencyKey string
	Tags           []string
}

type NotificationEmailArgs struct {
	DeliveryID     string `json:"delivery_id"`
	SourceType     string `json:"source_type"`
	SourceID       string `json:"source_id"`
	IdempotencyKey string `json:"idempotency_key"`
	ToAddress      string `json:"to_address"`
	Subject        string `json:"subject"`
	Body           string `json:"body"`
}

func (NotificationEmailArgs) Kind() string {
	return NotificationEmailKind
}

type NotificationClickUpArgs struct {
	DeliveryID     string    `json:"delivery_id"`
	SourceType     string    `json:"source_type"`
	SourceID       string    `json:"source_id"`
	IdempotencyKey string    `json:"idempotency_key"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Priority       int       `json:"priority"`
	DueAt          time.Time `json:"due_at"`
	ListID         string    `json:"list_id,omitempty"`
	Assignees      []int64   `json:"assignees,omitempty"`
}

func (NotificationClickUpArgs) Kind() string {
	return NotificationClickUpKind
}

type NotificationEmailWorker struct {
	river.WorkerDefaults[NotificationEmailArgs]
	pool *pgxpool.Pool
}

func (w *NotificationEmailWorker) Work(ctx context.Context, job *river.Job[NotificationEmailArgs]) error {
	if err := SendHTMLMail(job.Args.ToAddress, job.Args.Subject, job.Args.Body); err != nil {
		w.recordEmailDeliveryFailure(ctx, job, err)
		return fmt.Errorf("notification email delivery failed: %w", err)
	}

	deliveryID, err := uuid.Parse(job.Args.DeliveryID)
	if err != nil {
		return fmt.Errorf("invalid notification delivery id in email job: %w", err)
	}

	queries := db.New(w.pool)
	if err := queries.MarkNotificationDeliverySent(ctx, db.MarkNotificationDeliverySentParams{
		DeliveryID: deliveryID,
		ExternalID: "",
	}); err != nil {
		return fmt.Errorf("failed to finalize notification email delivery: %w", err)
	}

	logger.Log.Info().
		Str("delivery_id", job.Args.DeliveryID).
		Str("source_type", job.Args.SourceType).
		Str("source_id", job.Args.SourceID).
		Str("key", job.Args.IdempotencyKey).
		Str("channel", NotificationChannelEmail).
		Int64("river_job_id", job.ID).
		Msg("notification email sent")

	return nil
}

func (w *NotificationEmailWorker) recordEmailDeliveryFailure(ctx context.Context, job *river.Job[NotificationEmailArgs], sendErr error) {
	w.recordDeliveryFailure(ctx, job.Args.DeliveryID, job.Args.SourceType, job.Args.SourceID, job.Args.IdempotencyKey, NotificationChannelEmail, job.Attempt, job.MaxAttempts, sendErr)
}

type NotificationClickUpWorker struct {
	river.WorkerDefaults[NotificationClickUpArgs]
	pool *pgxpool.Pool
}

func (w *NotificationClickUpWorker) Work(ctx context.Context, job *river.Job[NotificationClickUpArgs]) error {
	assignees := job.Args.Assignees
	if assignees == nil {
		assignees = clickUpAssignees()
	}

	externalID, err := CreateClickUpTaskFromPayloadForList(clickUpTask{
		Name:        job.Args.Name,
		Description: job.Args.Description,
		Priority:    job.Args.Priority,
		DueDate:     job.Args.DueAt.UnixMilli(),
		DueDateTime: false,
		Assignees:   assignees,
	}, job.Args.ListID)
	if err != nil {
		w.recordClickUpDeliveryFailure(ctx, job, err)
		return fmt.Errorf("notification ClickUp task creation failed: %w", err)
	}

	deliveryID, err := uuid.Parse(job.Args.DeliveryID)
	if err != nil {
		return fmt.Errorf("invalid notification delivery id in ClickUp job: %w", err)
	}

	queries := db.New(w.pool)
	if err := queries.MarkNotificationDeliverySent(ctx, db.MarkNotificationDeliverySentParams{
		DeliveryID: deliveryID,
		ExternalID: externalID,
	}); err != nil {
		return fmt.Errorf("failed to finalize notification ClickUp delivery: %w", err)
	}

	logger.Log.Info().
		Str("delivery_id", job.Args.DeliveryID).
		Str("source_type", job.Args.SourceType).
		Str("source_id", job.Args.SourceID).
		Str("key", job.Args.IdempotencyKey).
		Str("channel", NotificationChannelClickUp).
		Str("external_id", externalID).
		Int64("river_job_id", job.ID).
		Msg("notification ClickUp task created")

	return nil
}

func (w *NotificationClickUpWorker) recordClickUpDeliveryFailure(ctx context.Context, job *river.Job[NotificationClickUpArgs], sendErr error) {
	w.recordDeliveryFailure(ctx, job.Args.DeliveryID, job.Args.SourceType, job.Args.SourceID, job.Args.IdempotencyKey, NotificationChannelClickUp, job.Attempt, job.MaxAttempts, sendErr)
}

func (w *NotificationEmailWorker) recordDeliveryFailure(ctx context.Context, deliveryIDRaw, sourceType, sourceIDRaw, key, channel string, attempt, maxAttempts int, sendErr error) {
	recordNotificationDeliveryFailure(ctx, w.pool, deliveryIDRaw, sourceType, sourceIDRaw, key, channel, attempt, maxAttempts, sendErr)
}

func (w *NotificationClickUpWorker) recordDeliveryFailure(ctx context.Context, deliveryIDRaw, sourceType, sourceIDRaw, key, channel string, attempt, maxAttempts int, sendErr error) {
	recordNotificationDeliveryFailure(ctx, w.pool, deliveryIDRaw, sourceType, sourceIDRaw, key, channel, attempt, maxAttempts, sendErr)
}

func recordNotificationDeliveryFailure(ctx context.Context, pool *pgxpool.Pool, deliveryIDRaw, sourceType, sourceIDRaw, key, channel string, attempt, maxAttempts int, sendErr error) {
	deliveryID, err := uuid.Parse(deliveryIDRaw)
	if err != nil {
		logger.Log.Error().Err(err).Str("delivery_id", deliveryIDRaw).Msg("failed to parse notification delivery id")
		return
	}

	queries := db.New(pool)
	if attempt >= maxAttempts {
		err = queries.MarkNotificationDeliveryFailed(ctx, db.MarkNotificationDeliveryFailedParams{
			DeliveryID:   deliveryID,
			ErrorMessage: sendErr.Error(),
		})
	} else {
		err = queries.MarkNotificationDeliveryAttemptFailure(ctx, db.MarkNotificationDeliveryAttemptFailureParams{
			DeliveryID:   deliveryID,
			ErrorMessage: sendErr.Error(),
		})
	}
	if err != nil {
		logger.Log.Error().Err(err).Str("delivery_id", deliveryIDRaw).Msg("failed to record notification delivery failure")
	}

	logger.Log.Error().
		Err(sendErr).
		Str("delivery_id", deliveryIDRaw).
		Str("source_type", sourceType).
		Str("source_id", sourceIDRaw).
		Str("key", key).
		Str("channel", channel).
		Int("attempt", attempt).
		Int("max_attempts", maxAttempts).
		Msg("notification delivery failed")
}

func EnqueueNotificationEmailTx(ctx context.Context, tx pgx.Tx, riverClient *river.Client[pgx.Tx], delivery NotificationDeliveryParams, args NotificationEmailArgs) (bool, error) {
	if err := validateNotificationDelivery(delivery, NotificationChannelEmail); err != nil {
		return false, err
	}
	if riverClient == nil {
		return false, fmt.Errorf("River client is not configured")
	}

	slot, err := db.New(tx).ClaimNotificationDelivery(ctx, db.ClaimNotificationDeliveryParams{
		SourceType:     delivery.SourceType,
		SourceID:       delivery.SourceID,
		Channel:        delivery.Channel,
		Tier:           delivery.Tier,
		IdempotencyKey: delivery.IdempotencyKey,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	args.DeliveryID = slot.DeliveryID.String()
	args.SourceType = delivery.SourceType
	args.SourceID = delivery.SourceID.String()
	args.IdempotencyKey = delivery.IdempotencyKey

	_, err = riverClient.InsertTx(ctx, tx, args, &river.InsertOpts{
		MaxAttempts: 5,
		Queue:       PasswordResetQueue,
		Tags:        delivery.Tags,
	})
	return true, err
}

func EnqueueNotificationClickUpTx(ctx context.Context, tx pgx.Tx, riverClient *river.Client[pgx.Tx], delivery NotificationDeliveryParams, args NotificationClickUpArgs) (bool, error) {
	if err := validateNotificationDelivery(delivery, NotificationChannelClickUp); err != nil {
		return false, err
	}
	if riverClient == nil {
		return false, fmt.Errorf("River client is not configured")
	}

	slot, err := db.New(tx).ClaimNotificationDelivery(ctx, db.ClaimNotificationDeliveryParams{
		SourceType:     delivery.SourceType,
		SourceID:       delivery.SourceID,
		Channel:        delivery.Channel,
		Tier:           delivery.Tier,
		IdempotencyKey: delivery.IdempotencyKey,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	args.DeliveryID = slot.DeliveryID.String()
	args.SourceType = delivery.SourceType
	args.SourceID = delivery.SourceID.String()
	args.IdempotencyKey = delivery.IdempotencyKey

	_, err = riverClient.InsertTx(ctx, tx, args, &river.InsertOpts{
		MaxAttempts: 5,
		Queue:       PasswordResetQueue,
		Tags:        delivery.Tags,
	})
	return true, err
}

func validateNotificationDelivery(delivery NotificationDeliveryParams, expectedChannel string) error {
	if delivery.SourceType == "" {
		return fmt.Errorf("notification source type is required")
	}
	if delivery.SourceID == uuid.Nil {
		return fmt.Errorf("notification source id is required")
	}
	if delivery.Channel != expectedChannel {
		return fmt.Errorf("notification channel must be %s", expectedChannel)
	}
	if delivery.IdempotencyKey == "" {
		return fmt.Errorf("notification idempotency key is required")
	}
	return nil
}
