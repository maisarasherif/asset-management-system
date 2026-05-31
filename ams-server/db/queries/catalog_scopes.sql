-- name: GetAllCatalogScopes :many
SELECT
    scope_id,
    display_id,
    scope_name,
    description,
    created_at,
    updated_at
FROM catalog_scopes
ORDER BY created_at ASC, scope_name ASC;

-- name: GetCatalogScopeByID :one
SELECT
    scope_id,
    display_id,
    scope_name,
    description,
    created_at,
    updated_at
FROM catalog_scopes
WHERE scope_id = $1
LIMIT 1;

-- name: GetDefaultCatalogScope :one
SELECT
    scope_id,
    display_id,
    scope_name,
    description,
    created_at,
    updated_at
FROM catalog_scopes
ORDER BY created_at ASC, scope_name ASC
LIMIT 1;

-- name: CreateCatalogScope :one
INSERT INTO catalog_scopes (display_id, scope_name, description, created_at, updated_at)
VALUES (
    next_display_id('catalog_scope_display_id_seq'),
    sqlc.arg(scope_name),
    sqlc.arg(description),
    NOW(),
    NOW()
)
RETURNING
    scope_id,
    display_id,
    scope_name,
    description,
    created_at,
    updated_at;

-- name: UpdateCatalogScope :execrows
UPDATE catalog_scopes
SET scope_name = sqlc.arg(scope_name),
    description = sqlc.arg(description),
    updated_at = NOW()
WHERE scope_id = sqlc.arg(scope_id);

-- name: DeleteCatalogScope :execrows
DELETE FROM catalog_scopes
WHERE scope_id = $1;

-- name: CountCatalogScopeReferences :one
SELECT
    (
        SELECT COUNT(*)
        FROM components c
        JOIN catalog_scope_categories csc ON csc.scope_category_id = c.scope_category_id
        WHERE csc.scope_id = $1
    ) +
    (
        SELECT COUNT(*)
        FROM template_components tc
        JOIN catalog_scope_categories csc ON csc.scope_category_id = tc.scope_category_id
        WHERE csc.scope_id = $1
    )::bigint AS reference_count;

-- name: FindMainCategoryByName :one
SELECT
    main_category_id,
    display_id,
    sort_order,
    main_category_name,
    description,
    created_at,
    updated_at
FROM main_categories
WHERE LOWER(TRIM(main_category_name)) = LOWER(TRIM(sqlc.arg(main_category_name)))
ORDER BY created_at ASC
LIMIT 1;

-- name: CreateMainCategoryDictionary :one
INSERT INTO main_categories (
    display_id,
    sort_order,
    main_category_name,
    description,
    created_at,
    updated_at
)
VALUES (
    next_display_id('main_category_display_id_seq'),
    COALESCE((SELECT MAX(sort_order) + 1 FROM main_categories), 1),
    sqlc.arg(main_category_name),
    sqlc.arg(description),
    NOW(),
    NOW()
)
RETURNING
    main_category_id,
    display_id,
    sort_order,
    main_category_name,
    description,
    created_at,
    updated_at;

-- name: UpdateMainCategoryDictionary :execrows
UPDATE main_categories
SET main_category_name = sqlc.arg(main_category_name),
    description = sqlc.arg(description),
    updated_at = NOW()
WHERE main_category_id = sqlc.arg(main_category_id);

-- name: FindCategoryByName :one
SELECT
    category_id,
    display_id,
    main_category_id,
    sort_order,
    category_name,
    description,
    created_at,
    updated_at
FROM categories
WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(sqlc.arg(category_name)))
ORDER BY created_at ASC
LIMIT 1;

-- name: CreateCategoryDictionary :one
INSERT INTO categories (
    display_id,
    main_category_id,
    sort_order,
    category_name,
    description,
    created_at,
    updated_at
)
VALUES (
    next_display_id('category_display_id_seq'),
    sqlc.arg(main_category_id),
    COALESCE(
        (
            SELECT MAX(sort_order) + 1
            FROM categories
            WHERE main_category_id = sqlc.arg(main_category_id)
        ),
        1
    ),
    sqlc.arg(category_name),
    sqlc.arg(description),
    NOW(),
    NOW()
)
RETURNING
    category_id,
    display_id,
    main_category_id,
    sort_order,
    category_name,
    description,
    created_at,
    updated_at;

