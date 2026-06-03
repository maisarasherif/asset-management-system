# Forgot Password Implementation - Version 1

## Overview

This document defines the Version 1 forgot-password implementation for the current Asset Management System backend and frontend.

The goal is to ship a secure, reliable, repo-fit password reset flow without expanding the first release into a full authentication rewrite.

V1 includes:

- Forgot-password and reset-password API endpoints.
- Existing in-memory IP rate limiter as a coarse route guard.
- Postgres-backed per-email and per-IP-plus-email rate limits.
- Secure random reset tokens stored only as SHA-256 hashes.
- Single-use, 15-minute reset tokens.
- Real session revocation by enforcing stored-token validation in auth middleware.
- River Postgres job queue for reset-email delivery.
- Encrypted reset-email job args so raw reset URLs are not visible in job storage or River UI.
- River UI exposed behind Super Admin access for operational visibility.
- Frontend forgot-password and reset-password screens.

V1 intentionally defers:

- Argon2id password-hash migration.
- HaveIBeenPwned breach checks.
- CAPTCHA.
- Account-lock link in reset email.
- Auto-login after reset.

---

## Current Repo Constraints

The current server is Go + Gin + pgx/sqlc + PostgreSQL.

Important existing behavior:

- Password hashes are stored in `users.password`.
- Existing password hashing uses bcrypt via `controllers.HashPassword`.
- Login writes the active JWT into `users.token`.
- Current auth middleware validates JWT signature and expiry, but must be updated to verify that the presented JWT matches `users.token`.
- Existing `middleware.RateLimitMiddleware(limit, window)` is an in-memory per-IP fixed-window limiter and should remain in use.
- River should be used for background reset-email jobs instead of a custom email outbox table.

V1 should preserve the current bcrypt flow. Argon2id can be introduced later through a planned migration that supports both hash formats.

---

## Route Summary

### Unprotected Routes

```go
forgotPasswordLimit := 10
forgotPasswordRateLimit := middleware.RateLimitMiddleware(forgotPasswordLimit, time.Minute)

router.POST("/v1/forgot-password", forgotPasswordRateLimit, controller.ForgotPassword(pool))
router.POST("/v1/reset-password", controller.ResetPassword(pool))
```

### Super Admin Operational Route

Expose River UI behind authenticated, active, Super Admin-only access.

Recommended route:

```go
jobs := router.Group("/v1/admin/jobs")
jobs.Use(
	middleware.AuthMiddleware(),
	middleware.ActiveUserMiddleware(pool),
	middleware.SuperAdminMiddleware(),
)
jobs.Any("/*path", gin.WrapH(riverUIHandler))
```

Exact routing may vary depending on River UI's handler setup, but the access boundary must remain Super Admin-only.

`POST /v1/forgot-password` uses two layers of rate limiting:

1. Existing middleware: cheap per-IP coarse guard.
2. Handler-level Postgres checks: per-email and per-IP-plus-email.

`POST /v1/reset-password` validates and consumes the reset token, updates the password, and revokes existing sessions.

---

## API Contracts

### Forgot Password Request

```json
{
  "email": "user@example.com"
}
```

### Forgot Password Success Response

This response must be identical whether the email exists or not.

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "message": "If that address is in our system, you'll receive an email shortly."
}
```

### Forgot Password Rate-Limited Response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900
Content-Type: application/json
```

```json
{
  "error": "Too many requests. Please try again later."
}
```

### Reset Password Request

```json
{
  "token": "raw-reset-token-from-url",
  "new_password": "new-password-value"
}
```

### Reset Password Success Response

```json
{
  "message": "password reset successfully"
}
```

After success, the frontend should redirect the user to `/login`.

---

## User Enumeration Protection

The forgot-password endpoint must not reveal whether an email exists.

Rules:

- Always return the same `200 OK` response for known and unknown emails, unless rate limited or the request body is invalid.
- Do not log unknown emails as errors.
- Normalize response timing with a minimum response floor.

Recommended response floor:

```go
func enforceMinimumDuration(start time.Time, minimum time.Duration) {
	elapsed := time.Since(start)
	if elapsed < minimum {
		time.Sleep(minimum - elapsed)
	}
}
```

