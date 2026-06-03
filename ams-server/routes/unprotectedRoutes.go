package routes

import (
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"github.com/maisarasherif/asset-management-system/ams-server/middleware"
	"github.com/riverqueue/river"
)

func SetupUnprotectedRoutes(router *gin.Engine, pool *pgxpool.Pool) {
	SetupUnprotectedRoutesWithRiver(router, pool, nil)
}

func SetupUnprotectedRoutesWithRiver(router *gin.Engine, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) {
	loginLimit := 10
	if rawLimit := os.Getenv("LOGIN_RATE_LIMIT"); rawLimit != "" {
		if parsedLimit, err := strconv.Atoi(rawLimit); err == nil {
			loginLimit = parsedLimit
		}
	}
	loginRateLimit := middleware.RateLimitMiddleware(loginLimit, time.Minute)
	router.POST("/v1/login", loginRateLimit, controller.LoginUser(pool))

	forgotPasswordRateLimit := middleware.RateLimitMiddleware(10, time.Minute)
	router.POST("/v1/forgot-password", forgotPasswordRateLimit, controller.ForgotPassword(pool, riverClient))
	router.POST("/v1/reset-password", controller.ResetPassword(pool))
}
