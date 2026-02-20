package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
)

func SetupUnprotectedRoutes(router *gin.Engine, pool *pgxpool.Pool) {

	router.POST("/login", controller.LoginUser(pool))

}
