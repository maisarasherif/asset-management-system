package utils

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/robfig/cron/v3"
	"gopkg.in/gomail.v2"
)

const stalePendingNotificationMinutes = 10

var certificateNotificationLocation = time.FixedZone("UTC+4", 4*60*60)

type NotificationTier struct {
	Name      string
	MaxDays   int
	Label     string
	EmailText string
}

var notificationTiers = []NotificationTier{
	{Name: "expired", MaxDays: -1, Label: "Expired", EmailText: "has expired"},
	{Name: "1d", MaxDays: 1, Label: "less than 1 day", EmailText: "is expiring in less than 1 day"},
	{Name: "7d", MaxDays: 7, Label: "less than 7 days", EmailText: "is expiring in less than 7 days"},
	{Name: "30d", MaxDays: 30, Label: "less than 30 days", EmailText: "is expiring in less than 30 days"},
}

func sendEmail(recipientEmail, recipientName, assetName, componentName, certificateName, expiryDate, tierLabel, timingText string) error {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPortStr := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	fromEmail := os.Getenv("FROM_EMAIL")

	if smtpHost == "" || smtpPortStr == "" || smtpUser == "" || smtpPassword == "" || fromEmail == "" {
		return fmt.Errorf("SMTP configuration is incomplete")
	}

	smtpPort, err := strconv.Atoi(smtpPortStr)
	if err != nil {
		return fmt.Errorf("invalid SMTP port: %v", err)
	}

	m := gomail.NewMessage()
	m.SetHeader("From", fromEmail)
	m.SetHeader("To", recipientEmail)
	m.SetHeader("Subject", fmt.Sprintf("[%s] Certificate Expiry Alert - %s", tierLabel, certificateName))

	body := fmt.Sprintf(`
		<html>
		<body>
			<h2>Certificate Expiry Alert</h2>
			<p>Dear %s,</p>
			<p>This is an automated notification that the following certificate %s:</p>
			<ul>
				<li><strong>Asset:</strong> %s</li>
				<li><strong>Component:</strong> %s</li>
				<li><strong>Certificate:</strong> %s</li>
				<li><strong>Expiry Date:</strong> %s</li>
			</ul>
			<p>Please take necessary action to renew this certificate.</p>
			<br>
			<p>Best regards,<br>Asset Management System</p>
		</body>
		</html>
	`, recipientName, timingText, assetName, componentName, certificateName, expiryDate)

	m.SetBody("text/html", body)

	d := gomail.NewDialer(smtpHost, smtpPort, smtpUser, smtpPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	return nil
}

func SendRoutineMaintenanceEmail(recipientEmail, recipientName, assetName, assetDisplayID string, workingHours, dueAtHours int64) error {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPortStr := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	fromEmail := os.Getenv("FROM_EMAIL")

	if smtpHost == "" || smtpPortStr == "" || smtpUser == "" || smtpPassword == "" || fromEmail == "" {
		return fmt.Errorf("SMTP configuration is incomplete")
	}

	smtpPort, err := strconv.Atoi(smtpPortStr)
	if err != nil {
		return fmt.Errorf("invalid SMTP port: %v", err)
	}

	m := gomail.NewMessage()
	m.SetHeader("From", fromEmail)
	m.SetHeader("To", recipientEmail)
	m.SetHeader("Subject", "Routine Maintenance Required - "+assetName)

	body := fmt.Sprintf(`
		<html>
		<body>
			<h2>Routine Maintenance Required</h2>
			<p>Dear %s,</p>
			<p>This is an automated notification that the following asset has reached its routine maintenance target:</p>
			<ul>
				<li><strong>Asset:</strong> %s</li>
				<li><strong>Asset ID:</strong> %s</li>
				<li><strong>Current Working Hours:</strong> %d</li>
				<li><strong>Maintenance Due At:</strong> %d</li>
			</ul>
			<p>Please arrange routine maintenance and complete the maintenance record in the Asset Management System.</p>
			<br>
			<p>Best regards,<br>Asset Management System</p>
		</body>
		</html>
	`, recipientName, assetName, assetDisplayID, workingHours, dueAtHours)

	m.SetBody("text/html", body)

	d := gomail.NewDialer(smtpHost, smtpPort, smtpUser, smtpPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	return nil
}

func SendHTMLMail(recipientEmail, subject, body string) error {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPortStr := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	fromEmail := os.Getenv("FROM_EMAIL")

	if smtpHost == "" || smtpPortStr == "" || smtpUser == "" || smtpPassword == "" || fromEmail == "" {
		return fmt.Errorf("SMTP configuration is incomplete")
	}

	smtpPort, err := strconv.Atoi(smtpPortStr)
	if err != nil {
		return fmt.Errorf("invalid SMTP port: %v", err)
	}

	m := gomail.NewMessage()
	m.SetHeader("From", fromEmail)
	m.SetHeader("To", recipientEmail)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", body)

	d := gomail.NewDialer(smtpHost, smtpPort, smtpUser, smtpPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	return nil
}

func notifyExpiring(ctx context.Context, pool *pgxpool.Pool, cert db.GetExpiringCertificatesWithContextRow, recipientEmail, recipientName string) {
	if cert.ExpiryDate == nil {
		logger.Log.Warn().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Msg("certificate has no expiry date, skipping expiry notification")
		return
	}

	daysUntilExpiry := daysUntilCertificateExpiry(*cert.ExpiryDate, time.Now())
	tier, ok := notificationTierForDays(daysUntilExpiry)
	if !ok {
		return
	}

	expiryStr := formatCertificateExpiryDate(*cert.ExpiryDate)
	if recipientEmail == "" {
		logger.Log.Warn().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("tier", tier.Name).
			Msg("ALERT_RECIPIENT_EMAIL not set, skipping expiry email")
	} else {
		notifyChannel(ctx, pool, cert, recipientEmail, recipientName, tier, expiryStr, "EMAIL")
	}

	if !clickUpConfigured() {
		logger.Log.Warn().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("tier", tier.Name).
			Msg("ClickUp configuration not set, skipping expiry ClickUp task")
		return
	}

	notifyChannel(ctx, pool, cert, recipientEmail, recipientName, tier, expiryStr, "CLICKUP")
}

func notifyChannel(parent context.Context, pool *pgxpool.Pool, cert db.GetExpiringCertificatesWithContextRow, recipientEmail, recipientName string, tier NotificationTier, expiryStr, channel string) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	queries := db.New(pool)
	key := buildIdempotencyKey(cert.CertificateID.String(), expiryStr, tier.Name, channel)

	slot, err := queries.ClaimNotificationSlot(ctx, db.ClaimNotificationSlotParams{
		CertificateID:  cert.CertificateID,
		Type:           channel,
		Tier:           tier.Name,
		IdempotencyKey: key,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		logger.Log.Info().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", channel).
			Str("tier", tier.Name).
			Msg("notification slot already claimed, skipping")
		return
	}
	if err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", channel).
			Str("tier", tier.Name).
			Msg("failed to claim notification slot")
		return
	}

	externalTaskID, sendErr := sendNotificationChannel(channel, cert, recipientEmail, recipientName, tier, expiryStr)
	if sendErr != nil {
		releaseNotificationSlot(ctx, queries, slot.TaskID, key, cert, channel, tier.Name)
		recordNotificationFailure(ctx, queries, cert, key, channel, tier.Name, sendErr)
		logger.Log.Error().
			Err(sendErr).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", channel).
			Str("tier", tier.Name).
			Msg("notification send failed, slot released for retry")
		return
	}

	if err := queries.FinalizeNotificationSlot(ctx, db.FinalizeNotificationSlotParams{
		TaskID:         slot.TaskID,
		ExternalTaskID: externalTaskID,
	}); err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", channel).
			Str("tier", tier.Name).
			Msg("failed to finalize notification slot")
		return
	}

	logger.Log.Info().
		Str("certificate_id", cert.CertificateID.String()).
		Str("certificate", cert.CertificateName).
		Str("key", key).
		Str("channel", channel).
		Str("tier", tier.Name).
		Str("external_task_id", externalTaskID).
		Msg("notification sent")
}

func sendNotificationChannel(channel string, cert db.GetExpiringCertificatesWithContextRow, recipientEmail, recipientName string, tier NotificationTier, expiryStr string) (string, error) {
	switch channel {
	case "EMAIL":
		return "", sendEmail(
			recipientEmail,
			recipientName,
			cert.AssetName,
			cert.ComponentName,
			cert.CertificateName,
			expiryStr,
			tier.Label,
			tier.EmailText,
		)
	case "CLICKUP":
		return CreateClickUpTask(cert.CertificateName, cert.AssetName, cert.ComponentName, *cert.ExpiryDate)
	default:
		return "", fmt.Errorf("unsupported notification channel %q", channel)
	}
}

func releaseNotificationSlot(ctx context.Context, queries *db.Queries, taskID uuid.UUID, key string, cert db.GetExpiringCertificatesWithContextRow, channel, tier string) {
	if err := queries.ReleaseNotificationSlot(ctx, taskID); err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", channel).
			Str("tier", tier).
			Msg("failed to release notification slot")
	}
}

