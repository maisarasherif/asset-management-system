
CREATE TABLE maintenance_stores (
    store_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID UNIQUE REFERENCES projects(project_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX maintenance_one_warehouse ON maintenance_stores ((project_id IS NULL))
WHERE project_id IS NULL;
INSERT INTO maintenance_stores (project_id) VALUES (NULL);

CREATE TABLE maintenance_parts (
    part_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_number TEXT NOT NULL,
    name TEXT NOT NULL
);
CREATE UNIQUE INDEX maintenance_parts_number_idx ON maintenance_parts(lower(part_number));

CREATE TABLE maintenance_stock (
    store_id UUID NOT NULL REFERENCES maintenance_stores(store_id) ON DELETE RESTRICT,
    part_id UUID NOT NULL REFERENCES maintenance_parts(part_id) ON DELETE RESTRICT,
    quantity BIGINT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, part_id)
);

CREATE TABLE maintenance_part_usage (
    usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(work_order_id) ON DELETE RESTRICT,
    store_id UUID NOT NULL,
    part_id UUID NOT NULL,
    quantity BIGINT NOT NULL CHECK (quantity >= 0),
    version BIGINT NOT NULL DEFAULT 1,
    recorded_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (store_id, part_id) REFERENCES maintenance_stock(store_id, part_id) ON DELETE RESTRICT
);
CREATE INDEX maintenance_usage_order_idx ON maintenance_part_usage(work_order_id);
CREATE INDEX maintenance_usage_stock_idx ON maintenance_part_usage(store_id, part_id);

CREATE TABLE maintenance_stock_changes (
    change_id UUID PRIMARY KEY,
    usage_id UUID REFERENCES maintenance_part_usage(usage_id) ON DELETE RESTRICT,
    store_id UUID NOT NULL,
    part_id UUID NOT NULL,
    previous_quantity BIGINT NOT NULL,
    quantity BIGINT NOT NULL,
    resulting_usage BIGINT,
    reason TEXT NOT NULL,
    changed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (store_id, part_id) REFERENCES maintenance_stock(store_id, part_id) ON DELETE RESTRICT
);
CREATE INDEX maintenance_stock_change_balance_idx ON maintenance_stock_changes(store_id, part_id, changed_at DESC);
CREATE INDEX maintenance_stock_change_usage_idx ON maintenance_stock_changes(usage_id, changed_at DESC);
