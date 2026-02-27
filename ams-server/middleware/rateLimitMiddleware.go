package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimitEntry struct {
	windowStart time.Time
	count       int
}

// RateLimitMiddleware applies a per-client-IP fixed-window rate limit.
func RateLimitMiddleware(limit int, window time.Duration) gin.HandlerFunc {
	if limit <= 0 {
		limit = 60
	}
	if window <= 0 {
		window = time.Minute
	}

	var (
		mu      sync.Mutex
		clients = make(map[string]*rateLimitEntry)
	)

	go func() {
		ticker := time.NewTicker(window)
		defer ticker.Stop()

		for range ticker.C {
			cutoff := time.Now().Add(-window)

			mu.Lock()
			for ip, entry := range clients {
				if entry.windowStart.Before(cutoff) {
					delete(clients, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		now := time.Now()
		ip := c.ClientIP()

		mu.Lock()
		entry, exists := clients[ip]
		if !exists || now.Sub(entry.windowStart) >= window {
			entry = &rateLimitEntry{
				windowStart: now,
				count:       0,
			}
			clients[ip] = entry
		}

		if entry.count >= limit {
			retryAfter := int(window.Seconds() - now.Sub(entry.windowStart).Seconds())
			if retryAfter < 1 {
				retryAfter = 1
			}
			mu.Unlock()

			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded",
			})
			c.Abort()
			return
		}

		entry.count++
		mu.Unlock()

		c.Next()
	}
}
