package main

import (
	"github.com/gin-gonic/gin"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	databases "github.com/maisarasherif/asset-management-system/ams-server/database"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	middleware "github.com/maisarasherif/asset-management-system/ams-server/middleware"
	routes "github.com/maisarasherif/asset-management-system/ams-server/routes"
	//"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func main() {
	logger.Init()

	pool := databases.Connect()
	defer pool.Close()

	//utils.StartExpiryScheduler(pool)

	router := gin.New()
	router.Use(
		middleware.CORSMiddleware(),
		middleware.RequestIDMiddleware(),
		middleware.PrometheusMiddleware(),
		middleware.LoggerMiddleware(),
		gin.Recovery(),
	)

	router.SetTrustedProxies(nil)

	router.GET("/v1/metrics", middleware.MetricsAuthMiddleware(), middleware.MetricsHandler())

	router.GET("/v1/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	controller.SeedAdminUser(pool)

	routes.SetupUnprotectedRoutes(router, pool)
	routes.SetupProtectedRoutes(router, pool)

	logger.Log.Info().Str("port", "8080").Msg("server starting")
	if err := router.Run(":8080"); err != nil {
		logger.Log.Fatal().Err(err).Msg("server failed to start")
	}
}
