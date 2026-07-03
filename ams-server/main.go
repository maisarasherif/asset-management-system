package main

import (
	"context"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	databases "github.com/maisarasherif/asset-management-system/ams-server/database"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	middleware "github.com/maisarasherif/asset-management-system/ams-server/middleware"
	routes "github.com/maisarasherif/asset-management-system/ams-server/routes"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func main() {
	logger.Init()

	pool := databases.Connect()
	defer pool.Close()

	riverCtx, cancelRiver := context.WithCancel(context.Background())
	defer cancelRiver()
	riverClient, riverUIHandler, err := utils.StartRiver(riverCtx, pool)
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("failed to start River")
	}
	defer func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := utils.StopRiver(stopCtx, riverClient); err != nil {
			logger.Log.Error().Err(err).Msg("failed to stop River")
		}
	}()

	utils.StartExpiryScheduler(pool, riverClient)
	utils.StartHRAdminReminderScheduler(pool, riverClient)

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

	routes.SetupUnprotectedRoutesWithRiver(router, pool, riverClient)
	routes.SetupProtectedRoutesWithJobs(router, pool, riverUIHandler, riverClient)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	logger.Log.Info().Str("port", port).Msg("server starting")
	if err := router.Run(":" + port); err != nil {
		logger.Log.Fatal().Err(err).Msg("server failed to start")
	}
}
