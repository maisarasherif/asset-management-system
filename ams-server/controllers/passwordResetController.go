package controllers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"github.com/riverqueue/river"
)

const forgotPasswordSuccessMessage = "If that address is in our system, you'll receive an email shortly."
const resetTokenInvalidMessage = "This link is invalid or has expired."
const forgotPasswordWindowSeconds = 15 * 60
const forgotPasswordLimit = 3
const resetPasswordMinLength = 12
const resetPasswordMaxLength = 128

type forgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type resetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

type resetTokenUser struct {
	UserID uuid.UUID
	Email  string
}

func ForgotPassword(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		defer enforceMinimumDuration(start, 300*time.Millisecond)

		var input forgotPasswordRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		normalizedEmail := normalizeEmail(input.Email)
		emailHash := hashRateLimitValue(normalizedEmail)
		limitKeys := []string{
			"forgot_password:email:" + emailHash,
			"forgot_password:ip_email:" + c.ClientIP() + ":" + emailHash,
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		for _, key := range limitKeys {
			limited, err := checkForgotPasswordLimit(ctx, pool, key)
			if err != nil {
				logger.Log.Error().Err(err).Msg("forgot password rate limit check failed")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
				return
			}
			if limited {
				c.Header("Retry-After", "900")
				c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests. Please try again later."})
				return
			}
		}

		user, err := findPasswordResetUser(ctx, pool, normalizedEmail)
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusOK, gin.H{"message": forgotPasswordSuccessMessage})
			return
		}
		if err != nil {
			logger.Log.Error().Err(err).Msg("forgot password user lookup failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}
		if riverClient == nil {
			logger.Log.Error().Msg("forgot password River client is not configured")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		rawToken, err := generateResetToken()
		if err != nil {
			logger.Log.Error().Err(err).Msg("reset token generation failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		if err := createResetTokenAndEmailJob(ctx, pool, riverClient, user, rawToken); err != nil {
			logger.Log.Error().Err(err).Str("user_id", user.UserID.String()).Msg("reset token creation failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": forgotPasswordSuccessMessage})
	}
}

func ResetPassword(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input resetPasswordRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		tokenHash := hashResetToken(strings.TrimSpace(input.Token))
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}
		defer tx.Rollback(ctx)

		var user resetTokenUser
		err = tx.QueryRow(ctx, `
			SELECT prt.user_id, u.email
			FROM password_reset_tokens prt
			JOIN users u ON u.user_id = prt.user_id
			WHERE prt.token_hash = $1
			  AND prt.used_at IS NULL
			  AND prt.expires_at > NOW()
			FOR UPDATE OF prt
		`, tokenHash).Scan(&user.UserID, &user.Email)
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusBadRequest, gin.H{"error": resetTokenInvalidMessage})
			return
		}
		if err != nil {
			logger.Log.Error().Err(err).Msg("reset token lookup failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		if err := validateResetPassword(input.NewPassword, user.Email); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Please choose a stronger password."})
			return
		}

		hashedPassword, err := HashPassword(input.NewPassword)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		if _, err := tx.Exec(ctx, `
			UPDATE users
			SET password = $1, token = '', updated_at = NOW()
			WHERE user_id = $2
		`, hashedPassword, user.UserID); err != nil {
			logger.Log.Error().Err(err).Str("user_id", user.UserID.String()).Msg("password reset user update failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		if _, err := tx.Exec(ctx, `
			UPDATE password_reset_tokens
			SET used_at = NOW()
			WHERE user_id = $1 AND used_at IS NULL
		`, user.UserID); err != nil {
			logger.Log.Error().Err(err).Str("user_id", user.UserID.String()).Msg("reset token consume failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong. Please try again."})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "password reset successfully"})
	}
}

func createResetTokenAndEmailJob(ctx context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], user resetTokenUser, rawToken string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE password_reset_tokens
		SET used_at = NOW()
		WHERE user_id = $1 AND used_at IS NULL
	`, user.UserID); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO password_reset_tokens (user_id, token_hash)
		VALUES ($1, $2)
	`, user.UserID, hashResetToken(rawToken)); err != nil {
		return err
	}

	payloadEncrypted, payloadNonce, err := utils.EncryptPasswordResetPayload(utils.PasswordResetEmailPayload{
		ResetURL:       utils.BuildResetURL(rawToken),
		ExpiresMinutes: utils.PasswordResetExpiryMinutes(),
	})
	if err != nil {
		return err
	}

	_, err = riverClient.InsertTx(ctx, tx, utils.PasswordResetEmailArgs{
		ToAddress:        user.Email,
		Subject:          utils.PasswordResetSubject(),
		TemplateKey:      "password_reset",
		PayloadEncrypted: payloadEncrypted,
		PayloadNonce:     payloadNonce,
	}, utils.PasswordResetEmailInsertOpts())
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func findPasswordResetUser(ctx context.Context, pool *pgxpool.Pool, normalizedEmail string) (resetTokenUser, error) {
	var user resetTokenUser
	err := pool.QueryRow(ctx, `
		SELECT user_id, email
		FROM users
		WHERE LOWER(email) = $1
		LIMIT 1
	`, normalizedEmail).Scan(&user.UserID, &user.Email)
	return user, err
}

func checkForgotPasswordLimit(ctx context.Context, pool *pgxpool.Pool, key string) (bool, error) {
	var hits int
	err := pool.QueryRow(ctx, `
		INSERT INTO forgot_password_rate_limits (key, hits, window_start, updated_at)
		VALUES ($1, 1, NOW(), NOW())
		ON CONFLICT (key) DO UPDATE
		SET
		  hits = CASE
		    WHEN forgot_password_rate_limits.window_start < NOW() - make_interval(secs => $2::int)
		    THEN 1
		    ELSE forgot_password_rate_limits.hits + 1
		  END,
		  window_start = CASE
		    WHEN forgot_password_rate_limits.window_start < NOW() - make_interval(secs => $2::int)
		    THEN NOW()
		    ELSE forgot_password_rate_limits.window_start
		  END,
		  updated_at = NOW()
		RETURNING hits
	`, key, forgotPasswordWindowSeconds).Scan(&hits)
	if err != nil {
		return false, err
	}

	return hits > forgotPasswordLimit, nil
}

func validateResetPassword(password, email string) error {
	if len(password) < resetPasswordMinLength || len(password) > resetPasswordMaxLength {
		return errors.New("password length is invalid")
	}
	if strings.EqualFold(strings.TrimSpace(password), normalizeEmail(email)) {
		return errors.New("password must not equal email")
	}
	return nil
}

func generateResetToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashResetToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func hashRateLimitValue(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func enforceMinimumDuration(start time.Time, minimum time.Duration) {
	elapsed := time.Since(start)
	if elapsed < minimum {
		time.Sleep(minimum - elapsed)
	}
}
