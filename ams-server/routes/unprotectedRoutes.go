package routes

import (
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"github.com/maisarasherif/asset-management-system/ams-server/middleware"
)

func SetupUnprotectedRoutes(router *gin.Engine, pool *pgxpool.Pool) {
	loginLimit := 10
	if rawLimit := os.Getenv("LOGIN_RATE_LIMIT"); rawLimit != "" {
		if parsedLimit, err := strconv.Atoi(rawLimit); err == nil {
			loginLimit = parsedLimit
		}
	}
	loginRateLimit := middleware.RateLimitMiddleware(loginLimit, time.Minute)
	router.POST("/v1/login", loginRateLimit, controller.LoginUser(pool))
}
