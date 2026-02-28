DROP INDEX IF EXISTS idx_components_category_id;

ALTER TABLE assets
ADD COLUMN category_id TEXT REFERENCES categories(category_id);

UPDATE assets a
SET category_id = COALESCE(
    (
        SELECT c.category_id
        FROM components c
        WHERE c.asset_id = a.asset_id
        LIMIT 1
    ),
    (
        SELECT category_id
        FROM categories
        ORDER BY id
        LIMIT 1
    )
);

ALTER TABLE assets
ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE components
DROP COLUMN category_id;
