package middleware

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ams_http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "route", "status"},
	)

	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "ams_http_request_duration_seconds",
			Help:    "HTTP request latency in seconds",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
		},
		[]string{"method", "route"},
	)

	httpRequestsInFlight = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "ams_http_requests_in_flight",
			Help: "Number of HTTP requests currently being processed",
		},
	)
)

func PrometheusMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip the metrics endpoint itself to avoid self-referential noise
		if c.Request.URL.Path == "/metrics" {
			c.Next()
			return
		}

		start := time.Now()
		httpRequestsInFlight.Inc()

		c.Next()

		httpRequestsInFlight.Dec()

		// Use route pattern (e.g. /asset/:asset_id) not the actual path
		// to avoid high cardinality from UUIDs
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Writer.Status())
		method := c.Request.Method

		httpRequestsTotal.WithLabelValues(method, route, status).Inc()
		httpRequestDuration.WithLabelValues(method, route).Observe(duration)
	}
}
