CREATE TABLE hr_admin_departments (
    department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_name TEXT NOT NULL UNIQUE,
    sort_order INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO hr_admin_departments (department_name, sort_order) VALUES
    ('HR & Administration', 10),
    ('Finance', 20),
    ('Top Management', 30),
    ('Commercial', 40),
    ('Planning', 50),
    ('Operations', 60),
    ('Diving', 70),
    ('QHSE', 80);