func recordNotificationFailure(ctx context.Context, queries *db.Queries, cert db.GetExpiringCertificatesWithContextRow, key, channel, tier string, sendErr error) {
	if err := queries.RecordNotificationFailure(ctx, db.RecordNotificationFailureParams{
		CertificateID:  cert.CertificateID,
		IdempotencyKey: key,
		Channel:        channel,
		Tier:           tier,
		ErrorMessage:   sendErr.Error(),
	}); err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", channel).
			Str("tier", tier).
			Msg("failed to record notification failure")
	}
}

func runExpiryCheck(pool *pgxpool.Pool) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	queries := db.New(pool)
	if err := queries.ReleaseStalePendingSlots(ctx, stalePendingNotificationMinutes); err != nil {
		logger.Log.Error().Err(err).Msg("failed to release stale pending notification slots")
	}

	recipientEmail := os.Getenv("ALERT_RECIPIENT_EMAIL")
	recipientName := os.Getenv("ALERT_RECIPIENT_NAME")
	if recipientName == "" {
		recipientName = "Maintenance team"
	}

	daysThreshold := 30
	if daysThresholdStr := os.Getenv("EXPIRY_ALERT_DAYS"); daysThresholdStr != "" {
		if threshold, err := strconv.Atoi(daysThresholdStr); err == nil {
			daysThreshold = threshold
		}
	}

	thresholdDate := time.Now().In(certificateNotificationLocation).AddDate(0, 0, daysThreshold)
	certificates, err := queries.GetExpiringCertificatesWithContext(ctx, &thresholdDate)
	if err != nil {
		logger.Log.Error().Err(err).Msg("failed to fetch expiring certificates")
		return
	}

	if len(certificates) == 0 {
		logger.Log.Info().Msg("no expiring certificates found")
		return
	}

	logger.Log.Info().
		Int("count", len(certificates)).
		Msg("found expiring certificates, processing notifications")

	for _, cert := range certificates {
		notifyExpiring(context.Background(), pool, cert, recipientEmail, recipientName)
	}
}