-- name: UpdateCategoryDictionary :execrows
UPDATE categories
SET category_name = sqlc.arg(category_name),
    description = sqlc.arg(description),
    updated_at = NOW()
WHERE category_id = sqlc.arg(category_id);

-- name: GetCatalogScopeMainCategoriesPaginated :many
SELECT
    csmc.scope_main_category_id,
    csmc.display_id,
    csmc.scope_id,
    csmc.main_category_id,
    csmc.sort_order,
    mc.display_id AS main_category_display_id,
    mc.main_category_name,
    mc.description,
    csmc.created_at,
    csmc.updated_at
FROM catalog_scope_main_categories csmc
JOIN main_categories mc ON mc.main_category_id = csmc.main_category_id
WHERE csmc.scope_id = sqlc.arg(scope_id)
ORDER BY csmc.sort_order ASC, csmc.created_at ASC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountCatalogScopeMainCategories :one
SELECT COUNT(*)
FROM catalog_scope_main_categories
WHERE scope_id = $1;

-- name: GetCatalogScopeMainCategoryByID :one
SELECT
    csmc.scope_main_category_id,
    csmc.display_id,
    csmc.scope_id,
    csmc.main_category_id,
    csmc.sort_order,
    mc.display_id AS main_category_display_id,
    mc.main_category_name,
    mc.description,
    csmc.created_at,
    csmc.updated_at
FROM catalog_scope_main_categories csmc
JOIN main_categories mc ON mc.main_category_id = csmc.main_category_id
WHERE csmc.scope_main_category_id = $1
LIMIT 1;

-- name: CreateCatalogScopeMainCategory :one
INSERT INTO catalog_scope_main_categories (
    display_id,
    scope_id,
    main_category_id,
    sort_order,
    created_at,
    updated_at
)
VALUES (
    next_display_id('catalog_scope_main_category_display_id_seq'),
    sqlc.arg(scope_id),
    sqlc.arg(main_category_id),
    sqlc.arg(sort_order),
    NOW(),
    NOW()
)
RETURNING
    scope_main_category_id,
    display_id,
    scope_id,
    main_category_id,
    sort_order,
    created_at,
    updated_at;

-- name: UpdateCatalogScopeMainCategory :execrows
UPDATE catalog_scope_main_categories
SET main_category_id = sqlc.arg(main_category_id),
    sort_order = sqlc.arg(sort_order),
    updated_at = NOW()
WHERE scope_main_category_id = sqlc.arg(scope_main_category_id);

-- name: DeleteCatalogScopeMainCategory :execrows
DELETE FROM catalog_scope_main_categories
WHERE scope_main_category_id = $1;

-- name: CountCatalogScopeCategoriesByMainCategory :one
SELECT COUNT(*)
FROM catalog_scope_categories
WHERE scope_id = sqlc.arg(scope_id)
  AND main_category_id = sqlc.arg(main_category_id);

-- name: DuplicateCatalogScopeMainCategories :execrows
INSERT INTO catalog_scope_main_categories (
    display_id,
    scope_id,
    main_category_id,
    sort_order,
    created_at,
    updated_at
)
SELECT
    next_display_id('catalog_scope_main_category_display_id_seq'),
    sqlc.arg(target_scope_id),
    main_category_id,
    sort_order,
    NOW(),
    NOW()
FROM catalog_scope_main_categories
WHERE catalog_scope_main_categories.scope_id = sqlc.arg(source_scope_id)
ORDER BY sort_order ASC, created_at ASC;

-- name: GetCatalogScopeCategoriesPaginated :many
SELECT
    csc.scope_category_id,
    csc.display_id,
    csc.scope_id,
    csc.main_category_id,
    mc.display_id AS main_category_display_id,
    mc.main_category_name,
    csc.category_id,
    c.display_id AS category_display_id,
    c.category_name,
    csc.sort_order,
    csc.description,
    csc.created_at,
    csc.updated_at
