
CREATE SEQUENCE inspection_work_order_number_seq;

CREATE TABLE inspection_work_orders (
    work_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL UNIQUE DEFAULT ('I-' || nextval('inspection_work_order_number_seq')::text),
    certificate_id UUID NOT NULL REFERENCES certificates(certificate_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED')),
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    issuance_id UUID REFERENCES certificate_issuances(issuance_id),
    CHECK ((status = 'COMPLETED') = (closed_at IS NOT NULL AND issuance_id IS NOT NULL))
);
CREATE UNIQUE INDEX inspection_one_open_order_per_certificate
    ON inspection_work_orders(certificate_id) WHERE status IN ('OPEN', 'IN_PROGRESS');
CREATE INDEX inspection_orders_certificate_idx ON inspection_work_orders(certificate_id);

CREATE FUNCTION refresh_inspection_work_orders(target_certificate UUID DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
    WITH actionable AS (
        SELECT c.certificate_id, (c.expiry_date AT TIME ZONE 'UTC')::date AS due_date
        FROM certificates c
        WHERE (target_certificate IS NULL OR c.certificate_id = target_certificate)
          AND (
              (c.status = 'PENDING' AND btrim(COALESCE(c.certificate_file, '')) = '')
              OR (c.expiry_date AT TIME ZONE 'UTC')::date <= (now() AT TIME ZONE 'Asia/Dubai')::date + 30
          )
          AND NOT EXISTS (
              SELECT 1 FROM inspection_work_orders i
              WHERE i.certificate_id = c.certificate_id AND i.status IN ('OPEN', 'IN_PROGRESS')
          )
        ORDER BY c.certificate_id
        FOR NO KEY UPDATE OF c
    )
    INSERT INTO inspection_work_orders (certificate_id, due_date)
    SELECT certificate_id, due_date FROM actionable
    ON CONFLICT (certificate_id) WHERE status IN ('OPEN', 'IN_PROGRESS') DO NOTHING;
$$;

CREATE FUNCTION update_inspection_on_certificate_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Publication and issuance completion share a transaction. The latter opens the next cycle.
        IF NEW.certificate_file IS DISTINCT FROM OLD.certificate_file AND EXISTS (
            SELECT 1 FROM certificate_issuances
            WHERE certificate_id = NEW.certificate_id AND file_key = NEW.certificate_file AND state = 'PROCESSING'
        ) THEN
            RETURN NEW;
        END IF;
        IF NEW.expiry_date IS DISTINCT FROM OLD.expiry_date THEN
            UPDATE inspection_work_orders
               SET due_date = (NEW.expiry_date AT TIME ZONE 'UTC')::date
             WHERE certificate_id = NEW.certificate_id AND status IN ('OPEN', 'IN_PROGRESS');
        END IF;
    END IF;
    PERFORM refresh_inspection_work_orders(NEW.certificate_id);
    RETURN NEW;
END
$$;
CREATE TRIGGER refresh_inspection_on_certificate_change
AFTER INSERT OR UPDATE OF status, expiry_date ON certificates
FOR EACH ROW EXECUTE FUNCTION update_inspection_on_certificate_change();

CREATE FUNCTION complete_inspection_on_issuance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE inspection_work_orders
       SET status = 'COMPLETED', closed_at = NEW.completed_at, issuance_id = NEW.issuance_id
     WHERE certificate_id = NEW.certificate_id AND status IN ('OPEN', 'IN_PROGRESS')
       AND created_at <= NEW.completed_at;
    -- The published certificate begins a new cycle, which can already be due for short validity periods.
    PERFORM refresh_inspection_work_orders(NEW.certificate_id);
    RETURN NEW;
END
$$;
CREATE TRIGGER complete_inspection_on_issuance
AFTER UPDATE OF state ON certificate_issuances
FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'COMPLETED')
EXECUTE FUNCTION complete_inspection_on_issuance();

CREATE VIEW shared_work_orders AS
SELECT w.work_order_id, w.display_id, w.plan_id, w.asset_id, w.component_id,
    w.title, w.description, w.status, w.assignee_id, w.created_at, w.due_hours,
    w.due_date, w.closed_at, w.completion_notes,
    NULL::uuid AS certificate_id, NULL::uuid AS issuance_id, 'MAINTENANCE'::text AS work_type,
    a.name AS asset_name, a.display_id AS asset_number, COALESCE(c.name,'') AS component_name,
    COALESCE(NULLIF(trim(concat(u.first_name,' ',u.last_name)), ''), u.email, '') AS assignee_name
FROM maintenance_work_orders w JOIN assets a USING (asset_id)
LEFT JOIN components c USING (component_id) LEFT JOIN users u ON u.user_id = w.assignee_id
UNION ALL
SELECT i.work_order_id, i.display_id, NULL::uuid, a.asset_id, c.component_id,
    cert.certificate_name, ''::text, i.status, NULL::uuid, i.created_at, NULL::bigint,
    i.due_date, i.closed_at, ''::text, i.certificate_id, i.issuance_id, 'INSPECTION'::text,
    a.name, a.display_id, c.name, ''::text
FROM inspection_work_orders i
JOIN certificates cert USING (certificate_id)
JOIN components c USING (component_id)
JOIN assets a USING (asset_id);

SELECT refresh_inspection_work_orders();
