package middleware

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// MetricsAuthMiddleware protects /metrics with a static bearer token
// set via METRICS_TOKEN env var
func MetricsAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := os.Getenv("METRICS_TOKEN")

		// If no token is configured, block access entirely rather than
		// silently exposing metrics
		if token == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "metrics not configured"})
			c.Abort()
			return
		}

		authHeader := c.GetHeader("Authorization")
		if len(authHeader) < 8 || authHeader[:7] != "Bearer " {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid authorization header"})
			c.Abort()
			return
		}

		if authHeader[7:] != token {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid metrics token"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// MetricsHandler wraps the promhttp handler for use in Gin
func MetricsHandler() gin.HandlerFunc {
	h := promhttp.Handler()
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
