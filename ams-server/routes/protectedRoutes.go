package routes

import (
	"github.com/gin-gonic/gin"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"github.com/maisarasherif/asset-management-system/ams-server/middleware"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func SetupProtectedRoutes(router *gin.Engine, client *mongo.Client) {

	router.Use(middleware.AuthMiddleware())

	// User routes
	router.POST("/register", controller.RegisterUser(client))

	// Category routes
	router.GET("/categories", controller.GetCategories(client))
	router.GET("/category/:category_id", controller.GetCategory(client))
	router.POST("/addcategory", controller.AddCategory(client))
	router.PUT("/updatecategory/:category_id", controller.UpdateCategory(client))
	router.DELETE("/deletecategory/:category_id", controller.DeleteCategory(client))

	// Asset routes
	router.GET("/assets", controller.GetAssets(client))
	router.GET("/asset/:asset_id", controller.GetAsset(client))
	router.POST("/addasset", controller.AddAsset(client))
	router.PUT("/updateasset/:asset_id", controller.UpdateAsset(client))
	router.DELETE("/deleteasset/:asset_id", controller.DeleteAsset(client))
	router.PATCH("/patchasset/:asset_id", controller.PatchAsset(client))

	// Component routes
	router.GET("/components", controller.GetComponents(client))
	router.GET("/component/:component_id", controller.GetComponent(client))
	router.GET("/components/asset/:asset_id", controller.GetComponentsByAsset(client))
	router.POST("/addcomponent", controller.AddComponent(client))
	router.PUT("/updatecomponent/:component_id", controller.UpdateComponent(client))
	router.DELETE("/deletecomponent/:component_id", controller.DeleteComponent(client))

	// Certificate routes
	router.GET("/certificates", controller.GetCertificates(client))
	router.GET("/certificate/:certificate_id", controller.GetCertificate(client))
	router.GET("/certificates/component/:component_id", controller.GetCertificatesByComponent(client))
	router.POST("/addcertificate", controller.AddCertificate(client))
	router.PUT("/updatecertificate/:certificate_id", controller.UpdateCertificate(client))
	router.DELETE("/deletecertificate/:certificate_id", controller.DeleteCertificate(client))
	router.GET("/expiring-certificates", controller.GetExpiringCertificates(client))
}
