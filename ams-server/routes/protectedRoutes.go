package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	controller "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	"github.com/maisarasherif/asset-management-system/ams-server/middleware"
	"github.com/riverqueue/river"
)

func SetupProtectedRoutes(router *gin.Engine, pool *pgxpool.Pool) {
	SetupProtectedRoutesWithJobs(router, pool, nil, nil)
}

func SetupProtectedRoutesWithJobs(router *gin.Engine, pool *pgxpool.Pool, riverUIHandler http.Handler, riverClient *river.Client[pgx.Tx]) {

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
	admin.PUT("/asset/:asset_id", controller.UpdateAsset(pool, riverClient))
	admin.PATCH("/asset/:asset_id", controller.PatchAsset(pool, riverClient))
	admin.PATCH("/asset/:asset_id/working-hours", controller.UpdateAssetWorkingHours(pool, riverClient))
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

	// Catalog Scope Routes
	admin.POST("/catalog-scope", controller.AddCatalogScope(pool))
	admin.PUT("/catalog-scope/:scope_id", controller.UpdateCatalogScope(pool))
	admin.POST("/catalog-scope/:scope_id/duplicate", controller.DuplicateCatalogScope(pool))
	admin.DELETE("/catalog-scope/:scope_id", controller.DeleteCatalogScope(pool))
	admin.POST("/catalog-scope/:scope_id/main-category", controller.AddCatalogScopeMainCategory(pool))
	admin.PUT("/catalog-scope-main-category/:scope_main_category_id", controller.UpdateCatalogScopeMainCategory(pool))
	admin.DELETE("/catalog-scope-main-category/:scope_main_category_id", controller.DeleteCatalogScopeMainCategory(pool))
	admin.POST("/catalog-scope/:scope_id/category", controller.AddCatalogScopeCategory(pool))
	admin.PUT("/catalog-scope-category/:scope_category_id", controller.UpdateCatalogScopeCategory(pool))
	admin.DELETE("/catalog-scope-category/:scope_category_id", controller.DeleteCatalogScopeCategory(pool))

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

	// Equipment Type Routes
	admin.POST("/equipment-type", controller.AddEquipmentType(pool))
	admin.PUT("/equipment-type/:equipment_type_id", controller.UpdateEquipmentType(pool))
	admin.PATCH("/equipment-type/:equipment_type_id", controller.PatchEquipmentType(pool))
	admin.DELETE("/equipment-type/:equipment_type_id", controller.DeleteEquipmentType(pool))

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
	account.GET("/platform/products", controller.GetPlatformProducts(pool))
	account.PUT("/account/password", controller.UpdatePassword(pool))
	account.POST("/logout", controller.LogoutUser(pool))

	platformAdmin := router.Group("/v1/platform")
	platformAdmin.Use(
		middleware.AuthMiddleware(),
		middleware.ActiveUserMiddleware(pool),
		middleware.SuperAdminMiddleware(),
	)
	platformAdmin.GET("/product-access", controller.GetProductAccess(pool))
	platformAdmin.POST("/product-access", controller.UpsertProductAccess(pool))
	platformAdmin.DELETE("/product-access/:access_id", controller.DeleteProductAccess(pool))

	// ===================Protected Staff Routes======================================================
	protected := router.Group("/v1")
	protected.Use(middleware.AuthMiddleware(), middleware.ActiveUserMiddleware(pool), middleware.StaffMiddleware())

	// User Routes
	protected.GET("/users", controller.GetUsers(pool))
	protected.GET("/user/:user_id", controller.GetUser(pool))

	// Asset Routes
	protected.GET("/assets", controller.GetAssets(pool))
	protected.GET("/asset/:asset_id", controller.GetAsset(pool))
	protected.GET("/asset/:asset_id/single-equipment", controller.GetSingleAssetEquipment(pool))
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

	// Catalog Scope Routes
	protected.GET("/catalog-scopes", controller.GetCatalogScopes(pool))
	protected.GET("/catalog-scopes/default", controller.GetDefaultCatalogScope(pool))
	protected.GET("/catalog-scope/:scope_id/main-categories", controller.GetCatalogScopeMainCategories(pool))
	protected.GET("/catalog-scope/:scope_id/categories", controller.GetCatalogScopeCategories(pool))

	// Category Routes
	protected.GET("/categories", controller.GetCategories(pool))
	protected.GET("/category/:category_id", controller.GetCategory(pool))
	protected.GET("/categories/main/:main_category_id", controller.GetCategoriesByMainCategory(pool))

	// Test Type Routes
	protected.GET("/test-types", controller.GetTestTypes(pool))

	// Equipment Type Routes
	protected.GET("/equipment-types", controller.GetEquipmentTypes(pool))
	protected.GET("/equipment-type/:equipment_type_id", controller.GetEquipmentType(pool))

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

	scheduler := router.Group("/v1")
	scheduler.Use(
		middleware.AuthMiddleware(),
		middleware.ActiveUserMiddleware(pool),
		middleware.SuperAdminMiddleware(),
	)
	scheduler.GET("/scheduler/certificate-notifications", controller.GetCertificateNotificationTasks(pool))
	scheduler.GET("/scheduler/notification-failures", controller.GetCertificateNotificationFailures(pool))
	scheduler.POST("/scheduler/run", controller.RunCertificateExpiryScheduler(pool, riverClient))

	hrRead := router.Group("/v1/hr-admin")
	hrRead.Use(
		middleware.AuthMiddleware(),
		middleware.ActiveUserMiddleware(pool),
		middleware.ProductAccessMiddleware(pool, controller.ProductHRAdmin, "ADMIN", "USER", "VIEWER"),
	)
	hrRead.GET("/persons", controller.GetHRAdminPersons(pool))
	hrRead.GET("/vehicles", controller.GetHRAdminVehicles(pool))
	hrRead.GET("/companies", controller.GetHRAdminCompanies(pool))
	hrRead.GET("/compliance-record-types", controller.GetComplianceRecordTypes(pool))
	hrRead.GET("/compliance-records", controller.GetComplianceRecords(pool))
	hrRead.GET("/compliance-records/:record_id/versions", controller.GetComplianceRecordVersions(pool))
	hrRead.GET("/notification-configuration", controller.GetHRAdminNotificationConfiguration(pool))

	hrWrite := router.Group("/v1/hr-admin")
	hrWrite.Use(
		middleware.AuthMiddleware(),
		middleware.ActiveUserMiddleware(pool),
		middleware.ProductAccessMiddleware(pool, controller.ProductHRAdmin, "ADMIN", "USER"),
	)
	hrWrite.POST("/persons", controller.CreateHRAdminPerson(pool))
	hrWrite.PUT("/persons/:person_id", controller.UpdateHRAdminPerson(pool))
	hrWrite.POST("/vehicles", controller.CreateHRAdminVehicle(pool))
	hrWrite.PUT("/vehicles/:vehicle_id", controller.UpdateHRAdminVehicle(pool))
	hrWrite.POST("/companies", controller.CreateHRAdminCompany(pool))
	hrWrite.PUT("/companies/:company_id", controller.UpdateHRAdminCompany(pool))
	hrWrite.POST("/compliance-records", controller.CreateComplianceRecord(pool))
	hrWrite.POST("/compliance-records/:record_id/versions", controller.RenewComplianceRecord(pool))

	hrAdmin := router.Group("/v1/hr-admin")
	hrAdmin.Use(
		middleware.AuthMiddleware(),
		middleware.ActiveUserMiddleware(pool),
		middleware.ProductAccessMiddleware(pool, controller.ProductHRAdmin, "ADMIN"),
	)
	hrAdmin.PATCH("/persons/:person_id/archive", controller.ArchiveHRAdminPerson(pool))
	hrAdmin.PATCH("/vehicles/:vehicle_id/archive", controller.ArchiveHRAdminVehicle(pool))
	hrAdmin.PATCH("/companies/:company_id/archive", controller.ArchiveHRAdminCompany(pool))
	hrAdmin.POST("/compliance-record-types", controller.CreateComplianceRecordType(pool))
	hrAdmin.PUT("/compliance-record-types/:record_type_id", controller.UpdateComplianceRecordType(pool))
	hrAdmin.PATCH("/compliance-records/:record_id/archive", controller.ArchiveComplianceRecord(pool))
	hrAdmin.PUT("/notification-configuration", controller.UpdateHRAdminNotificationConfiguration(pool))

	if riverUIHandler != nil {
		jobs := router.Group("/v1/admin/jobs")
		jobs.Use(
			middleware.AuthMiddleware(),
			middleware.ActiveUserMiddleware(pool),
			middleware.SuperAdminMiddleware(),
		)
		jobs.Any("", gin.WrapH(riverUIHandler))
		jobs.Any("/*path", gin.WrapH(riverUIHandler))
	}
}
