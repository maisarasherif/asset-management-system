package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := utils.GetAccessToken(c)

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "no token provided"})
			c.Abort()
			return
		}

		claims, err := utils.ValidateToken(token)

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("userId", claims.UserId)
		c.Set("role", claims.Role)
		c.Set("email", claims.Email)
		c.Set("firstName", claims.FirstName)
		c.Set("lastName", claims.LastName)
		c.Set("expiresAt", claims.ExpiresAt.Time)
		c.Set("accessToken", token)

		c.Next()
	}
}

func ActiveUserMiddleware(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		parsedUserID, err := utils.ParseUUID(userID, "user_id")
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		session, err := db.New(pool).GetUserSessionByID(ctx, parsedUserID)
		if err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
				c.Abort()
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate user session"})
			c.Abort()
			return
		}
		if session.Status != "ACTIVE" {
			c.JSON(http.StatusForbidden, gin.H{"error": "user account is suspended"})
			c.Abort()
			return
		}
		presentedToken, _ := c.Get("accessToken")
		if session.Token == "" || presentedToken != session.Token {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "session expired. Please sign in again."})
			c.Abort()
			return
		}

		c.Next()
	}
}

func SuperAdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil || role != "SUPER_ADMIN" {
			userID, _ := utils.GetUserIdFromContext(c)
			logger.Log.Warn().
				Str("user_id", userID).
				Str("route", c.FullPath()).
				Str("method", c.Request.Method).
				Str("ip", c.ClientIP()).
				Msg("unauthorized super admin access attempt")
			c.JSON(http.StatusForbidden, gin.H{"error": "only SUPER ADMIN allowed"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil || (role != "ADMIN" && role != "SUPER_ADMIN") {
			userID, _ := utils.GetUserIdFromContext(c)
			logger.Log.Warn().
				Str("user_id", userID).
				Str("route", c.FullPath()).
				Str("method", c.Request.Method).
				Str("ip", c.ClientIP()).
				Msg("unauthorized admin access attempt")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "only ADMINS allowed"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func StaffMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil || role == "CLIENT" {
			c.JSON(http.StatusForbidden, gin.H{"error": "staff access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func ClientMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, err := utils.GetRoleFromContext(c)
		if err != nil || role != "CLIENT" {
			c.JSON(http.StatusForbidden, gin.H{"error": "client access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
