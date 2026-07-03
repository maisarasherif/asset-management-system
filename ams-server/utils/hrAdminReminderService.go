package utils

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/riverqueue/river"
	"github.com/robfig/cron/v3"
)

var defaultHRAdminReminderPolicy = []int32{30, 7, 1}

type hrAdminReminderCandidate struct {
	RecordID            uuid.UUID
	RecordDisplayID     string
	SubjectName         string
	TypeName            string
	ReminderPolicyDays  []int32
	DefaultReminderDays []int32
	EmailRecipients     string
	ClickupListID       string
	ClickupAssigneeIds  string
	ExpiryDate          pgtype.Timestamptz
}

func HRAdminComplianceReminderEmailMessage(subjectName, recordTypeName, expiryDate, tier string) (string, string) {
	subject := fmt.Sprintf("[HR/Admin %s] Compliance Renewal - %s", tier, recordTypeName)
	body := fmt.Sprintf(`
		<html>
		<body>
			<h2>HR/Admin Compliance Renewal</h2>
			<p>This is an automated reminder that the following company responsibility record is due for renewal:</p>
			<ul>
				<li><strong>Subject:</strong> %s</li>
				<li><strong>Record type:</strong> %s</li>
				<li><strong>Expiry date:</strong> %s</li>
			</ul>
			<p>Please renew the record in HR/Admin before it expires.</p>
			<br>
			<p>Best regards,<br>Asset Management System</p>
		</body>
		</html>
	`, subjectName, recordTypeName, expiryDate)

	return subject, body
}

func HRAdminComplianceReminderClickUpPayload(subjectName, recordTypeName, recordDisplayID string, expiryDate time.Time) clickUpTask {
	dueDate := expiryDate.AddDate(0, 0, -7)
	now := time.Now().In(certificateNotificationLocation)
	if dueDate.Before(now) {
		dueDate = now
	}

	description := fmt.Sprintf(
		"HR/Admin compliance renewal reminder:\n\nSubject: %s\nRecord: %s\nRecord ID: %s\nExpiry Date: %s\n\nPlease renew this company responsibility record before it expires.",
		subjectName,
		recordTypeName,
		recordDisplayID,
		expiryDate.In(certificateNotificationLocation).Format("2006-01-02"),
	)

	return clickUpTask{
		Name:        fmt.Sprintf("HR/Admin Renewal: %s", recordTypeName),
		Description: description,
		Priority:    clickUpPriority(expiryDate),
		DueDate:     dueDate.UnixMilli(),
		DueDateTime: false,
	}
}

func RunHRAdminReminderCheck(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) (int, error) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	rows, err := db.New(pool).GetDueHRAdminComplianceReminderCandidates(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Msg("failed to fetch HR/Admin compliance reminder candidates")
		return 0, err
	}

	candidates := make([]hrAdminReminderCandidate, 0, len(rows))
	for _, row := range rows {
		candidates = append(candidates, hrAdminReminderCandidate{
			RecordID:            row.RecordID,
			RecordDisplayID:     row.RecordDisplayID,
			SubjectName:         row.SubjectName,
			TypeName:            row.TypeName,
			ReminderPolicyDays:  row.ReminderPolicyDays,
			DefaultReminderDays: row.DefaultReminderDays,
			EmailRecipients:     row.EmailRecipients,
			ClickupListID:       row.ClickupListID,
			ClickupAssigneeIds:  row.ClickupAssigneeIds,
			ExpiryDate:          row.ExpiryDate,
		})
	}

	processed := processHRAdminReminderCandidates(ctx, pool, riverClient, candidates)
	logger.Log.Info().
		Int("candidates", len(candidates)).
		Int("processed", processed).
		Msg("HR/Admin compliance reminder check completed")

	return processed, nil
}

func RunHRAdminReminderCheckForRecord(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], recordID uuid.UUID) (int, error) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	rows, err := db.New(pool).GetDueHRAdminComplianceReminderCandidateByRecordID(ctx, recordID)
	if err != nil {
		logger.Log.Error().Err(err).Str("record_id", recordID.String()).Msg("failed to fetch HR/Admin compliance reminder candidate")
		return 0, err
	}

	candidates := make([]hrAdminReminderCandidate, 0, len(rows))
	for _, row := range rows {
		candidates = append(candidates, hrAdminReminderCandidate{
			RecordID:            row.RecordID,
			RecordDisplayID:     row.RecordDisplayID,
			SubjectName:         row.SubjectName,
			TypeName:            row.TypeName,
			ReminderPolicyDays:  row.ReminderPolicyDays,
			DefaultReminderDays: row.DefaultReminderDays,
			EmailRecipients:     row.EmailRecipients,
			ClickupListID:       row.ClickupListID,
			ClickupAssigneeIds:  row.ClickupAssigneeIds,
			ExpiryDate:          row.ExpiryDate,
		})
	}

	return processHRAdminReminderCandidates(ctx, pool, riverClient, candidates), nil
}

