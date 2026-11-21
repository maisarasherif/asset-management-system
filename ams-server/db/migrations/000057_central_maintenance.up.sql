
CREATE TABLE maintenance_plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE RESTRICT,
    component_id UUID REFERENCES components(component_id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    interval_hours BIGINT,
    interval_months INTEGER,
    next_due_hours BIGINT,
    next_due_date DATE,
    quarantine_when_due BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (interval_hours IS NOT NULL OR interval_months IS NOT NULL),
    CHECK ((interval_hours IS NULL AND next_due_hours IS NULL) OR
           (interval_hours IS NOT NULL AND interval_hours > 0 AND next_due_hours IS NOT NULL AND next_due_hours >= 0)),
    CHECK ((interval_months IS NULL AND next_due_date IS NULL) OR
           (interval_months IS NOT NULL AND interval_months > 0 AND next_due_date IS NOT NULL))
);
CREATE INDEX maintenance_plans_asset_idx ON maintenance_plans(asset_id);
CREATE INDEX maintenance_plans_component_idx ON maintenance_plans(component_id);
CREATE INDEX maintenance_plans_date_idx ON maintenance_plans(next_due_date) WHERE active;

CREATE TABLE maintenance_work_orders (
    work_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT NOT NULL UNIQUE,
    plan_id UUID REFERENCES maintenance_plans(plan_id) ON DELETE RESTRICT,
    asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE RESTRICT,
    component_id UUID REFERENCES components(component_id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    assignee_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_hours BIGINT,
    due_date DATE,
    closed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    completion_notes TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX maintenance_one_open_order_per_plan ON maintenance_work_orders(plan_id)
WHERE plan_id IS NOT NULL AND status IN ('OPEN', 'IN_PROGRESS');
CREATE INDEX maintenance_orders_asset_idx ON maintenance_work_orders(asset_id);
CREATE INDEX maintenance_orders_component_idx ON maintenance_work_orders(component_id);

CREATE TABLE maintenance_quarantines (
    quarantine_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE RESTRICT,
    component_id UUID REFERENCES components(component_id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    tagged_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    tagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    released_at TIMESTAMPTZ,
    release_notes TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX maintenance_open_asset_quarantine
ON maintenance_quarantines(asset_id) WHERE component_id IS NULL AND released_at IS NULL;
CREATE UNIQUE INDEX maintenance_open_component_quarantine
ON maintenance_quarantines(component_id) WHERE component_id IS NOT NULL AND released_at IS NULL;
CREATE INDEX maintenance_quarantines_asset_idx ON maintenance_quarantines(asset_id);
CREATE INDEX maintenance_quarantines_component_idx ON maintenance_quarantines(component_id);

CREATE TABLE maintenance_quarantine_orders (
    quarantine_id UUID NOT NULL REFERENCES maintenance_quarantines(quarantine_id) ON DELETE RESTRICT,
    work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(work_order_id) ON DELETE RESTRICT,
    PRIMARY KEY (quarantine_id, work_order_id)
);

CREATE FUNCTION guard_quarantined_deployment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    parent_id UUID;
    target_component_id UUID;
BEGIN
    IF trim(NEW.assigned_project) = '' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND lower(trim(NEW.assigned_project)) = lower(trim(OLD.assigned_project)) THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'components' THEN
        parent_id := NEW.asset_id;
        target_component_id := NEW.component_id;
        -- Serialize component deployment with whole-asset and component tag changes.
        PERFORM 1 FROM assets WHERE asset_id = parent_id FOR UPDATE;
    ELSE
        parent_id := NEW.asset_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM maintenance_quarantines
        WHERE asset_id = parent_id AND released_at IS NULL
          AND (component_id IS NULL OR component_id = target_component_id)
    ) THEN
        RAISE EXCEPTION 'Quarantined equipment cannot be assigned to a new project'
            USING ERRCODE = '23514', CONSTRAINT = 'quarantined_deployment';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER guard_asset_deployment BEFORE UPDATE OF assigned_project ON assets
FOR EACH ROW EXECUTE FUNCTION guard_quarantined_deployment();
CREATE TRIGGER guard_component_deployment BEFORE INSERT OR UPDATE OF assigned_project ON components
FOR EACH ROW EXECUTE FUNCTION guard_quarantined_deployment();
