CREATE TABLE scheduled_tasks (
    id              SERIAL PRIMARY KEY,
    task_id         TEXT UNIQUE NOT NULL,
    certificate_id  TEXT NOT NULL REFERENCES certificates(certificate_id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('EMAIL', 'CLICKUP')),
    status          TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_tasks_certificate_id ON scheduled_tasks(certificate_id);
CREATE INDEX idx_scheduled_tasks_type ON scheduled_tasks(type);
CREATE INDEX idx_scheduled_tasks_sent_at ON scheduled_tasks(sent_at);