func processHRAdminReminderCandidates(ctx context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], candidates []hrAdminReminderCandidate) int {
	processed := 0
	now := time.Now()
	for _, candidate := range candidates {
		if !candidate.ExpiryDate.Valid {
			continue
		}

		expiry := candidate.ExpiryDate.Time
		daysUntilExpiry := daysUntilCertificateExpiry(expiry, now)

		policy := hrAdminReminderPolicy(candidate.ReminderPolicyDays, candidate.DefaultReminderDays)
		tier, ok := hrAdminReminderTierForDays(policy, daysUntilExpiry)
		if !ok {
			continue
		}

		processed++
		notifyHRAdminComplianceReminder(ctx, pool, riverClient, candidate, expiry, tier)
	}

	return processed
}

func notifyHRAdminComplianceReminder(ctx context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], candidate hrAdminReminderCandidate, expiry time.Time, tier string) {
	expiryStr := expiry.In(certificateNotificationLocation).Format("2006-01-02")
	emailRecipients := strings.TrimSpace(candidate.EmailRecipients)
	clickUpListID := strings.TrimSpace(candidate.ClickupListID)

	if emailRecipients == "" {
		recordHRAdminReminderFailure(ctx, pool, candidate, tier, expiryStr, NotificationChannelEmail, "HR/Admin email recipients not configured")
	} else if riverClient == nil {
		recordHRAdminReminderFailure(ctx, pool, candidate, tier, expiryStr, NotificationChannelEmail, "River client is not configured")
	} else {
		enqueueHRAdminReminderEmail(ctx, pool, riverClient, candidate, tier, expiryStr, emailRecipients)
	}

	if os.Getenv("CLICKUP_API_TOKEN") == "" || clickUpListID == "" {
		recordHRAdminReminderFailure(ctx, pool, candidate, tier, expiryStr, NotificationChannelClickUp, "CLICKUP_API_TOKEN or HR/Admin ClickUp list ID not set")
	} else if riverClient == nil {
		recordHRAdminReminderFailure(ctx, pool, candidate, tier, expiryStr, NotificationChannelClickUp, "River client is not configured")
	} else {
		enqueueHRAdminReminderClickUp(ctx, pool, riverClient, candidate, tier, expiry, clickUpListID)
	}
}

func recordHRAdminReminderFailure(parent context.Context, pool *pgxpool.Pool, candidate hrAdminReminderCandidate, tier, expiryStr, channel, errorMessage string) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	key := buildHRAdminReminderIdempotencyKey(candidate.RecordID.String(), expiryStr, tier, channel)
	tx, err := pool.Begin(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to begin HR/Admin reminder failure transaction")
		return
	}
	defer tx.Rollback(ctx)

	queries := db.New(tx)
	delivery, err := queries.ClaimNotificationDelivery(ctx, db.ClaimNotificationDeliveryParams{
		SourceType:     NotificationSourceHRAdminCompliance,
		SourceID:       candidate.RecordID,
		Channel:        channel,
		Tier:           tier,
		IdempotencyKey: key,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return
	}
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to claim HR/Admin failed notification delivery")
		return
	}

	if err := queries.MarkNotificationDeliveryFailed(ctx, db.MarkNotificationDeliveryFailedParams{
		DeliveryID:   delivery.DeliveryID,
		ErrorMessage: errorMessage,
	}); err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to mark HR/Admin notification delivery failed")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to commit HR/Admin notification failure")
	}
}

