package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"github.com/maisarasherif/asset-management-system/ams-server/middleware"
)

func SetupProtectedRoutes(router *gin.Engine, pool *pgxpool.Pool) {

	// ===================Admin-Protected Routes======================================================
	admin := router.Group("/")
	admin.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware())

	// Asset Routes
	admin.POST("/addasset", controller.AddAsset(pool))
	admin.DELETE("/deleteasset/:asset_id", controller.DeleteAsset(pool))
	admin.PUT("/updateasset/:asset_id", controller.UpdateAsset(pool))
	admin.PATCH("/patchasset/:asset_id", controller.PatchAsset(pool))

	// User Routes
	admin.POST("/register", controller.RegisterUser(pool))

	// Component Routes
	admin.POST("/addcomponent", controller.AddComponent(pool))
	admin.PUT("/updatecomponent/:component_id", controller.UpdateComponent(pool))
	admin.DELETE("/deletecomponent/:component_id", controller.DeleteComponent(pool))

	// Certificate Routes
	admin.POST("/addcertificate", controller.AddCertificate(pool))
	admin.PUT("/updatecertificate/:certificate_id", controller.UpdateCertificate(pool))
	admin.DELETE("/deletecertificate/:certificate_id", controller.DeleteCertificate(pool))

	// Category Routes
	admin.POST("/addcategory", controller.AddCategory(pool))
	admin.PUT("/updatecategory/:category_id", controller.UpdateCategory(pool))
	admin.DELETE("/deletecategory/:category_id", controller.DeleteCategory(pool))

	// ===================Protected Routes======================================================
	protected := router.Group("/")
	protected.Use(middleware.AuthMiddleware())

	// Asset routes
	protected.GET("/assets", controller.GetAssets(pool))
	protected.GET("/asset/:asset_id", controller.GetAsset(pool))

	// Component routes
	protected.GET("/components", controller.GetComponents(pool))
	protected.GET("/component/:component_id", controller.GetComponent(pool))
	protected.GET("/components/asset/:asset_id", controller.GetComponentsByAsset(pool))

	// Certificate routes
	protected.GET("/certificates", controller.GetCertificates(pool))
	protected.GET("/certificate/:certificate_id", controller.GetCertificate(pool))
	protected.GET("/certificates/component/:component_id", controller.GetCertificatesByComponent(pool))
	protected.GET("/expiring-certificates", controller.GetExpiringCertificates(pool))

	// Category routes
	protected.GET("/categories", controller.GetCategories(pool))
	protected.GET("/category/:category_id", controller.GetCategory(pool))
}
