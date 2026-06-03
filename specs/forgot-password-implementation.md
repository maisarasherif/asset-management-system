# Forgot Password — Implementation Spec (FAANG Style)

## Overview

This document specifies a production-grade "Forgot Password" flow for a **Go + PostgreSQL** backend. Every control listed here is enforced **server-side**. Client-side checks are UX only and must never be the sole gate.

---

## Flow Summary

```
User submits email
  → Rate limit check (IP + email, Postgres-backed)
  → DB lookup (always return 200)
  → Generate secure token
  → Store SHA-256 hash in DB (TTL 15 min, single-use)
  → Queue reset email (token in URL)

User clicks email link
  → Validate token (hash match + not expired + not used)
  → Show new password form
  → Policy + breach check
  → Hash and store new password (argon2id)
  → Revoke all sessions
  → Burn token
  → Write audit log
  → Send confirmation email
  → Auto-login or redirect
```

---

## 1. User Enumeration Protection

**Rule:** The HTTP response status, body, and UI message must be **identical** whether or not the email exists in the database.

```
Response (always):
  HTTP 200 OK
  { "message": "If that address is in our system, you'll receive an email shortly." }
```

- Do not return 404 for unknown emails.
- Normalize response timing with a constant-time delay to prevent timing-based enumeration:

```go
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
    start := time.Now()
    defer func() {
        // Always take at least 300ms regardless of DB hit/miss
        elapsed := time.Since(start)
        if elapsed < 300*time.Millisecond {
            time.Sleep(300*time.Millisecond - elapsed)
        }
    }()

    // ... handler logic
}
```

---

## 2. Rate Limiting (Postgres-backed)

Apply limits at **three levels simultaneously** using a sliding window backed by a Postgres table. No Redis required.

| Dimension      | Limit      | Window |
|----------------|------------|--------|
| Per IP         | 5 requests | 15 min |
| Per email      | 3 requests | 15 min |
| Per IP + email | 3 requests | 15 min |

**Schema:**

```sql
CREATE TABLE rate_limits (
  key          TEXT NOT NULL,
  hits         INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key)
);

CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);
```

**Go implementation:**

```go
func (db *DB) CheckRateLimit(ctx context.Context, key string, maxHits int, window time.Duration) (bool, error) {
    query := `
        INSERT INTO rate_limits (key, hits, window_start)
        VALUES ($1, 1, NOW())
        ON CONFLICT (key) DO UPDATE
          SET hits = CASE
                WHEN rate_limits.window_start < NOW() - $2::interval
                THEN 1
                ELSE rate_limits.hits + 1
              END,
              window_start = CASE
                WHEN rate_limits.window_start < NOW() - $2::interval
                THEN NOW()
                ELSE rate_limits.window_start
              END
        RETURNING hits
    `
    var hits int
    err := db.QueryRowContext(ctx, query, key, window.String()).Scan(&hits)
    if err != nil {
        return false, err
    }
    return hits > maxHits, nil
}

func (h *Handler) checkAllRateLimits(ctx context.Context, ip, email string) error {
    limits := []struct {
        key  string
        max  int
    }{
        {fmt.Sprintf("ip:%s", ip), 5},
        {fmt.Sprintf("email:%s", email), 3},
        {fmt.Sprintf("ip_email:%s:%s", ip, email), 3},
    }
    for _, l := range limits {
        exceeded, err := h.db.CheckRateLimit(ctx, l.key, l.max, 15*time.Minute)
        if err != nil {
            return err
        }
        if exceeded {
            return ErrRateLimitExceeded
        }
    }
    return nil
}
```

**On limit exceeded**, return:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900
Content-Type: application/json

{ "error": "Too many requests. Please try again later." }
```

Add CAPTCHA after 2–3 failures before the hard limit is reached.

---

## 3. Token Generation

Use `crypto/rand` from the Go standard library. **Never use `math/rand` or UUIDs.**

```go
import (
    "crypto/rand"
    "encoding/hex"
)

func generateToken() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return hex.EncodeToString(b), nil // 64-char hex string
}
```

---

## 4. Token Storage

Store only the **SHA-256 hash** of the raw token. Never store the raw token.

```go
import "crypto/sha256"