Use `300 * time.Millisecond` for V1.

---

## Email Normalization

Normalize email before lookup and rate-limit key generation.

```go
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
```

For rate-limit keys, hash the normalized email so the rate-limit table does not store email addresses directly.

```go
func hashRateLimitValue(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
```

Example keys:

```text
forgot_password:email:<sha256(normalized_email)>
forgot_password:ip_email:<ip>:<sha256(normalized_email)>
```

---

## Postgres Rate Limiting

The existing middleware remains the coarse per-IP filter. V1 adds Postgres-backed limits inside the forgot-password handler after parsing and normalizing the email.

### Limits

| Dimension | Limit | Window |
| --- | ---: | --- |
| Per normalized email | 3 requests | 15 minutes |
| Per IP + normalized email | 3 requests | 15 minutes |

The route-level middleware also applies:

| Dimension | Limit | Window |
| --- | ---: | --- |
| Per IP | 10 requests | 1 minute |

### Migration

```sql
CREATE TABLE forgot_password_rate_limits (
  key          TEXT PRIMARY KEY,
  hits         INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forgot_password_rate_limits_window
  ON forgot_password_rate_limits (window_start);
```

### Check Query

Use a fixed-window upsert for V1.

```sql
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
RETURNING hits;
```

If any fine-grained limit is exceeded, return `429` with `Retry-After: 900`.

---

## Reset Token Storage

Store only the SHA-256 hash of the raw reset token.

### Migration

```sql
CREATE TABLE password_reset_tokens (
  token_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

CREATE INDEX idx_password_reset_tokens_active
  ON password_reset_tokens (token_hash)
  WHERE used_at IS NULL;

CREATE INDEX idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at);
```

### Token Generation

```go
func generateResetToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
```

### Token Hashing

```go
func hashResetToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
```

### Create Token Rules

Inside one transaction:

1. Mark previous unused tokens for the user as used.
2. Insert the new token hash.
3. Insert the River reset-email job with encrypted args.

The raw token must never be stored in `password_reset_tokens`.

---

## River Email Jobs

V1 uses River for durable background reset-email delivery instead of synchronous email, goroutine email, RabbitMQ, Kafka, or a custom `email_outbox` table.

This gives:

- Async delivery.
- Retries.
- Operational visibility.
- Transactional enqueueing with the reset-token database changes.
- No extra broker infrastructure.
- No custom claim/retry/stale-lock worker implementation.
- No plain raw reset URL stored in job args.

### Required Environment Variables

```text
FRONTEND_BASE_URL
RESET_EMAIL_JOB_ENCRYPTION_KEY
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
FROM_EMAIL
```

`RESET_EMAIL_JOB_ENCRYPTION_KEY` should be a 32-byte key encoded as base64.

### River Migrations

Use River's official migration tooling/schema for its job tables. Do not create a custom `email_outbox` table in V1.

The application migrations still own:

- `password_reset_tokens`
- `forgot_password_rate_limits`

River owns its job tables.

### Job Args

Define a River job for password reset emails.

The River job args should contain delivery metadata and encrypted payload only.

Example shape:

```go
type PasswordResetEmailArgs struct {
	ToAddress        string `json:"to_address"`
	Subject          string `json:"subject"`
	TemplateKey      string `json:"template_key"`
	PayloadEncrypted string `json:"payload_encrypted"`
	PayloadNonce     string `json:"payload_nonce"`
}

func (PasswordResetEmailArgs) Kind() string {
	return "password_reset_email"
}
```

The decrypted payload should be JSON like this:

```json
{
  "reset_url": "https://app.example.com/reset-password?token=raw-token",
  "expires_minutes": 15
}
```

Only the encrypted payload and nonce should be stored in River.

### Encryption

Use authenticated encryption, preferably AES-256-GCM:

- Decode `RESET_EMAIL_JOB_ENCRYPTION_KEY` from base64.
- Generate a random nonce per email.
- Store ciphertext in `PayloadEncrypted`.
- Store nonce in `PayloadNonce`.

Do not log decrypted payloads or reset URLs. Do not place raw reset URLs in River tags, metadata, errors, or logs.

### Transactional Enqueue

The forgot-password handler should enqueue the River job in the same database transaction that creates the reset token.

