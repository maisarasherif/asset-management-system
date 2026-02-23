package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const RequestIDKey = "requestID"

func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Use existing request ID from header if provided (e.g. from a gateway)
		// otherwise generate a new one
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}

		// Set on context for use in handlers and logger middleware
		c.Set(RequestIDKey, requestID)

		// Set on response header so clients can correlate
		c.Header("X-Request-ID", requestID)

		c.Next()
	}
}
