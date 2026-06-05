package utils

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	"riverqueue.com/riverui"
)

const PasswordResetEmailKind = "password_reset_email"
const PasswordResetQueue = "email"

type PasswordResetEmailArgs struct {
	ToAddress        string `json:"to_address"`
	Subject          string `json:"subject"`
	TemplateKey      string `json:"template_key"`
	PayloadEncrypted string `json:"payload_encrypted"`
	PayloadNonce     string `json:"payload_nonce"`
}

func (PasswordResetEmailArgs) Kind() string {
	return PasswordResetEmailKind
}

type PasswordResetEmailPayload struct {
	ResetURL       string `json:"reset_url"`
	ExpiresMinutes int    `json:"expires_minutes"`
}

type PasswordResetEmailWorker struct {
	river.WorkerDefaults[PasswordResetEmailArgs]
}

func (w *PasswordResetEmailWorker) Work(ctx context.Context, job *river.Job[PasswordResetEmailArgs]) error {
	payload, err := DecryptPasswordResetPayload(job.Args.PayloadEncrypted, job.Args.PayloadNonce)
	if err != nil {
		return fmt.Errorf("password reset email payload decrypt failed")
	}

	body := renderPasswordResetEmail(job.Args.TemplateKey, payload)
	if err := SendHTMLMail(job.Args.ToAddress, job.Args.Subject, body); err != nil {
		return fmt.Errorf("password reset email delivery failed: %w", err)
	}

	return nil
}

func StartRiver(ctx context.Context, pool *pgxpool.Pool) (*river.Client[pgx.Tx], http.Handler, error) {
	driver := riverpgxv5.New(pool)
	migrator, err := rivermigrate.New(driver, nil)
	if err != nil {
		return nil, nil, err
	}
	if _, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return nil, nil, err
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &PasswordResetEmailWorker{})
	river.AddWorker(workers, &NotificationEmailWorker{pool: pool})
	river.AddWorker(workers, &NotificationClickUpWorker{pool: pool})

	client, err := river.NewClient(driver, &river.Config{
		Logger:      riverLogger(),
		MaxAttempts: 5,
		Queues: map[string]river.QueueConfig{
			PasswordResetQueue: {MaxWorkers: 2},
		},
		Workers: workers,
	})
	if err != nil {
		return nil, nil, err
	}
	if err := client.Start(ctx); err != nil {
		return nil, nil, err
	}

	uiHandler, err := riverui.NewHandler(&riverui.HandlerOpts{
		Endpoints:                riverui.NewEndpoints(client, nil),
		JobListHideArgsByDefault: true,
		Logger:                   riverLogger(),
		Prefix:                   "/v1/admin/jobs",
	})
	if err != nil {
		return nil, nil, err
	}
	go func() {
		if err := uiHandler.Start(ctx); err != nil && ctx.Err() == nil {
			logger.Log.Error().Err(err).Msg("River UI handler stopped")
		}
	}()

	return client, uiHandler, nil
}

func riverLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
}

func StopRiver(ctx context.Context, client *river.Client[pgx.Tx]) error {
	if client == nil {
		return nil
	}
	return client.Stop(ctx)
}

func EncryptPasswordResetPayload(payload PasswordResetEmailPayload) (string, string, error) {
	plaintext, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	gcm, err := resetEmailCipher()
	if err != nil {
		return "", "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", "", err
	}

	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), base64.StdEncoding.EncodeToString(nonce), nil
}

func DecryptPasswordResetPayload(ciphertextEncoded, nonceEncoded string) (PasswordResetEmailPayload, error) {
	var payload PasswordResetEmailPayload
	gcm, err := resetEmailCipher()
	if err != nil {
		return payload, err
	}

	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextEncoded)
	if err != nil {
		return payload, err
	}
	nonce, err := base64.StdEncoding.DecodeString(nonceEncoded)
	if err != nil {
		return payload, err
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return payload, err
	}
	if err := json.Unmarshal(plaintext, &payload); err != nil {
		return payload, err
	}

	return payload, nil
}

func resetEmailCipher() (cipher.AEAD, error) {
	encodedKey := os.Getenv("RESET_EMAIL_JOB_ENCRYPTION_KEY")
	if encodedKey == "" {
		return nil, fmt.Errorf("RESET_EMAIL_JOB_ENCRYPTION_KEY is not set")
	}

	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("RESET_EMAIL_JOB_ENCRYPTION_KEY must decode to 32 bytes")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func renderPasswordResetEmail(templateKey string, payload PasswordResetEmailPayload) string {
	resetURL := html.EscapeString(payload.ResetURL)
	expiresMinutes := payload.ExpiresMinutes
	if expiresMinutes <= 0 {
		expiresMinutes = 15
	}

	return fmt.Sprintf(`
		<html>
		<body>
			<h2>Reset your Asset Management System password</h2>
			<p>We received a request to reset your Asset Management System password.</p>
			<p>Use the link below to choose a new password. This link expires in %d minutes.</p>
			<p><a href="%s">Reset password</a></p>
			<p>If you did not request this, you can ignore this email or contact your system administrator.</p>
			<br>
			<p>Best regards,<br>Asset Management System</p>
		</body>
		</html>
	`, expiresMinutes, resetURL)
}

func BuildResetURL(rawToken string) string {
	baseURL := os.Getenv("FRONTEND_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:4174"
	}
	return fmt.Sprintf("%s/reset-password?token=%s", trimTrailingSlash(baseURL), rawToken)
}

func trimTrailingSlash(value string) string {
	for len(value) > 0 && value[len(value)-1] == '/' {
		value = value[:len(value)-1]
	}
	return value
}

func PasswordResetEmailInsertOpts() *river.InsertOpts {
	return &river.InsertOpts{
		MaxAttempts: 5,
		Queue:       PasswordResetQueue,
		Tags:        []string{"password-reset"},
	}
}

func PasswordResetSubject() string {
	return "Reset your Asset Management System password"
}

func PasswordResetExpiryMinutes() int {
	return int((15 * time.Minute).Minutes())
}
