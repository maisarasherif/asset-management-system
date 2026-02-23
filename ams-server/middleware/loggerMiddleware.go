package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
)

func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		method := c.Request.Method

		requestID, _ := c.Get(RequestIDKey)

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		event := logger.Log.Info()
		if status >= 500 {
			event = logger.Log.Error()
		} else if status >= 400 {
			event = logger.Log.Warn()
		}

		event.
			Str("request_id", requestID.(string)).
			Str("method", method).
			Str("path", path).
			Int("status", status).
			Str("latency", latency.String()).
			Str("ip", c.ClientIP()).
			Msg("request")
	}
}
