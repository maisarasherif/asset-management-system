DROP INDEX IF EXISTS idx_categories_main_category_id;

ALTER TABLE categories
DROP COLUMN IF EXISTS main_category_id;

DROP TABLE IF EXISTS main_categories;
