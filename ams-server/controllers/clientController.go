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

func clientUserID(c *gin.Context) (uuid.UUID, bool) {
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
		userID, ok := clientUserID(c)
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		assets, err := queries.GetClientAssetsPaginated(ctx, db.GetClientAssetsPaginatedParams{
			UserID:     userID,
			PageLimit:  limit,
			PageOffset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch client assets"})
			return
		}

		total, err := queries.CountClientAssets(ctx, userID)
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
		userID, ok := clientUserID(c)
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

		components, err := queries.GetClientComponentsByAsset(ctx, db.GetClientComponentsByAssetParams{
			AssetID: assetID,
			UserID:  userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset components"})
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
		userID, ok := clientUserID(c)
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