func enqueueHRAdminReminderEmail(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], candidate hrAdminReminderCandidate, tier, expiryStr, recipients string) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	key := buildHRAdminReminderIdempotencyKey(candidate.RecordID.String(), expiryStr, tier, NotificationChannelEmail)
	tx, err := pool.Begin(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to begin HR/Admin email enqueue transaction")
		return
	}
	defer tx.Rollback(ctx)

	subject, body := HRAdminComplianceReminderEmailMessage(candidate.SubjectName, candidate.TypeName, expiryStr, tier)
	inserted, err := EnqueueNotificationEmailTx(ctx, tx, riverClient, NotificationDeliveryParams{
		SourceType:     NotificationSourceHRAdminCompliance,
		SourceID:       candidate.RecordID,
		Channel:        NotificationChannelEmail,
		Tier:           tier,
		IdempotencyKey: key,
		Tags:           []string{"hr-admin-compliance-expiry", "email"},
	}, NotificationEmailArgs{
		ToAddress: recipients,
		Subject:   subject,
		Body:      body,
	})
	if !inserted && err == nil {
		return
	}
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to enqueue HR/Admin reminder email")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to commit HR/Admin email enqueue")
	}
}

func enqueueHRAdminReminderClickUp(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], candidate hrAdminReminderCandidate, tier string, expiry time.Time, listID string) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	expiryStr := expiry.In(certificateNotificationLocation).Format("2006-01-02")
	key := buildHRAdminReminderIdempotencyKey(candidate.RecordID.String(), expiryStr, tier, NotificationChannelClickUp)
	tx, err := pool.Begin(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to begin HR/Admin ClickUp enqueue transaction")
		return
	}
	defer tx.Rollback(ctx)

	clickUpPayload := HRAdminComplianceReminderClickUpPayload(candidate.SubjectName, candidate.TypeName, candidate.RecordDisplayID, expiry)
	inserted, err := EnqueueNotificationClickUpTx(ctx, tx, riverClient, NotificationDeliveryParams{
		SourceType:     NotificationSourceHRAdminCompliance,
		SourceID:       candidate.RecordID,
		Channel:        NotificationChannelClickUp,
		Tier:           tier,
		IdempotencyKey: key,
		Tags:           []string{"hr-admin-compliance-expiry", "clickup"},
	}, NotificationClickUpArgs{
		Name:        clickUpPayload.Name,
		Description: clickUpPayload.Description,
		Priority:    clickUpPayload.Priority,
		DueAt:       time.UnixMilli(clickUpPayload.DueDate),
		ListID:      listID,
		Assignees:   parseClickUpAssigneeIDs(candidate.ClickupAssigneeIds),
	})
	if !inserted && err == nil {
		return
	}
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to enqueue HR/Admin reminder ClickUp task")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to commit HR/Admin ClickUp enqueue")
	}
}

func runHRAdminReminderCheck(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) {
	if _, err := RunHRAdminReminderCheck(context.Background(), pool, riverClient); err != nil {
		logger.Log.Error().Err(err).Msg("HR/Admin compliance reminder check failed")
	}
}

func buildHRAdminReminderIdempotencyKey(recordID, expiryDate, tier, channel string) string {
	return fmt.Sprintf("hr-admin-compliance-expiry:%s:%s:%s:%s", recordID, expiryDate, tier, channel)
}

func hrAdminReminderPolicy(recordPolicy, defaultPolicy []int32) []int32 {
	if len(recordPolicy) > 0 {
		return recordPolicy
	}
	if len(defaultPolicy) > 0 {
		return defaultPolicy
	}
	return defaultHRAdminReminderPolicy
}

func hrAdminReminderTierForDays(policy []int32, daysUntilExpiry int) (string, bool) {
	if daysUntilExpiry < 0 {
		return "expired", true
	}

	ordered := append([]int32(nil), policy...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i] < ordered[j] })
	for _, day := range ordered {
		if daysUntilExpiry <= int(day) {
			return fmt.Sprintf("%dd", day), true
		}
	}
	return "", false
}

func parseClickUpAssigneeIDs(raw string) []int64 {
	parts := strings.Split(raw, ",")
	ids := make([]int64, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		id, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids
}

func StartHRAdminReminderScheduler(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) {
	go runHRAdminReminderCheck(pool, riverClient)

	c := cron.New()

	schedule := os.Getenv("HR_ADMIN_REMINDER_CRON_SCHEDULE")
	if schedule == "" {
		schedule = "0 8 * * *"
	}

	_, err := c.AddFunc(schedule, func() {
		logger.Log.Info().Msg("running HR/Admin compliance reminder check")
		runHRAdminReminderCheck(pool, riverClient)
	})
	if err != nil {
		logger.Log.Error().Err(err).Msg("failed to register HR/Admin reminder cron job")
		return
	}

	c.Start()
	logger.Log.Info().Str("schedule", schedule).Msg("HR/Admin compliance reminder scheduler started")
}