Transaction flow:

1. Begin transaction.
2. Invalidate previous reset tokens for user.
3. Insert new `password_reset_tokens` row.
4. Encrypt reset-email payload.
5. Insert River job through River's transaction-aware insert API.
6. Commit transaction.

The reset-email job must not become visible to workers unless the transaction commits.

### Worker Behavior

Register a River worker for `password_reset_email`.

Worker flow:

1. Decrypt payload.
2. Render HTML from `TemplateKey`.
3. Send email with the reusable SMTP sender.
4. Return an error to River if delivery fails so River can retry according to configured retry behavior.

Recommended V1 behavior:

- Queue name: `email`.
- Worker count: low, for example `2`.
- Max attempts: `5`.
- Keep job args encrypted for both pending and completed jobs.
- Do not include the raw reset URL in returned errors.

### River UI

Expose River UI for operational inspection, but only to Super Admin users.

Frontend entry point:

- Add a `Background jobs` button on the Administration page.
- Show the button only when the current user role is `SUPER_ADMIN`.
- Open the River UI route in a separate page or browser tab.

Backend access requirements:

- Require valid auth.
- Require active user.
- Require `SUPER_ADMIN`.
- Do not allow regular `ADMIN` users.

Security requirements:

- River job args remain encrypted, so River UI cannot reveal raw reset URLs.
- River UI must not be exposed as an unprotected route.
- River UI should not be mounted inside a public static frontend route.

---

## Reset Email Content

Subject:

```text
Reset your Asset Management System password
```

Body requirements:

- Include reset link.
- State that the link expires in 15 minutes.
- Tell users to ignore the email if they did not request it.
- Do not include an unauthenticated account-lock link in V1.

Recommended copy:

```text
We received a request to reset your Asset Management System password.
Use the link below to choose a new password. This link expires in 15 minutes.

If you did not request this, you can ignore this email or contact your system administrator.
```

---

## Reset Password Flow

### Validate Token

The reset handler receives the raw token and hashes it.

Token lookup must require:

- Matching `token_hash`.
- `used_at IS NULL`.
- `expires_at > NOW()`.

Return the same error for invalid, expired, and already-used tokens.

```json
{
  "error": "This link is invalid or has expired."
}
```

### Complete Reset Transaction

Inside one transaction:

1. Select the reset token row with `FOR UPDATE`.
2. Validate that it is unused and unexpired.
3. Validate password policy.
4. Hash the new password with existing bcrypt helper.
5. Update `users.password`.
6. Clear `users.token` to revoke existing sessions.
7. Mark the reset token as used with `used_at = NOW()`.
8. Mark all other unused reset tokens for the user as used.
9. Write an audit row if supported by the existing audit table.
10. Queue a password-changed confirmation email if desired for V1.

The transaction must fail as a unit if any required step fails.

### Password Policy For V1

Use a server-side minimum length of 12 characters for reset-password.

Rules:

- Minimum 12 characters.
- Maximum 128 characters.
- Must not equal the user's email address, case-insensitive.

Existing account/admin password endpoints can remain unchanged in V1 unless explicitly included in the implementation task.

---

## Real Session Revocation

V1 must fix session revocation semantics.

Current behavior stores the active JWT in `users.token`, but auth middleware must also verify that the presented token matches the stored token.

Recommended auth middleware addition:

1. Parse and validate JWT.
2. Parse `claims.UserId`.
3. Fetch `users.token` and `users.status`.
4. Reject if user is not active.
5. Reject if stored token is empty.
6. Reject if stored token does not equal the presented token.

After password reset, clearing `users.token` will then invalidate existing sessions immediately.

This change may be implemented in `ActiveUserMiddleware` or a combined auth/session validation middleware.

Expected behavior:

- Logout invalidates the current session.
- Admin password reset invalidates the target user's active session.
- Forgot-password reset invalidates the target user's active session.
- Old JWTs fail even if their signature and expiry are otherwise valid.

---

## Frontend Scope

### Login Page

Add a `Forgot password?` link near the password field or form footer.

Target:

```text
/forgot-password
```

### Forgot Password Page

Fields:

- Email

Behavior:

- Submit to `POST /v1/forgot-password`.
- Show the generic success message.
- Do not reveal whether an account exists.

