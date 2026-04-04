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
	admin.PUT("/updateuser/:user_id", controller.UpdateUser(pool))
	admin.PATCH("/patchuser/:user_id", controller.PatchUser(pool))
	admin.DELETE("/deleteuser/:user_id", controller.DeleteUser(pool))
	admin.GET("/users", controller.GetUsers(pool))

	// Component Routes
	admin.POST("/addcomponent", controller.AddComponent(pool))
	admin.PUT("/updatecomponent/:component_id", controller.UpdateComponent(pool))
	admin.PATCH("/patchcomponent/:component_id", controller.PatchComponent(pool))
	admin.DELETE("/deletecomponent/:component_id", controller.DeleteComponent(pool))

	// Certificate Routes
	admin.POST("/addcertificate", controller.AddCertificate(pool))
	admin.PUT("/updatecertificate/:certificate_id", controller.UpdateCertificate(pool))
	admin.PATCH("/patchcertificate/:certificate_id", controller.PatchCertificate(pool))
	admin.DELETE("/deletecertificate/:certificate_id", controller.DeleteCertificate(pool))
	admin.POST("/certificate/:certificate_id/file", controller.UploadCertificateFile(pool))

	// Category Routes
	admin.POST("/addcategory", controller.AddCategory(pool))
	admin.PUT("/updatecategory/:category_id", controller.UpdateCategory(pool))
	admin.PATCH("/patchcategory/:category_id", controller.PatchCategory(pool))
	admin.DELETE("/deletecategory/:category_id", controller.DeleteCategory(pool))

	// Test Type Routes
	admin.POST("/addtesttype", controller.AddTestType(pool))
	admin.PUT("/updatetesttype/:test_id", controller.UpdateTestType(pool))
	admin.PATCH("/patchtesttype/:test_id", controller.PatchTestType(pool))
	admin.DELETE("/deletetesttype/:test_id", controller.DeleteTestType(pool))

	// Template Routes
	admin.POST("/addtemplate", controller.AddTemplate(pool))
	admin.PUT("/updatetemplate/:template_id", controller.UpdateTemplate(pool))
	admin.DELETE("/deletetemplate/:template_id", controller.DeleteTemplate(pool))
	admin.POST("/template/:template_id/addcomponent", controller.AddTemplateComponent(pool))
	admin.PUT("/template/:template_id/component/:template_component_id", controller.UpdateTemplateComponent(pool))
	admin.DELETE("/template/:template_id/component/:template_component_id", controller.DeleteTemplateComponent(pool))
	admin.POST("/template/:template_id/component/:template_component_id/addtest", controller.AddTemplateComponentTest(pool))
	admin.DELETE("/template/:template_id/component/:template_component_id/test/:template_component_test_id", controller.DeleteTemplateComponentTest(pool))

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
	protected.GET("/test-types", controller.GetTestTypes(pool))
	protected.GET("/certificate/:certificate_id/file", controller.GetCertificateFile(pool))
	protected.GET("/certificate/:certificate_id/uploads", controller.GetCertificateUploadAudit(pool))
	protected.GET("/certificates/dashboard", controller.GetCertificatesWithContext(pool))
	protected.GET("/certificates/report.pdf", controller.GetCertificatesReportPDF(pool))

	// Category routes
	protected.GET("/categories", controller.GetCategories(pool))
	protected.GET("/category/:category_id", controller.GetCategory(pool))

	// Template routes (read — any authenticated user)
	protected.GET("/templates", controller.GetTemplates(pool))
	protected.GET("/template/:template_id", controller.GetTemplate(pool))
	protected.GET("/template/:template_id/components", controller.GetTemplateComponents(pool))
	protected.GET("/template/:template_id/component/:template_component_id/tests", controller.GetTemplateComponentTests(pool))

	// User routes
	protected.GET("/user/:user_id", controller.GetUser(pool))
	protected.PUT("/updatepassword", controller.UpdatePassword(pool))
	protected.POST("/logout", controller.LogoutUser(pool))
}
