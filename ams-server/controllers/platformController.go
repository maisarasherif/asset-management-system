package controllers

import (
	"context"
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

const (
	ProductAMS     = "AMS"
	ProductHRAdmin = "HR_ADMIN"
)

func GetPlatformProducts(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDRaw, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		userID, err := utils.ParseUUID(userIDRaw, "user_id")
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		role, _ := utils.GetRoleFromContext(c)
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		accessRows, err := db.New(pool).GetProductAccessForUser(ctx, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch product access"})
			return
		}

		products := []gin.H{}
		if role != "CLIENT" {
			amsRole := role
			if role == "SUPER_ADMIN" {
				amsRole = "ADMIN"
			}
			products = append(products, gin.H{
				"product_key":  ProductAMS,
				"product_name": "Asset Management",
				"product_role": amsRole,
				"status":       "ACTIVE",
			})
		}

		if role == "SUPER_ADMIN" {
			products = append(products, gin.H{
				"product_key":  ProductHRAdmin,
				"product_name": "HR/Admin",
				"product_role": "ADMIN",
				"status":       "ACTIVE",
			})
		} else {
			for _, access := range accessRows {
				if access.ProductKey != ProductHRAdmin || access.Status != "ACTIVE" {
					continue
				}
				products = append(products, gin.H{
					"product_key":  access.ProductKey,
					"product_name": "HR/Admin",
					"product_role": access.ProductRole,
					"status":       access.Status,
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{"products": products})
	}
}

func GetProductAccess(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		access, err := queries.GetProductAccessPaginated(ctx, db.GetProductAccessPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch product access"})
			return
		}
		total, err := queries.CountProductAccess(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count product access"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: access,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func UpsertProductAccess(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.ProductAccessInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}
		if input.ProductKey == ProductHRAdmin && input.ProductRole == "CLIENT" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "HR/Admin product does not support CLIENT role"})
			return
		}

		userID, err := utils.ParseUUID(input.UserID, "user_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		queries := db.New(pool)

		if _, err := queries.GetUserByID(ctx, userID); err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate user"})
			return
		}

		access, err := queries.UpsertProductAccess(ctx, db.UpsertProductAccessParams{
			UserID:      userID,
			ProductKey:  input.ProductKey,
			ProductRole: input.ProductRole,
			Status:      input.Status,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save product access"})
			return
		}

		c.JSON(http.StatusOK, access)
	}
}

func DeleteProductAccess(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		accessID, ok := utils.ParseUUIDParam(c, "access_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		rows, err := db.New(pool).DeleteProductAccess(ctx, accessID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete product access"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "product access not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "product access deleted successfully"})
	}
}

func actorUUID(c *gin.Context) *uuid.UUID {
	userIDRaw, err := utils.GetUserIdFromContext(c)
	if err != nil {
		return nil
	}
	userID, err := utils.ParseUUID(userIDRaw, "user_id")
	if err != nil {
		return nil
	}
	return &userID
}
