package utils

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/riverqueue/river"
	"github.com/robfig/cron/v3"
	"gopkg.in/gomail.v2"
)

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

func CertificateExpiryEmailMessage(recipientName, assetName, componentName, certificateName, expiryDate, tierLabel, timingText string) (string, string) {
	subject := fmt.Sprintf("[%s] Certificate Expiry Alert - %s", tierLabel, certificateName)
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

	return subject, body
}

func RoutineMaintenanceEmailMessage(recipientName, assetName, assetDisplayID string, workingHours, dueAtHours int64) (string, string) {
	subject := "Routine Maintenance Required - " + assetName
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

	return subject, body
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

func notifyExpiring(ctx context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], cert db.GetExpiringCertificatesWithContextRow, recipientEmail, recipientName string) {
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
	if riverClient == nil {
		recordCertificateNotificationConfigFailure(ctx, pool, cert, tier, expiryStr, NotificationChannelEmail, "River client is not configured")
		recordCertificateNotificationConfigFailure(ctx, pool, cert, tier, expiryStr, NotificationChannelClickUp, "River client is not configured")
		return
	}

	if recipientEmail == "" {
		logger.Log.Warn().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("tier", tier.Name).
			Msg("ALERT_RECIPIENT_EMAIL not set, skipping expiry email")
		recordCertificateNotificationConfigFailure(ctx, pool, cert, tier, expiryStr, NotificationChannelEmail, "ALERT_RECIPIENT_EMAIL not set")
	} else {
		enqueueEmailNotification(ctx, pool, riverClient, cert, recipientEmail, recipientName, tier, expiryStr)
	}

	if !clickUpConfigured() {
		logger.Log.Warn().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("tier", tier.Name).
			Msg("ClickUp configuration not set, skipping expiry ClickUp task")
		recordCertificateNotificationConfigFailure(ctx, pool, cert, tier, expiryStr, NotificationChannelClickUp, "CLICKUP_API_TOKEN or CLICKUP_LIST_ID not set")
		return
	}

	enqueueClickUpNotification(ctx, pool, riverClient, cert, tier, expiryStr)
}

func recordCertificateNotificationConfigFailure(parent context.Context, pool *pgxpool.Pool, cert db.GetExpiringCertificatesWithContextRow, tier NotificationTier, expiryStr, channel, errorMessage string) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	key := buildIdempotencyKey(cert.CertificateID.String(), expiryStr, tier.Name, channel)
	tx, err := pool.Begin(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to begin certificate expiry notification failure transaction")
		return
	}
	defer tx.Rollback(ctx)

	queries := db.New(tx)
	delivery, err := queries.ClaimNotificationDelivery(ctx, db.ClaimNotificationDeliveryParams{
		SourceType:     NotificationSourceCertificateExpiry,
		SourceID:       cert.CertificateID,
		Channel:        channel,
		Tier:           tier.Name,
		IdempotencyKey: key,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return
	}
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to claim certificate expiry failed notification delivery")
		return
	}

	if err := queries.MarkNotificationDeliveryFailed(ctx, db.MarkNotificationDeliveryFailedParams{
		DeliveryID:   delivery.DeliveryID,
		ErrorMessage: errorMessage,
	}); err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to mark certificate expiry notification delivery failed")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to commit certificate expiry notification failure")
	}
}

