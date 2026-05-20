package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"github.com/maisarasherif/asset-management-system/ams-server/middleware"
)

func SetupProtectedRoutes(router *gin.Engine, pool *pgxpool.Pool) {

	// ===================Admin-Protected Routes======================================================
	admin := router.Group("/v1")
	admin.Use(middleware.AuthMiddleware(), middleware.ActiveUserMiddleware(pool), middleware.AdminMiddleware())

	// User Routes
	admin.POST("/user", controller.RegisterUser(pool))
	admin.PUT("/user/:user_id", controller.UpdateUser(pool))
	admin.PATCH("/user/:user_id", controller.PatchUser(pool))
	admin.PUT("/user/:user_id/password", controller.AdminUpdateUserPassword(pool))
	admin.DELETE("/user/:user_id", controller.DeleteUser(pool))
	admin.GET("/user-management-audit-logs", controller.GetUserManagementAuditLogs(pool))
	admin.GET("/projects", controller.GetProjects(pool))
	admin.POST("/project", controller.AddProject(pool))
	admin.PUT("/project/:project_id", controller.UpdateProject(pool))
	admin.GET("/user-project-access", controller.GetUserProjectAccess(pool))
	admin.POST("/user/:user_id/project-access", controller.UpsertUserProjectAccess(pool))
	admin.PUT("/user-project-access/:access_id", controller.UpdateUserProjectAccess(pool))
	admin.DELETE("/user-project-access/:access_id", controller.DeleteUserProjectAccess(pool))

	// Asset Routes
	admin.POST("/asset", controller.AddAsset(pool))
	admin.PUT("/asset/:asset_id", controller.UpdateAsset(pool))
	admin.PATCH("/asset/:asset_id", controller.PatchAsset(pool))
	admin.PATCH("/asset/:asset_id/working-hours", controller.UpdateAssetWorkingHours(pool))
	admin.POST("/asset/:asset_id/routine-maintenance/complete", controller.CompleteAssetRoutineMaintenance(pool))
	admin.DELETE("/asset/:asset_id", controller.DeleteAsset(pool))

	// Component Routes
	admin.POST("/component", controller.AddComponent(pool))
	admin.PUT("/component/:component_id", controller.UpdateComponent(pool))
	admin.PATCH("/component/:component_id", controller.PatchComponent(pool))
	admin.DELETE("/component/:component_id", controller.DeleteComponent(pool))

	// Certificate Routes
	admin.POST("/certificate", controller.AddCertificate(pool))
	admin.PUT("/certificate/:certificate_id", controller.UpdateCertificate(pool))
	admin.PATCH("/certificate/:certificate_id", controller.PatchCertificate(pool))
	admin.DELETE("/certificate/:certificate_id", controller.DeleteCertificate(pool))
	admin.POST("/certificate/:certificate_id/file", controller.UploadCertificateFile(pool))

	// Main Category Routes
	admin.POST("/main-category", controller.AddMainCategory(pool))
	admin.PUT("/main-category/:main_category_id", controller.UpdateMainCategory(pool))
	admin.PATCH("/main-category/:main_category_id", controller.PatchMainCategory(pool))
	admin.DELETE("/main-category/:main_category_id", controller.DeleteMainCategory(pool))

	// Category Routes
	admin.POST("/category", controller.AddCategory(pool))
	admin.PUT("/category/:category_id", controller.UpdateCategory(pool))
	admin.PATCH("/category/:category_id", controller.PatchCategory(pool))
	admin.DELETE("/category/:category_id", controller.DeleteCategory(pool))

	// Test Type Routes
	admin.POST("/test-type", controller.AddTestType(pool))
	admin.PUT("/test-type/:test_id", controller.UpdateTestType(pool))
	admin.PATCH("/test-type/:test_id", controller.PatchTestType(pool))
	admin.DELETE("/test-type/:test_id", controller.DeleteTestType(pool))

	// Competency Routes
	admin.GET("/competency-categories", controller.GetCompetencyCategories(pool))
	admin.POST("/competency-category", controller.AddCompetencyCategory(pool))
	admin.PUT("/competency-category/:competency_category_id", controller.UpdateCompetencyCategory(pool))
	admin.GET("/competent-persons", controller.GetCompetentPersons(pool))
	admin.POST("/competent-person", controller.AddCompetentPerson(pool))
	admin.PUT("/competent-person/:competent_person_id", controller.UpdateCompetentPerson(pool))

	// Template Routes
	admin.POST("/template", controller.AddTemplate(pool))
	admin.PUT("/template/:template_id", controller.UpdateTemplate(pool))
	admin.PUT("/template/:template_id/configuration", controller.ConfigureTemplate(pool))
	admin.DELETE("/template/:template_id", controller.DeleteTemplate(pool))

	// Template Component Routes
	admin.POST("/template/:template_id/component", controller.AddTemplateComponent(pool))
	admin.PUT("/template-component/:template_component_id", controller.UpdateTemplateComponent(pool))
	admin.DELETE("/template-component/:template_component_id", controller.DeleteTemplateComponent(pool))

	// Template Component Test Routes
	admin.POST("/template-component/:template_component_id/test", controller.AddTemplateComponentTest(pool))
	admin.DELETE("/template-component-test/:template_component_test_id", controller.DeleteTemplateComponentTest(pool))

	// ===================Authenticated Account Routes======================================================
	account := router.Group("/v1")
	account.Use(middleware.AuthMiddleware(), middleware.ActiveUserMiddleware(pool))
	account.GET("/session", controller.GetSession())
	account.PUT("/account/password", controller.UpdatePassword(pool))
	account.POST("/logout", controller.LogoutUser(pool))

	// ===================Protected Staff Routes======================================================
	protected := router.Group("/v1")
	protected.Use(middleware.AuthMiddleware(), middleware.ActiveUserMiddleware(pool), middleware.StaffMiddleware())

	// User Routes
	protected.GET("/users", controller.GetUsers(pool))
	protected.GET("/user/:user_id", controller.GetUser(pool))

	// Asset Routes
	protected.GET("/assets", controller.GetAssets(pool))
	protected.GET("/asset/:asset_id", controller.GetAsset(pool))
	protected.GET("/asset/:asset_id/routine-maintenance", controller.GetAssetRoutineMaintenance(pool))
	protected.GET("/asset/:asset_id/component-certificate-sheet", controller.GetAssetComponentCertificateSheetPDF(pool))

	// Component Routes
	protected.GET("/components", controller.GetComponents(pool))
	protected.GET("/component/:component_id", controller.GetComponent(pool))
	protected.GET("/components/asset/:asset_id", controller.GetComponentsByAsset(pool))

	// Certificate Routes
	protected.GET("/certificates", controller.GetCertificates(pool))
	protected.GET("/certificate/:certificate_id", controller.GetCertificate(pool))
	protected.GET("/certificates/component/:component_id", controller.GetCertificatesByComponent(pool))
	protected.GET("/certificates/expiring", controller.GetExpiringCertificates(pool))
	protected.GET("/certificates/dashboard", controller.GetCertificatesWithContext(pool))
	protected.GET("/certificates/report", controller.GetCertificatesReportPDF(pool))
	protected.GET("/certificate/:certificate_id/file", controller.GetCertificateFile(pool))
	protected.GET("/certificate/:certificate_id/uploads", controller.GetCertificateUploadAudit(pool))
	protected.GET("/certificate/:certificate_id/uploads/:upload_id/file", controller.GetCertificateUploadFile(pool))

	// Main Category Routes
	protected.GET("/main-categories", controller.GetMainCategories(pool))
	protected.GET("/main-category/:main_category_id", controller.GetMainCategory(pool))

	// Category Routes
	protected.GET("/categories", controller.GetCategories(pool))
	protected.GET("/category/:category_id", controller.GetCategory(pool))
	protected.GET("/categories/main/:main_category_id", controller.GetCategoriesByMainCategory(pool))

	// Test Type Routes
	protected.GET("/test-types", controller.GetTestTypes(pool))

	// Competency Routes
	protected.GET("/competency-categories/active", controller.GetActiveCompetencyCategories(pool))
	protected.GET("/competent-persons/active", controller.GetActiveCompetentPersons(pool))

	// Template Routes
	protected.GET("/templates", controller.GetTemplates(pool))
	protected.GET("/template/:template_id", controller.GetTemplate(pool))
	protected.GET("/template/:template_id/configuration", controller.GetTemplateConfiguration(pool))
	protected.GET("/template/:template_id/components", controller.GetTemplateComponents(pool))
	protected.GET("/template-component/:template_component_id/tests", controller.GetTemplateComponentTests(pool))

	// ===================Client Routes======================================================
	client := router.Group("/v1/client")
	client.Use(middleware.AuthMiddleware(), middleware.ActiveUserMiddleware(pool), middleware.ClientMiddleware())

	client.GET("/assets", controller.GetClientAssets(pool))
	client.GET("/asset/:asset_id", controller.GetClientAsset(pool))
	client.GET("/certificate/:certificate_id/file", controller.GetClientCertificateFile(pool))
}
