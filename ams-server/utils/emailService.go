package utils

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/robfig/cron/v3"
	"gopkg.in/gomail.v2"
)

func sendEmail(recipientEmail, recipientName, assetName, componentName, certificateName, expiryDate string) error {
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
	m.SetHeader("Subject", "Certificate Expiry Alert - "+certificateName)

	body := fmt.Sprintf(`
		<html>
		<body>
			<h2>Certificate Expiry Alert</h2>
			<p>Dear %s,</p>
			<p>This is an automated notification that the following certificate is expiring soon:</p>
			<ul>
				<li><strong>Asset:</strong> %s</li>
				<li><strong>Component:</strong> %s</li>
				<li><strong>Certificate:</strong> %s</li>
				<li><strong>Expiry Date:</strong> %s</li>
			</ul>
			<p>Please take necessary action to renew this certificate before expiration.</p>
			<br>
			<p>Best regards,<br>Asset Management System</p>
		</body>
		</html>
	`, recipientName, assetName, componentName, certificateName, expiryDate)

	m.SetBody("text/html", body)

	d := gomail.NewDialer(smtpHost, smtpPort, smtpUser, smtpPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	return nil
}

// notifyExpiring handles all notification channels for a single expiring certificate.
// Each channel is independent — failure in one does not affect the other.
func notifyExpiring(ctx context.Context, pool *pgxpool.Pool, cert db.GetExpiringCertificatesWithContextRow, recipientEmail, recipientName string) {
	queries := db.New(pool)
	expiryDateStr := cert.ExpiryDate.Time.Format("2006-01-02")

	// ── EMAIL ────────────────────────────────────────────────────────────────
	emailSent, err := queries.HasRecentScheduledTask(ctx, db.HasRecentScheduledTaskParams{
		CertificateID: cert.CertificateID,
		Type:          "EMAIL",
	})
	if err != nil {
		logger.Log.Error().Err(err).
			Str("certificate", cert.CertificateName).
			Msg("failed to check email scheduled task")
	} else if emailSent > 0 {
		logger.Log.Info().
			Str("certificate", cert.CertificateName).
			Msg("email already sent within 6 months, skipping")
	} else {
		err = sendEmail(recipientEmail, recipientName, cert.AssetName, cert.ComponentName, cert.CertificateName, expiryDateStr)
		status := "SENT"
		if err != nil {
			status = "FAILED"
			logger.Log.Error().Err(err).
				Str("certificate", cert.CertificateName).
				Msg("failed to send expiry email")
		} else {
			logger.Log.Info().
				Str("certificate", cert.CertificateName).
				Str("expiry_date", expiryDateStr).
				Msg("sent expiry email")
		}

		_, recordErr := queries.CreateScheduledTask(ctx, db.CreateScheduledTaskParams{
			TaskID:        uuid.New().String(),
			CertificateID: cert.CertificateID,
			Type:          "EMAIL",
			Status:        status,
		})
		if recordErr != nil {
			logger.Log.Error().Err(recordErr).
				Str("certificate", cert.CertificateName).
				Msg("failed to record email scheduled task")
		}
	}

	// ── CLICKUP ──────────────────────────────────────────────────────────────
	clickupSent, err := queries.HasRecentScheduledTask(ctx, db.HasRecentScheduledTaskParams{
		CertificateID: cert.CertificateID,
		Type:          "CLICKUP",
	})
	if err != nil {
		logger.Log.Error().Err(err).
			Str("certificate", cert.CertificateName).
			Msg("failed to check ClickUp scheduled task")
	} else if clickupSent > 0 {
		logger.Log.Info().
			Str("certificate", cert.CertificateName).
			Msg("ClickUp task already created within 6 months, skipping")
	} else {
		clickUpTaskID, err := CreateClickUpTask(cert.CertificateName, cert.AssetName, cert.ComponentName, cert.ExpiryDate.Time)
		status := "SENT"
		taskID := uuid.New().String() // fallback task_id if ClickUp fails

		if err != nil {
			status = "FAILED"
			logger.Log.Error().Err(err).
				Str("certificate", cert.CertificateName).
				Msg("failed to create ClickUp task")
		} else {
			taskID = clickUpTaskID
			logger.Log.Info().
				Str("certificate", cert.CertificateName).
				Str("clickup_task_id", clickUpTaskID).
				Str("expiry_date", expiryDateStr).
				Msg("created ClickUp task")
		}

		_, recordErr := queries.CreateScheduledTask(ctx, db.CreateScheduledTaskParams{
			TaskID:        taskID,
			CertificateID: cert.CertificateID,
			Type:          "CLICKUP",
			Status:        status,
		})
		if recordErr != nil {
			logger.Log.Error().Err(recordErr).
				Str("certificate", cert.CertificateName).
				Msg("failed to record ClickUp scheduled task")
		}
	}
}

func runExpiryCheck(pool *pgxpool.Pool) {
	recipientEmail := os.Getenv("ALERT_RECIPIENT_EMAIL")
	recipientName := os.Getenv("ALERT_RECIPIENT_NAME")

	if recipientEmail == "" {
		logger.Log.Warn().Msg("ALERT_RECIPIENT_EMAIL not set, skipping expiry check")
		return
	}

	daysThreshold := 30
	if daysThresholdStr := os.Getenv("EXPIRY_ALERT_DAYS"); daysThresholdStr != "" {
		if threshold, err := strconv.Atoi(daysThresholdStr); err == nil {
			daysThreshold = threshold
		}
	}

	thresholdDate := time.Now().AddDate(0, 0, daysThreshold)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	queries := db.New(pool)

	certificates, err := queries.GetExpiringCertificatesWithContext(ctx, thresholdDate)
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
		notifyExpiring(ctx, pool, cert, recipientEmail, recipientName)
	}
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
