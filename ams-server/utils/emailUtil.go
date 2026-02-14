package utils

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"gopkg.in/gomail.v2"
)

func SendCertificateExpiryEmail(recipientEmail, recipientName, assetName, componentName, certificateName, expiryDate string) error {
	err := godotenv.Load(".env")
	if err != nil {
		fmt.Println("Warning: .env file not found")
	}

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
