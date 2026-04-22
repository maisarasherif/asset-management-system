WITH ordered_main_categories AS (
    SELECT
        main_category_id,
        ROW_NUMBER() OVER (ORDER BY created_at ASC, display_id ASC) AS next_sort_order
    FROM main_categories
)
UPDATE main_categories mc
SET sort_order = -omc.next_sort_order
FROM ordered_main_categories omc
WHERE mc.main_category_id = omc.main_category_id;

UPDATE main_categories
SET sort_order = ABS(sort_order);

WITH ordered_categories AS (
    SELECT
        category_id,
        ROW_NUMBER() OVER (
            PARTITION BY main_category_id
            ORDER BY created_at ASC, display_id ASC
        ) AS next_sort_order
    FROM categories
)
UPDATE categories c
SET sort_order = -oc.next_sort_order
FROM ordered_categories oc
WHERE c.category_id = oc.category_id;

UPDATE categories
SET sort_order = ABS(sort_order);
