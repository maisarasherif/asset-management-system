package controllers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

var errCategoryNotFound = errors.New("category not found")

func getOrCreateMainCategory(ctx context.Context, queries *db.Queries, name, description string) (uuid.UUID, error) {
	existing, err := queries.FindMainCategoryByName(ctx, name)
	if err == nil {
		return existing.MainCategoryID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}

	created, err := queries.CreateMainCategoryDictionary(ctx, db.CreateMainCategoryDictionaryParams{
		MainCategoryName: name,
		Description:      description,
	})
	if err != nil {
		return uuid.Nil, err
	}
	return created.MainCategoryID, nil
}

func resolveScopeCategoryReference(ctx context.Context, queries *db.Queries, scopeCategoryIDValue, categoryIDValue string) (uuid.UUID, uuid.UUID, error) {
	if scopeCategoryIDValue != "" {
		scopeCategoryID, err := utils.ParseUUID(scopeCategoryIDValue, "scope_category_id")
		if err != nil {
			return uuid.Nil, uuid.Nil, err
		}
		scopeCategory, err := queries.GetCatalogScopeCategoryByID(ctx, scopeCategoryID)
		if err != nil {
			return uuid.Nil, uuid.Nil, err
		}
		return scopeCategory.CategoryID, scopeCategory.ScopeCategoryID, nil
	}

	categoryID, err := utils.ParseUUID(categoryIDValue, "category_id")
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	if _, err := queries.GetCategoryByID(ctx, categoryID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, uuid.Nil, errCategoryNotFound
		}
		return uuid.Nil, uuid.Nil, err
	}
	scopeCategory, err := queries.GetCatalogScopeCategoryByCategoryID(ctx, categoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, uuid.Nil, fmt.Errorf("category is not assigned to a catalog scope")
		}
		return uuid.Nil, uuid.Nil, err
	}
	return categoryID, scopeCategory.ScopeCategoryID, nil
}

func writeScopeCategoryReferenceError(c *gin.Context, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, errCategoryNotFound) {
		status = http.StatusNotFound
	}
	c.JSON(status, gin.H{"error": err.Error()})
}

func getOrCreateCategory(ctx context.Context, queries *db.Queries, mainCategoryID uuid.UUID, name, description string) (uuid.UUID, error) {
	existing, err := queries.FindCategoryByName(ctx, name)
	if err == nil {
		return existing.CategoryID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}

	created, err := queries.CreateCategoryDictionary(ctx, db.CreateCategoryDictionaryParams{
		MainCategoryID: &mainCategoryID,
		CategoryName:   name,
		Description:    description,
	})
	if err != nil {
		return uuid.Nil, err
	}
	return created.CategoryID, nil
}

func GetCatalogScopes(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		scopes, err := db.New(pool).GetAllCatalogScopes(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scopes"})
			return
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(scopes))
	}
}

func GetDefaultCatalogScope(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		scope, err := db.New(pool).GetDefaultCatalogScope(ctx)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope"})
			return
		}

		c.JSON(http.StatusOK, scope)
	}
}

func AddCatalogScope(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.CatalogScopeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		scope, err := db.New(pool).CreateCatalogScope(ctx, db.CreateCatalogScopeParams{
			ScopeName:   input.ScopeName,
			Description: input.Description,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "catalog scope name is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create catalog scope"})
			return
		}

		c.JSON(http.StatusCreated, scope)
	}
}

func UpdateCatalogScope(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeID, ok := utils.ParseUUIDParam(c, "scope_id")
		if !ok {
			return
		}

		var input dto.CatalogScopeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		rows, err := db.New(pool).UpdateCatalogScope(ctx, db.UpdateCatalogScopeParams{
			ScopeName:   input.ScopeName,
			Description: input.Description,
			ScopeID:     scopeID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "catalog scope name is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update catalog scope"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "catalog scope updated successfully"})
	}
}

