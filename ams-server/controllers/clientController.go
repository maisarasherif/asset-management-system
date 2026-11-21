package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func requestUserID(c *gin.Context) (uuid.UUID, bool) {
	userID, err := utils.GetUserIdFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return uuid.Nil, false
	}

	parsedUserID, err := utils.ParseUUID(userID, "user_id")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return uuid.Nil, false
	}

	return parsedUserID, true
}

func GetClientAssets(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := requestUserID(c)
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		filters := utils.ReadListFilters(c)
		search := filters.Text("search")
		filterProject := filters.Text("project")
		filterStatus := filters.Enum("status", "ACTIVE", "INACTIVE", "QUARANTINED")
		if !filters.Valid() {
			return
		}

		assets, err := queries.GetClientAssetsPaginated(ctx, db.GetClientAssetsPaginatedParams{
			SearchText: search, FilterProject: filterProject, FilterStatus: filterStatus,
			UserID:     userID,
			PageLimit:  limit,
			PageOffset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch client assets"})
			return
		}

		total, err := queries.CountClientAssets(ctx, db.CountClientAssetsParams{SearchText: search, FilterProject: filterProject, FilterStatus: filterStatus, UserID: userID})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count client assets"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: assets,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetClientAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := requestUserID(c)
		if !ok {
			return
		}
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()

		queries := db.New(pool)
		asset, err := queries.GetClientAssetByID(ctx, db.GetClientAssetByIDParams{
			AssetID: assetID,
			UserID:  userID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}

		if c.Query("include_components") == "false" && c.Query("include_certificates") == "false" {
			c.JSON(http.StatusOK, gin.H{"asset": asset, "components": []any{}, "certificates": []any{}})
			return
		}

		components, err := queries.GetClientComponentsByAsset(ctx, db.GetClientComponentsByAssetParams{
			AssetID: assetID,
			UserID:  userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset components"})
			return
		}

		if c.Query("include_certificates") == "false" {
			c.JSON(http.StatusOK, gin.H{"asset": asset, "components": dto.NormalizeListData(components), "certificates": []any{}})
			return
		}

		certificates, err := queries.GetClientCertificatesByAsset(ctx, db.GetClientCertificatesByAssetParams{
			AssetID: assetID,
			UserID:  userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset certificates"})
			return
		}
		for i := range certificates {
			certificates[i].Status = currentCertificateStatus(certificates[i].Status, certificates[i].ExpiryDate)
		}

		c.JSON(http.StatusOK, gin.H{
			"asset":        asset,
			"components":   dto.NormalizeListData(components),
			"certificates": dto.NormalizeListData(certificates),
		})
	}
}

func GetClientCertificateFile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := requestUserID(c)
		if !ok {
			return
		}
		certificateID, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		fileKey, err := db.New(pool).GetClientCertificateFileForUser(ctx, db.GetClientCertificateFileForUserParams{
			CertificateID: certificateID,
			UserID:        userID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "certificate file not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate file"})
			return
		}

		signedURL, err := utils.GenerateSignedURL(ctx, fileKey, "")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate view URL"})
			return
		}

		logger.Log.Info().
			Str("client_user_id", userID.String()).
			Str("certificate_id", certificateID.String()).
			Msg("client certificate file URL generated")

		c.JSON(http.StatusOK, gin.H{"url": signedURL})
	}
}

func SearchClientAssetCertificates(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := requestUserID(c)
		if !ok {
			return
		}
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)
		if _, err := queries.GetClientAssetByID(ctx, db.GetClientAssetByIDParams{AssetID: assetID, UserID: userID}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load the asset."})
			}
			return
		}
		limit, offset, page := utils.ParsePagination(c)
		filters := utils.ReadListFilters(c)
		status := filters.Enum("status", "VALID", "EXPIRING_SOON", "EXPIRED", "PENDING")
		testID := filters.UUID("test_id")
		search := filters.Text("search")
		component := filters.UUID("component_id")
		category := filters.UUID("category_id")
		if !filters.Valid() {
			return
		}
		now := time.Now()
		rows, err := queries.SearchClientAssetCertificates(ctx, db.SearchClientAssetCertificatesParams{
			AssetID: assetID, UserID: userID, SearchText: search, FilterStatus: status, FilterTest: testID,
			FilterComponent: component, FilterCategory: category, AsOf: now.Format(time.DateOnly),
			PageLimit: limit, PageOffset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load certificates."})
			return
		}
		total, err := queries.CountSearchClientAssetCertificates(ctx, db.CountSearchClientAssetCertificatesParams{
			AssetID: assetID, UserID: userID, SearchText: search, FilterStatus: status, FilterTest: testID,
			FilterComponent: component, FilterCategory: category, AsOf: now.Format(time.DateOnly),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not count certificates."})
			return
		}
		for i := range rows {
			rows[i].Status = currentCertificateStatusAt(rows[i].Status, rows[i].ExpiryDate, now)
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: rows, Meta: utils.BuildMeta(page, total)})
	}
}

func SearchClientAssetComponents(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := requestUserID(c)
		if !ok {
			return
		}
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)
		filters := utils.ReadListFilters(c)
		search := filters.Text("search")
		kind := filters.Enum("component_kind", "NORMAL", "SELF")
		category := filters.UUID("category_id")
		if !filters.Valid() {
			return
		}
		limit, offset, page := utils.ParsePagination(c)
		rows, err := queries.SearchClientAssetComponents(ctx, db.SearchClientAssetComponentsParams{
			AssetID: assetID, UserID: userID, SearchText: search, FilterKind: kind, FilterCategory: category,
			PageLimit: limit, PageOffset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load components."})
			return
		}
		total, err := queries.CountSearchClientAssetComponents(ctx, db.CountSearchClientAssetComponentsParams{
			AssetID: assetID, UserID: userID, SearchText: search, FilterKind: kind, FilterCategory: category,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not count components."})
			return
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: rows, Meta: utils.BuildMeta(page, total)})
	}
}

func SearchClientAssetCertificateTypes(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := requestUserID(c)
		if !ok {
			return
		}
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)
		filters := utils.ReadListFilters(c)
		search := filters.Text("search")
		if !filters.Valid() {
			return
		}
		limit, offset, page := utils.ParsePagination(c)
		rows, err := queries.SearchClientAssetCertificateTypes(ctx, db.SearchClientAssetCertificateTypesParams{
			AssetID: assetID, UserID: userID, SearchText: search, PageLimit: limit, PageOffset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load certificate types."})
			return
		}
		total, err := queries.CountSearchClientAssetCertificateTypes(ctx, db.CountSearchClientAssetCertificateTypesParams{
			AssetID: assetID, UserID: userID, SearchText: search,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not count certificate types."})
			return
		}
		c.JSON(http.StatusOK, dto.PaginatedResponse{Data: rows, Meta: utils.BuildMeta(page, total)})
	}
}
