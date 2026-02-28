ALTER TABLE components
ADD COLUMN category_id TEXT REFERENCES categories(category_id);

UPDATE components c
SET category_id = a.category_id
FROM assets a
WHERE c.asset_id = a.asset_id;

ALTER TABLE components
ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE assets
DROP COLUMN category_id;

CREATE INDEX idx_components_category_id ON components(category_id);
