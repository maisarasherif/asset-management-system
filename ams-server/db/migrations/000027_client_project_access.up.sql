ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'USER', 'CLIENT'));

ALTER TABLE users
ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED'));

CREATE TABLE projects (
    project_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_projects_normalized_name
ON projects (LOWER(TRIM(project_name)));

INSERT INTO projects (project_name)
SELECT DISTINCT TRIM(project_name)
FROM (
    SELECT assigned_project AS project_name FROM assets
    UNION
    SELECT assigned_project AS project_name FROM components
) source_projects
WHERE TRIM(project_name) <> ''
ON CONFLICT DO NOTHING;

CREATE TABLE user_project_access (
    access_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, project_id)
);

CREATE INDEX idx_user_project_access_user_status
ON user_project_access (user_id, status);

CREATE INDEX idx_user_project_access_project
ON user_project_access (project_id);
