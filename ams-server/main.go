package main

import (
	"fmt"

	"github.com/gin-gonic/gin"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	databases "github.com/maisarasherif/asset-management-system/ams-server/database"
	middleware "github.com/maisarasherif/asset-management-system/ams-server/middleware"
	routes "github.com/maisarasherif/asset-management-system/ams-server/routes"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func main() {

	router := gin.Default()

	router.Use(middleware.CORSMiddleware())

	router.GET("/hello", func(c *gin.Context) {
		c.String(200, "Hello, Asset Management System!")
	})

	var client *mongo.Client = databases.Connect()

	controller.SeedAdminUser(client)

	routes.SetupUnprotectedRoutes(router, client)
	routes.SetupProtectedRoutes(router, client)

	if err := router.Run(":8080"); err != nil {
		fmt.Println("Failed to start server", err)
	}
}
