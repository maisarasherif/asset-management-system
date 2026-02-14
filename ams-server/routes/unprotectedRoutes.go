package routes

import (
	"github.com/gin-gonic/gin"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func SetupUnprotectedRoutes(router *gin.Engine, client *mongo.Client) {

	router.POST("/login", controller.LoginUser(client))

}
