ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'USER'));

CREATE TABLE user_management_audit_logs (
    audit_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id      UUID,
    actor_email        TEXT NOT NULL DEFAULT '',
    action             TEXT NOT NULL CHECK (action IN ('CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'RESET_PASSWORD')),
    target_user_id     UUID,
    target_email       TEXT NOT NULL DEFAULT '',
    target_role_before TEXT NOT NULL DEFAULT '',
    target_role_after  TEXT NOT NULL DEFAULT '',
    details            TEXT NOT NULL DEFAULT '',
    ip_address         TEXT NOT NULL DEFAULT '',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_management_audit_logs_created_at
    ON user_management_audit_logs (created_at DESC);

CREATE INDEX idx_user_management_audit_logs_target_user_id
    ON user_management_audit_logs (target_user_id);
