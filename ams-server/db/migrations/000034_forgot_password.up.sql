CREATE TABLE forgot_password_rate_limits (
  key          TEXT PRIMARY KEY,
  hits         INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forgot_password_rate_limits_window
  ON forgot_password_rate_limits (window_start);

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