func hashToken(raw string) string {
    sum := sha256.Sum256([]byte(raw))
    return hex.EncodeToString(sum[:])
}
```

**DB schema:**

```sql
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prt_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX idx_prt_user_id    ON password_reset_tokens (user_id);
```

**Before inserting a new token**, invalidate all existing unused tokens for that user:

```go
func (db *DB) CreateResetToken(ctx context.Context, userID, tokenHash string) error {
    return db.WithTx(ctx, func(tx *sql.Tx) error {
        // Invalidate previous tokens
        _, err := tx.ExecContext(ctx, `
            UPDATE password_reset_tokens
            SET used = TRUE
            WHERE user_id = $1 AND used = FALSE
        `, userID)
        if err != nil {
            return err
        }

        // Insert new token
        _, err = tx.ExecContext(ctx, `
            INSERT INTO password_reset_tokens (user_id, token_hash)
            VALUES ($1, $2)
        `, userID, tokenHash)
        return err
    })
}
```

---

## 5. Reset Email

Queue the email asynchronously using a Postgres-backed job table (e.g. with [River](https://github.com/riverqueue/river) or a simple `outbox` table). Do not block the HTTP response on email delivery.

**Outbox pattern (simple):**

```sql
CREATE TABLE email_outbox (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at    TIMESTAMPTZ,
  attempts   INT NOT NULL DEFAULT 0
);
```

**Reset URL format:**
```
https://app.example.com/reset-password?token=<rawToken>
```

- Token goes in the **URL query parameter**, not the email body as a code.
- Use HTTPS only. Never HTTP.
- Include a visible **"I didn't request this"** link that immediately locks the account.

**Email body must include:**
- Link expires in 15 minutes (state this clearly)
- "If you didn't request this, you can safely ignore this email or [secure your account]."

---

## 6. Token Validation

When the user clicks the link, validate **all three conditions** in a single query before proceeding:

```go
func (db *DB) ValidateResetToken(ctx context.Context, rawToken string) (*ResetToken, error) {
    hash := hashToken(rawToken)

    var t ResetToken
    err := db.QueryRowContext(ctx, `
        SELECT id, user_id
        FROM password_reset_tokens
        WHERE token_hash = $1
          AND used = FALSE
          AND expires_at > NOW()
    `, hash).Scan(&t.ID, &t.UserID)

    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrInvalidToken // generic — do not expose which check failed
    }
    return &t, err
}
```

**Mark as used immediately** (before writing the new password), inside a transaction:

```go
_, err = tx.ExecContext(ctx, `
    UPDATE password_reset_tokens SET used = TRUE WHERE id = $1
`, tokenID)
```

---

## 7. New Password Form (Client-Side UX)

- Password strength meter using [`zxcvbn`](https://github.com/dropbox/zxcvbn)
- Confirm password field
- Require strength score ≥ 3 before enabling submit
- Show character count / requirements inline

> Note: All policy is re-enforced server-side. Client checks are UX only.

---

## 8. Password Policy (Server-Side)

### Complexity rules
- Minimum 12 characters
- No maximum (support up to 128+ chars)
- No mandatory special character rules (NIST SP 800-63B guidance)
- Block passwords that match the username or email

```go
func validatePasswordPolicy(password, email string) error {
    if len(password) < 12 {
        return errors.New("password must be at least 12 characters")
    }
    if strings.EqualFold(password, email) {
        return errors.New("password must not match your email address")
    }
    return nil
}
```

### Breach check (HaveIBeenPwned — k-anonymity)

```go
import (
    "crypto/sha1"
    "fmt"
    "net/http"
    "strings"
)

func isPasswordPwned(ctx context.Context, password string) (bool, error) {
    sum := sha1.Sum([]byte(password))
    hash := strings.ToUpper(fmt.Sprintf("%x", sum))
    prefix, suffix := hash[:5], hash[5:]

    req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
        "https://api.pwnedpasswords.com/range/"+prefix, nil)
    req.Header.Set("Add-Padding", "true")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return false, err
    }
    defer resp.Body.Close()

    // Read response and scan for suffix match
    // Each line: "SUFFIX:count"
    scanner := bufio.NewScanner(resp.Body)
    for scanner.Scan() {
        line := scanner.Text()
        if strings.HasPrefix(line, suffix) {
            return true, nil
        }
    }
    return false, scanner.Err()
}
```

The full password **never leaves the server** — only the 5-char SHA-1 prefix is sent to the HIBP API.

---

## 9. Password Hashing

Use **argon2id** via `golang.org/x/crypto/argon2`.

```go
import (
    "golang.org/x/crypto/argon2"
    "crypto/rand"
    "encoding/base64"
    "fmt"
)

type ArgonParams struct {
    Memory      uint32
    Iterations  uint32
    Parallelism uint8
    SaltLength  uint32
    KeyLength   uint32
}

var defaultArgonParams = ArgonParams{
    Memory:      64 * 1024, // 64 MB
    Iterations:  3,
    Parallelism: 4,
    SaltLength:  16,
    KeyLength:   32,
}

