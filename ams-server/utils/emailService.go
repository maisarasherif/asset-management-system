package utils

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/robfig/cron/v3"
	"gopkg.in/gomail.v2"
)

func sendCertificateExpiryEmail(recipientEmail, recipientName, assetName, componentName, certificateName, expiryDate string) error {
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

func runExpiryCheck(pool *pgxpool.Pool) {
	recipientEmail := os.Getenv("ALERT_RECIPIENT_EMAIL")
	recipientName := os.Getenv("ALERT_RECIPIENT_NAME")

	if recipientEmail == "" {
		fmt.Println("[scheduler] ALERT_RECIPIENT_EMAIL not set, skipping expiry check")
		return
	}

	daysThreshold := 30
	if daysThresholdStr := os.Getenv("EXPIRY_ALERT_DAYS"); daysThresholdStr != "" {
		if threshold, err := strconv.Atoi(daysThresholdStr); err == nil {
			daysThreshold = threshold
		}
	}

	thresholdDate := time.Now().AddDate(0, 0, daysThreshold)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	queries := db.New(pool)

	certificates, err := queries.GetExpiringCertificatesWithContext(ctx, thresholdDate)
	if err != nil {
		fmt.Printf("[scheduler] failed to fetch expiring certificates: %v\n", err)
		return
	}

	if len(certificates) == 0 {
		fmt.Println("[scheduler] no expiring certificates found")
		return
	}

	fmt.Printf("[scheduler] found %d expiring certificates, sending alerts\n", len(certificates))

	for _, cert := range certificates {
		expiryDateStr := cert.ExpiryDate.Format("2006-01-02")

		err := sendCertificateExpiryEmail(
			recipientEmail,
			recipientName,
			cert.AssetName,
			cert.ComponentName,
			cert.CertificateName,
			expiryDateStr,
		)
		if err != nil {
			fmt.Printf("[scheduler] failed to send email for certificate %s: %v\n", cert.CertificateName, err)
			continue
		}

		fmt.Printf("[scheduler] sent expiry alert for certificate: %s\n", cert.CertificateName)
	}
}

func StartExpiryScheduler(pool *pgxpool.Pool) {
	// Run once immediately on startup so you don't wait 24h for first check
	go runExpiryCheck(pool)

	c := cron.New()

	// Run daily at 8:00 AM — adjust via ALERT_CRON_SCHEDULE env var if needed
	schedule := os.Getenv("ALERT_CRON_SCHEDULE")
	if schedule == "" {
		schedule = "0 8 * * *"
	}

	_, err := c.AddFunc(schedule, func() {
		fmt.Println("[scheduler] running daily certificate expiry check")
		runExpiryCheck(pool)
	})
	if err != nil {
		fmt.Printf("[scheduler] failed to register cron job: %v\n", err)
		return
	}

	c.Start()
	fmt.Println("[scheduler] certificate expiry scheduler started")
}
