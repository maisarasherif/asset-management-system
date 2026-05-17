DROP TABLE IF EXISTS user_management_audit_logs;

UPDATE users SET role = 'ADMIN' WHERE role = 'SUPER_ADMIN';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'USER'));
