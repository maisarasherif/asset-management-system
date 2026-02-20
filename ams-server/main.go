package main

import (
	"log"

	"github.com/gin-gonic/gin"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	databases "github.com/maisarasherif/asset-management-system/ams-server/database"
	middleware "github.com/maisarasherif/asset-management-system/ams-server/middleware"
	routes "github.com/maisarasherif/asset-management-system/ams-server/routes"
)

func main() {
	pool := databases.Connect()
	defer pool.Close()

	router := gin.Default()
	router.Use(middleware.CORSMiddleware())

	router.GET("/hello", func(c *gin.Context) {
		c.String(200, "Hello, Asset Management System!")
	})

	controller.SeedAdminUser(pool)

	routes.SetupUnprotectedRoutes(router, pool)
	routes.SetupProtectedRoutes(router, pool)

	if err := router.Run(":8080"); err != nil {
		log.Fatal("Failed to start server: ", err)
	}
}