func buildIdempotencyKey(certID, expiryDate, tier, channel string) string {
	return fmt.Sprintf("cert-expiry:%s:%s:%s:%s", certID, expiryDate, tier, channel)
}

func formatCertificateExpiryDate(expiry time.Time) string {
	return expiry.In(certificateNotificationLocation).Format("2006-01-02")
}

func daysUntilCertificateExpiry(expiry time.Time, now time.Time) int {
	expiryLocal := expiry.In(certificateNotificationLocation)
	nowLocal := now.In(certificateNotificationLocation)
	expiryDate := time.Date(expiryLocal.Year(), expiryLocal.Month(), expiryLocal.Day(), 0, 0, 0, 0, certificateNotificationLocation)
	today := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, certificateNotificationLocation)
	return int(expiryDate.Sub(today).Hours() / 24)
}

func notificationTierForDays(daysUntilExpiry int) (NotificationTier, bool) {
	if daysUntilExpiry < 0 {
		return notificationTiers[0], true
	}
	for _, tier := range notificationTiers[1:] {
		if daysUntilExpiry <= tier.MaxDays {
			return tier, true
		}
	}
	return NotificationTier{}, false
}

func clickUpConfigured() bool {
	return os.Getenv("CLICKUP_API_TOKEN") != "" && os.Getenv("CLICKUP_LIST_ID") != ""
}

func StartExpiryScheduler(pool *pgxpool.Pool) {
	go runExpiryCheck(pool)

	c := cron.New()

	schedule := os.Getenv("ALERT_CRON_SCHEDULE")
	if schedule == "" {
		schedule = "0 8 * * *"
	}

	_, err := c.AddFunc(schedule, func() {
		logger.Log.Info().Msg("running daily certificate expiry check")
		runExpiryCheck(pool)
	})
	if err != nil {
		logger.Log.Error().Err(err).Msg("failed to register cron job")
		return
	}

	c.Start()
	logger.Log.Info().Str("schedule", schedule).Msg("certificate expiry scheduler started")
}