### Reset Password Page

Route:

```text
/reset-password?token=<raw-token>
```

Fields:

- New password.
- Confirm new password.

Behavior:

- Require matching passwords client-side for UX.
- Require at least 12 characters client-side for UX.
- Submit token and new password to `POST /v1/reset-password`.
- On success, redirect to `/login`.

Server-side validation remains authoritative.

---

## Error Handling

| Scenario | HTTP Status | Message |
| --- | ---: | --- |
| Forgot password, known email | 200 | If that address is in our system, you'll receive an email shortly. |
| Forgot password, unknown email | 200 | If that address is in our system, you'll receive an email shortly. |
| Forgot password rate limited | 429 | Too many requests. Please try again later. |
| Invalid reset token | 400 | This link is invalid or has expired. |
| Expired reset token | 400 | This link is invalid or has expired. |
| Used reset token | 400 | This link is invalid or has expired. |
| Weak reset password | 400 | Please choose a stronger password. |
| Server error | 500 | Something went wrong. Please try again. |

---

## Implementation Checklist

### Backend

- [ ] Add DTOs for forgot-password and reset-password requests.
- [ ] Add `password_reset_tokens` migration.
- [ ] Add `forgot_password_rate_limits` migration.
- [ ] Add River dependency and River migrations.
- [ ] Add reset-token generation and SHA-256 hashing helpers.
- [ ] Add fine-grained forgot-password rate-limit helper.
- [ ] Add encrypted reset-email job args.
- [ ] Add River reset-email job enqueue helper.
- [ ] Add reusable SMTP HTML email sender.
- [ ] Add River reset-email worker.
- [ ] Add River client startup/shutdown wiring.
- [ ] Add Super Admin middleware if not already present.
- [ ] Mount River UI behind Super Admin-only backend auth.
- [ ] Add `ForgotPassword` handler.
- [ ] Add `ResetPassword` handler.
- [ ] Update auth/session middleware to require stored token match.
- [ ] Ensure logout and admin password reset still work with stored-token validation.
- [ ] Add focused tests for token creation, token consumption, rate limits, and session revocation.

### Frontend

- [ ] Add forgot-password API function.
- [ ] Add reset-password API function.
- [ ] Add `Forgot password?` link to login page.
- [ ] Add `/forgot-password` route and page.
- [ ] Add `/reset-password` route and page.
- [ ] Add `Background jobs` button on Administration page for `SUPER_ADMIN` only.
- [ ] Add client-side password confirmation and minimum-length UX validation.
- [ ] Add regression tests for the forgot/reset flow where practical.

---

## Deferred Hardening

These are intentionally not part of V1:

- Argon2id password hashing.
- Dual bcrypt/argon2id login verification.
- Automatic rehash-on-login.
- HaveIBeenPwned k-anonymity breach checks.
- CAPTCHA before hard rate-limit failure.
- Account-lock link in reset email.
- Auto-login after password reset.
- User-facing email delivery status.
- RabbitMQ/Kafka broker integration.

Recommended follow-up order:

1. Argon2id migration with dual-hash verification.
2. HIBP breach checks.
3. CAPTCHA only if abuse is observed or expected.
4. Optional auto-login after reset.

---

## Acceptance Criteria

- Unknown and known emails receive identical forgot-password responses.
- Forgot-password response has a minimum duration floor.
- Email and IP-plus-email rate limits are enforced in Postgres.
- Existing route-level IP rate limiter remains in place.
- Raw reset token is never stored in `password_reset_tokens`.
- Raw reset URL is not stored as plain text in River job args.
- Reset email is delivered through River.
- River retries failed reset-email jobs.
- River UI is available only to Super Admin users.
- Administration page shows `Background jobs` only to Super Admin users.
- Reset token expires after 15 minutes.
- Reset token can be used only once.
- Creating a new token invalidates previous unused tokens for the same user.
- Resetting password updates `users.password`.
- Resetting password clears `users.token`.
- Authenticated requests fail when the presented JWT does not match `users.token`.
- Old sessions stop working immediately after password reset.
- Frontend supports request-reset and complete-reset flows.

---

Spec version: V1 - repo-fit forgot password implementation.