FROM catalog_scope_categories csc
JOIN main_categories mc ON mc.main_category_id = csc.main_category_id
JOIN categories c ON c.category_id = csc.category_id
WHERE csc.scope_id = sqlc.arg(scope_id)
ORDER BY
    (
        SELECT csmc.sort_order
        FROM catalog_scope_main_categories csmc
        WHERE csmc.scope_id = csc.scope_id
          AND csmc.main_category_id = csc.main_category_id
        LIMIT 1
    ) ASC NULLS LAST,
    csc.sort_order ASC,
    csc.created_at ASC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountCatalogScopeCategories :one
SELECT COUNT(*)
FROM catalog_scope_categories
WHERE scope_id = $1;

-- name: GetCatalogScopeCategoryByID :one
SELECT
    csc.scope_category_id,
    csc.display_id,
    csc.scope_id,
    csc.main_category_id,
    mc.display_id AS main_category_display_id,
    mc.main_category_name,
    csc.category_id,
    c.display_id AS category_display_id,
    c.category_name,
    csc.sort_order,
    csc.description,
    csc.created_at,
    csc.updated_at
FROM catalog_scope_categories csc
JOIN main_categories mc ON mc.main_category_id = csc.main_category_id
JOIN categories c ON c.category_id = csc.category_id
WHERE csc.scope_category_id = $1
LIMIT 1;

-- name: GetCatalogScopeCategoryByCategoryID :one
SELECT
    scope_category_id,
    display_id,
    scope_id,
    main_category_id,
    category_id,
    sort_order,
    description,
    created_at,
    updated_at
FROM catalog_scope_categories
WHERE category_id = sqlc.arg(category_id)
ORDER BY created_at ASC
LIMIT 1;

-- name: GetExistingScopeCategoryIDs :many
SELECT scope_category_id
FROM catalog_scope_categories
WHERE scope_category_id = ANY($1::uuid[])
ORDER BY scope_category_id ASC;

-- name: CreateCatalogScopeCategory :one
INSERT INTO catalog_scope_categories (
    display_id,
    scope_id,
    main_category_id,
    category_id,
    sort_order,
    description,
    created_at,
    updated_at
)
VALUES (
    next_display_id('catalog_scope_category_display_id_seq'),
    sqlc.arg(scope_id),
    sqlc.arg(main_category_id),
    sqlc.arg(category_id),
    sqlc.arg(sort_order),
    sqlc.arg(description),
    NOW(),
    NOW()
)
RETURNING
    scope_category_id,
    display_id,
    scope_id,
    main_category_id,
    category_id,
    sort_order,
    description,
    created_at,
    updated_at;

-- name: UpdateCatalogScopeCategory :execrows
UPDATE catalog_scope_categories
SET main_category_id = sqlc.arg(main_category_id),
    category_id = sqlc.arg(category_id),
    sort_order = sqlc.arg(sort_order),
    description = sqlc.arg(description),
    updated_at = NOW()
WHERE scope_category_id = sqlc.arg(scope_category_id);

-- name: DeleteCatalogScopeCategory :execrows
DELETE FROM catalog_scope_categories
WHERE scope_category_id = $1;

-- name: CountCatalogScopeCategoryReferences :one
SELECT
    (
        SELECT COUNT(*)
        FROM components c
        WHERE c.scope_category_id = $1
    ) +
    (
        SELECT COUNT(*)
        FROM template_components tc
        WHERE tc.scope_category_id = $1
    )::bigint AS reference_count;

-- name: DuplicateCatalogScopeCategories :execrows
INSERT INTO catalog_scope_categories (
    display_id,
    scope_id,
    main_category_id,
    category_id,
    sort_order,
    description,
    created_at,
    updated_at
)
SELECT
    next_display_id('catalog_scope_category_display_id_seq'),
    sqlc.arg(target_scope_id),
    main_category_id,
    category_id,
    sort_order,
    description,
    NOW(),
    NOW()
FROM catalog_scope_categories
WHERE catalog_scope_categories.scope_id = sqlc.arg(source_scope_id)
ORDER BY main_category_id, sort_order ASC, created_at ASC;
