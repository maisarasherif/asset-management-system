CREATE SEQUENCE IF NOT EXISTS notification_delivery_display_id_seq;

CREATE TABLE IF NOT EXISTS notification_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL DEFAULT next_display_id('notification_delivery_display_id_seq'),
    source_type TEXT NOT NULL,
    source_id UUID NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    tier TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    external_id TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_deliveries_idempotency_key
ON notification_deliveries(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_source
ON notification_deliveries(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
ON notification_deliveries(status, channel, created_at);

INSERT INTO notification_deliveries (
    display_id,
    source_type,
    source_id,
    channel,
    status,
    tier,
    idempotency_key,
    external_id,
    created_at,
    updated_at,
    sent_at
)
SELECT
    display_id,
    'certificate_expiry',
    certificate_id,
    type,
    status,
    tier,
    idempotency_key,
    external_task_id,
    sent_at,
    sent_at,
    CASE WHEN status = 'SENT' THEN sent_at ELSE NULL END
FROM scheduled_tasks
WHERE idempotency_key LIKE 'cert-expiry:%'
ON CONFLICT (idempotency_key) DO NOTHING;