func DuplicateCatalogScope(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		sourceScopeID, ok := utils.ParseUUIDParam(c, "scope_id")
		if !ok {
			return
		}

		var input dto.CatalogScopeDuplicateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin catalog scope duplicate transaction"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)
		if _, err := queries.GetCatalogScopeByID(ctx, sourceScopeID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope"})
			return
		}

		scope, err := queries.CreateCatalogScope(ctx, db.CreateCatalogScopeParams{
			ScopeName:   input.ScopeName,
			Description: input.Description,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "catalog scope name is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create catalog scope duplicate"})
			return
		}

		if _, err := queries.DuplicateCatalogScopeMainCategories(ctx, db.DuplicateCatalogScopeMainCategoriesParams{
			SourceScopeID: sourceScopeID,
			TargetScopeID: scope.ScopeID,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to duplicate catalog scope main categories"})
			return
		}

		if _, err := queries.DuplicateCatalogScopeCategories(ctx, db.DuplicateCatalogScopeCategoriesParams{
			SourceScopeID: sourceScopeID,
			TargetScopeID: scope.ScopeID,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to duplicate catalog scope categories"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit catalog scope duplicate"})
			return
		}

		c.JSON(http.StatusCreated, scope)
	}
}

func DeleteCatalogScope(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeID, ok := utils.ParseUUIDParam(c, "scope_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)
		if _, err := queries.GetCatalogScopeByID(ctx, scopeID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope"})
			return
		}

		scopes, err := queries.GetAllCatalogScopes(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check catalog scopes"})
			return
		}
		if len(scopes) <= 1 {
			c.JSON(http.StatusConflict, gin.H{"error": "at least one catalog scope is required"})
			return
		}

		references, err := queries.CountCatalogScopeReferences(ctx, scopeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check catalog scope references"})
			return
		}
		if references > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "catalog scope is referenced by components or templates"})
			return
		}

		rows, err := queries.DeleteCatalogScope(ctx, scopeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete catalog scope"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "catalog scope deleted successfully"})
	}
}

func GetCatalogScopeMainCategories(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeID, ok := utils.ParseUUIDParam(c, "scope_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		if _, err := queries.GetCatalogScopeByID(ctx, scopeID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope"})
			return
		}

		items, err := queries.GetCatalogScopeMainCategoriesPaginated(ctx, db.GetCatalogScopeMainCategoriesPaginatedParams{
			ScopeID:    scopeID,
			PageLimit:  limit,
			PageOffset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope main categories"})
			return
		}

		total, err := queries.CountCatalogScopeMainCategories(ctx, scopeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count catalog scope main categories"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: items, Meta: utils.BuildMeta(query, total)})
	}
}

func AddCatalogScopeMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeID, ok := utils.ParseUUIDParam(c, "scope_id")
		if !ok {
			return
		}

		var input dto.CatalogScopeMainCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)

		if _, err := queries.GetCatalogScopeByID(ctx, scopeID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope"})
			return
		}

		mainCategoryID, err := getOrCreateMainCategory(ctx, queries, input.MainCategoryName, input.Description)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare main category"})
			return
		}

		created, err := queries.CreateCatalogScopeMainCategory(ctx, db.CreateCatalogScopeMainCategoryParams{
			ScopeID:        scopeID,
			MainCategoryID: mainCategoryID,
			SortOrder:      input.SortOrder,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "main category or order already exists in this catalog scope"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create catalog scope main category"})
			return
		}

		item, err := queries.GetCatalogScopeMainCategoryByID(ctx, created.ScopeMainCategoryID)
		if err != nil {
			c.JSON(http.StatusCreated, created)
			return
		}
		c.JSON(http.StatusCreated, item)
	}
}

func UpdateCatalogScopeMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeMainCategoryID, ok := utils.ParseUUIDParam(c, "scope_main_category_id")
		if !ok {
			return
		}

		var input dto.CatalogScopeMainCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)

		existing, err := queries.GetCatalogScopeMainCategoryByID(ctx, scopeMainCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope main category"})
			return
		}

		if _, err := queries.UpdateMainCategoryDictionary(ctx, db.UpdateMainCategoryDictionaryParams{
			MainCategoryID:   existing.MainCategoryID,
			MainCategoryName: input.MainCategoryName,
			Description:      input.Description,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update main category"})
			return
		}

		rows, err := queries.UpdateCatalogScopeMainCategory(ctx, db.UpdateCatalogScopeMainCategoryParams{
			MainCategoryID:      existing.MainCategoryID,
			SortOrder:           input.SortOrder,
			ScopeMainCategoryID: scopeMainCategoryID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "main category order already exists in this catalog scope"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update catalog scope main category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope main category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "catalog scope main category updated successfully"})
	}
}

func DeleteCatalogScopeMainCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeMainCategoryID, ok := utils.ParseUUIDParam(c, "scope_main_category_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)

		existing, err := queries.GetCatalogScopeMainCategoryByID(ctx, scopeMainCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope main category"})
			return
		}

		count, err := queries.CountCatalogScopeCategoriesByMainCategory(ctx, db.CountCatalogScopeCategoriesByMainCategoryParams{
			ScopeID:        existing.ScopeID,
			MainCategoryID: existing.MainCategoryID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check catalog scope categories"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "main category has categories in this catalog scope"})
			return
		}

		rows, err := queries.DeleteCatalogScopeMainCategory(ctx, scopeMainCategoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete catalog scope main category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope main category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "catalog scope main category deleted successfully"})
	}
}

func GetCatalogScopeCategories(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeID, ok := utils.ParseUUIDParam(c, "scope_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		if _, err := queries.GetCatalogScopeByID(ctx, scopeID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope"})
			return
		}

		items, err := queries.GetCatalogScopeCategoriesPaginated(ctx, db.GetCatalogScopeCategoriesPaginatedParams{
			ScopeID:    scopeID,
			PageLimit:  limit,
			PageOffset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope categories"})
			return
		}

		total, err := queries.CountCatalogScopeCategories(ctx, scopeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count catalog scope categories"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: items, Meta: utils.BuildMeta(query, total)})
	}
}

func AddCatalogScopeCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeID, ok := utils.ParseUUIDParam(c, "scope_id")
		if !ok {
			return
		}

		var input dto.CatalogScopeCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		mainCategoryID, err := utils.ParseUUID(input.MainCategoryID, "main_category_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)

		if _, err := queries.GetCatalogScopeByID(ctx, scopeID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope"})
			return
		}
		if _, err := queries.GetMainCategoryByID(ctx, mainCategoryID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main category"})
			return
		}

		categoryID, err := getOrCreateCategory(ctx, queries, mainCategoryID, input.CategoryName, input.Description)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare category"})
			return
		}

		created, err := queries.CreateCatalogScopeCategory(ctx, db.CreateCatalogScopeCategoryParams{
			ScopeID:        scopeID,
			MainCategoryID: mainCategoryID,
			CategoryID:     categoryID,
			SortOrder:      input.SortOrder,
			Description:    input.Description,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "category or order already exists under this main category in this catalog scope"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create catalog scope category"})
			return
		}

		item, err := queries.GetCatalogScopeCategoryByID(ctx, created.ScopeCategoryID)
		if err != nil {
			c.JSON(http.StatusCreated, created)
			return
		}
		c.JSON(http.StatusCreated, item)
	}
}

func UpdateCatalogScopeCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeCategoryID, ok := utils.ParseUUIDParam(c, "scope_category_id")
		if !ok {
			return
		}

		var input dto.CatalogScopeCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		mainCategoryID, err := utils.ParseUUID(input.MainCategoryID, "main_category_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)

		existing, err := queries.GetCatalogScopeCategoryByID(ctx, scopeCategoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope category"})
			return
		}

		if _, err := queries.GetMainCategoryByID(ctx, mainCategoryID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "main category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch main category"})
			return
		}

		if _, err := queries.UpdateCategoryDictionary(ctx, db.UpdateCategoryDictionaryParams{
			CategoryID:   existing.CategoryID,
			CategoryName: input.CategoryName,
			Description:  input.Description,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update category"})
			return
		}

		rows, err := queries.UpdateCatalogScopeCategory(ctx, db.UpdateCatalogScopeCategoryParams{
			MainCategoryID:  mainCategoryID,
			CategoryID:      existing.CategoryID,
			SortOrder:       input.SortOrder,
			Description:     input.Description,
			ScopeCategoryID: scopeCategoryID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "category or order already exists under this main category in this catalog scope"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update catalog scope category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "catalog scope category updated successfully"})
	}
}

func DeleteCatalogScopeCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		scopeCategoryID, ok := utils.ParseUUIDParam(c, "scope_category_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)

		if _, err := queries.GetCatalogScopeCategoryByID(ctx, scopeCategoryID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch catalog scope category"})
			return
		}

		references, err := queries.CountCatalogScopeCategoryReferences(ctx, &scopeCategoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check catalog scope category references"})
			return
		}
		if references > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "category is referenced by components or templates in this catalog scope"})
			return
		}

		rows, err := queries.DeleteCatalogScopeCategory(ctx, scopeCategoryID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete catalog scope category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "catalog scope category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "catalog scope category deleted successfully"})
	}
}