func enqueueEmailNotification(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], cert db.GetExpiringCertificatesWithContextRow, recipientEmail, recipientName string, tier NotificationTier, expiryStr string) {
	if riverClient == nil {
		logger.Log.Error().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("tier", tier.Name).
			Msg("River client is not configured, skipping certificate expiry email")
		return
	}

	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	key := buildIdempotencyKey(cert.CertificateID.String(), expiryStr, tier.Name, "EMAIL")
	tx, err := pool.Begin(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to begin certificate expiry email enqueue transaction")
		return
	}
	defer tx.Rollback(ctx)

	subject, body := CertificateExpiryEmailMessage(recipientName, cert.AssetName, cert.ComponentName, cert.CertificateName, expiryStr, tier.Label, tier.EmailText)
	inserted, err := EnqueueNotificationEmailTx(ctx, tx, riverClient, NotificationDeliveryParams{
		SourceType:     NotificationSourceCertificateExpiry,
		SourceID:       cert.CertificateID,
		Channel:        NotificationChannelEmail,
		Tier:           tier.Name,
		IdempotencyKey: key,
		Tags:           []string{"certificate-expiry", "email"},
	}, NotificationEmailArgs{
		ToAddress: recipientEmail,
		Subject:   subject,
		Body:      body,
	})
	if !inserted && err == nil {
		logger.Log.Info().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", "EMAIL").
			Str("tier", tier.Name).
			Msg("notification slot already claimed, skipping email enqueue")
		return
	}
	if err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", "EMAIL").
			Str("tier", tier.Name).
			Msg("failed to claim email notification slot")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Msg("failed to commit certificate expiry email enqueue")
		return
	}

	logger.Log.Info().
		Str("certificate_id", cert.CertificateID.String()).
		Str("certificate", cert.CertificateName).
		Str("key", key).
		Str("channel", "EMAIL").
		Str("tier", tier.Name).
		Msg("certificate expiry email enqueued")
}

func enqueueClickUpNotification(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], cert db.GetExpiringCertificatesWithContextRow, tier NotificationTier, expiryStr string) {
	if riverClient == nil {
		logger.Log.Error().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("tier", tier.Name).
			Msg("River client is not configured, skipping certificate expiry ClickUp task")
		return
	}

	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	key := buildIdempotencyKey(cert.CertificateID.String(), expiryStr, tier.Name, "CLICKUP")
	tx, err := pool.Begin(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("failed to begin certificate expiry ClickUp enqueue transaction")
		return
	}
	defer tx.Rollback(ctx)

	clickUpPayload := CertificateExpiryClickUpPayload(cert.CertificateName, cert.AssetName, cert.ComponentName, *cert.ExpiryDate)
	inserted, err := EnqueueNotificationClickUpTx(ctx, tx, riverClient, NotificationDeliveryParams{
		SourceType:     NotificationSourceCertificateExpiry,
		SourceID:       cert.CertificateID,
		Channel:        NotificationChannelClickUp,
		Tier:           tier.Name,
		IdempotencyKey: key,
		Tags:           []string{"certificate-expiry", "clickup"},
	}, NotificationClickUpArgs{
		Name:        clickUpPayload.Name,
		Description: clickUpPayload.Description,
		Priority:    clickUpPayload.Priority,
		DueAt:       time.UnixMilli(clickUpPayload.DueDate),
	})
	if !inserted && err == nil {
		logger.Log.Info().
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", "CLICKUP").
			Str("tier", tier.Name).
			Msg("notification slot already claimed, skipping ClickUp enqueue")
		return
	}
	if err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Str("channel", "CLICKUP").
			Str("tier", tier.Name).
			Msg("failed to claim ClickUp notification slot")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		logger.Log.Error().
			Err(err).
			Str("certificate_id", cert.CertificateID.String()).
			Str("certificate", cert.CertificateName).
			Str("key", key).
			Msg("failed to commit certificate expiry ClickUp enqueue")
		return
	}

	logger.Log.Info().
		Str("certificate_id", cert.CertificateID.String()).
		Str("certificate", cert.CertificateName).
		Str("key", key).
		Str("channel", "CLICKUP").
		Str("tier", tier.Name).
		Msg("certificate expiry ClickUp task enqueued")
}

func runExpiryCheck(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	queries := db.New(pool)
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
		notifyExpiring(context.Background(), pool, riverClient, cert, recipientEmail, recipientName)
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

func StartExpiryScheduler(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) {
	go runExpiryCheck(pool, riverClient)

	c := cron.New()

	schedule := os.Getenv("ALERT_CRON_SCHEDULE")
	if schedule == "" {
		schedule = "0 8 * * *"
	}

	_, err := c.AddFunc(schedule, func() {
		logger.Log.Info().Msg("running daily certificate expiry check")
		runExpiryCheck(pool, riverClient)
	})
	if err != nil {
		logger.Log.Error().Err(err).Msg("failed to register cron job")
		return
	}

	c.Start()
	logger.Log.Info().Str("schedule", schedule).Msg("certificate expiry scheduler started")
}
