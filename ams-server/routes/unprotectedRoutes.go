package routes

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"github.com/maisarasherif/asset-management-system/ams-server/middleware"
)

func SetupUnprotectedRoutes(router *gin.Engine, pool *pgxpool.Pool) {
	loginRateLimit := middleware.RateLimitMiddleware(10, time.Minute)
	router.POST("/v1/login", loginRateLimit, controller.LoginUser(pool))
}
