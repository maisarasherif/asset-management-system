package middleware

import (
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

func CORSMiddleware() gin.HandlerFunc {
	allowedOrigin := os.Getenv("ALLOWED_ORIGIN") // Change to your actual frontend URL in production.
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))

	allowedOrigins := []string{}
	for _, o := range strings.Split(allowedOrigin, ",") {
		trimmed := strings.TrimSpace(o)
		if trimmed != "" {
			allowedOrigins = append(allowedOrigins, trimmed)
		}
	}

	isAllowedOrigin := func(origin string) bool {
		if origin == "" {
			return false
		}

		// In development, allow common local frontend origins regardless of port.
		if appEnv == "dev" {
			if strings.HasPrefix(origin, "http://localhost:") ||
				strings.HasPrefix(origin, "http://127.0.0.1:") ||
				strings.HasPrefix(origin, "https://localhost:") ||
				strings.HasPrefix(origin, "https://127.0.0.1:") {
				return true
			}
		}

		for _, allowed := range allowedOrigins {
			if origin == allowed {
				return true
			}
		}

		return false
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		if isAllowedOrigin(origin) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