func hashPassword(password string) (string, error) {
    p := defaultArgonParams
    salt := make([]byte, p.SaltLength)
    if _, err := rand.Read(salt); err != nil {
        return "", err
    }

    hash := argon2.IDKey([]byte(password), salt,
        p.Iterations, p.Memory, p.Parallelism, p.KeyLength)

    // Encode as: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
    encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
        argon2.Version,
        p.Memory, p.Iterations, p.Parallelism,
        base64.RawStdEncoding.EncodeToString(salt),
        base64.RawStdEncoding.EncodeToString(hash),
    )
    return encoded, nil
}
```

---

## 10. Post-Reset Cleanup

Execute all of the following **atomically** within a single Postgres transaction:

```go
func (db *DB) CompletePasswordReset(ctx context.Context, userID, tokenID, newHash, ip, userAgent string) error {
    return db.WithTx(ctx, func(tx *sql.Tx) error {
        // a. Mark token as used
        if _, err := tx.ExecContext(ctx,
            `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`, tokenID,
        ); err != nil {
            return err
        }

        // b. Update password
        if _, err := tx.ExecContext(ctx,
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            newHash, userID,
        ); err != nil {
            return err
        }

        // c. Revoke all sessions
        if _, err := tx.ExecContext(ctx,
            `DELETE FROM user_sessions WHERE user_id = $1`, userID,
        ); err != nil {
            return err
        }

        // d. Write audit log
        if _, err := tx.ExecContext(ctx, `
            INSERT INTO security_audit_log (user_id, event, ip_address, user_agent, created_at)
            VALUES ($1, 'password_reset_completed', $2, $3, NOW())`,
            userID, ip, userAgent,
        ); err != nil {
            return err
        }

        // e. Queue confirmation email (outbox pattern)
        if _, err := tx.ExecContext(ctx, `
            INSERT INTO email_outbox (to_address, subject, body_html)
            SELECT email, 'Your password was changed', $1 FROM users WHERE id = $2`,
            confirmationEmailBody, userID,
        ); err != nil {
            return err
        }

        return nil
    })
}
```

### Post-transaction
Issue a new session for the user and redirect to the dashboard (auto-login).

---

## 11. Error Handling Reference

| Scenario                    | HTTP Status | Message shown to user                                       |
|-----------------------------|-------------|-------------------------------------------------------------|
| Email not found             | 200         | "If that address is in our system, you'll receive an email" |
| Rate limit exceeded         | 429         | "Too many requests. Try again later."                       |
| Token invalid / expired     | 400         | "This link is invalid or has expired."                      |
| Token already used          | 400         | "This link is invalid or has expired."                      |
| Password in breach database | 400         | "This password has appeared in a known data breach."        |
| Password too weak           | 400         | "Please choose a stronger password."                        |
| Server error                | 500         | "Something went wrong. Please try again."                   |

> Never reveal which specific check failed for token validation errors. Use the same message for all three failure cases.

---

## 12. Security Checklist

- [ ] User enumeration: identical response for known and unknown emails
- [ ] Constant-time response delay to prevent timing-based enumeration
- [ ] Rate limiting: per-IP, per-email, per-IP+email, Postgres-backed sliding window
- [ ] `Retry-After` header returned on 429
- [ ] CAPTCHA triggered after 2–3 failed attempts
- [ ] Token generated with `crypto/rand` (never `math/rand`)
- [ ] Only SHA-256 hash stored in DB, never the raw token
- [ ] Token TTL ≤ 15 minutes
- [ ] Token is single-use (marked used before password is written)
- [ ] Previous tokens invalidated on new request
- [ ] Token bound to a specific user ID
- [ ] Token in URL parameter, not an email body code
- [ ] Reset link uses HTTPS only
- [ ] HaveIBeenPwned k-anonymity check on new password
- [ ] `argon2id` used for password hashing
- [ ] All active sessions revoked after reset (within same transaction)
- [ ] Audit log entry written (within same transaction)
- [ ] Confirmation email queued via outbox (within same transaction)
- [ ] No timing differences that reveal account existence

---

## Dependencies

| Package                        | Purpose                         |
|--------------------------------|---------------------------------|
| `golang.org/x/crypto/argon2`   | Password hashing                |
| `database/sql` + `lib/pq`      | Postgres driver                 |
| `net/http`                     | HaveIBeenPwned API call         |
| `crypto/rand`, `crypto/sha256` | Token generation and hashing    |
| `zxcvbn` (JS, frontend only)   | Client-side strength estimation |
| SMTP / SES SDK                 | Email delivery (outbox worker)  |

No Redis required. All rate limiting and job queuing uses Postgres.

---

*Spec version: 1.1 — Go + PostgreSQL. Based on NIST SP 800-63B, OWASP Authentication Cheat Sheet, and common FAANG security practices.*
