CREATE TABLE main_categories (
    id                 SERIAL PRIMARY KEY,
    main_category_id   TEXT UNIQUE NOT NULL,
    main_category_name TEXT NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE categories
ADD COLUMN main_category_id TEXT REFERENCES main_categories(main_category_id);

CREATE INDEX idx_categories_main_category_id ON categories(main_category_id);
