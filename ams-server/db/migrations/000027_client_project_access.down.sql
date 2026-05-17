DROP INDEX IF EXISTS idx_user_project_access_project;
DROP INDEX IF EXISTS idx_user_project_access_user_status;
DROP TABLE IF EXISTS user_project_access;
DROP INDEX IF EXISTS idx_projects_normalized_name;
DROP TABLE IF EXISTS projects;

ALTER TABLE users DROP COLUMN IF EXISTS status;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'USER'));
