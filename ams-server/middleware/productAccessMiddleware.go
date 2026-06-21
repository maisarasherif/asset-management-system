package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

const productRoleContextKey = "productRole"

func ProductAccessMiddleware(pool *pgxpool.Pool, productKey string, allowedRoles ...string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, role := range allowedRoles {
		allowed[role] = true
	}

	return func(c *gin.Context) {
		globalRole, err := utils.GetRoleFromContext(c)
		if err == nil && globalRole == "SUPER_ADMIN" {
			c.Set(productRoleContextKey, "ADMIN")
			c.Next()
			return
		}

		userIDRaw, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		userID, err := utils.ParseUUID(userIDRaw, "user_id")
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		access, err := db.New(pool).GetActiveProductAccessByUserAndProduct(ctx, db.GetActiveProductAccessByUserAndProductParams{
			UserID:     userID,
			ProductKey: productKey,
		})
		if err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusForbidden, gin.H{"error": "product access required"})
				c.Abort()
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate product access"})
			c.Abort()
			return
		}

		if len(allowed) > 0 && !allowed[access.ProductRole] {
			c.JSON(http.StatusForbidden, gin.H{"error": "insufficient product role"})
			c.Abort()
			return
		}

		c.Set(productRoleContextKey, access.ProductRole)
		c.Next()
	}
}
