package main_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	controllers "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/routes"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

var flatIDPattern = regexp.MustCompile(`^\d{3,}$`)

func TestTemplateConfigurationAndSpinUpRegression(t *testing.T) {
	if os.Getenv("AMS_RUN_INTEGRATION") != "1" {
		t.Skip("set AMS_RUN_INTEGRATION=1 to run integration regression tests")
	}

	_ = godotenv.Load(".env")
	if os.Getenv("SECRET_KEY") == "" {
		_ = os.Setenv("SECRET_KEY", "integration-secret-key")
	}
	if os.Getenv("SECRET_REFRESH_KEY") == "" {
		_ = os.Setenv("SECRET_REFRESH_KEY", "integration-refresh-secret-key")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Fatal("DATABASE_URL must be set to run integration regression tests")
	}

	logger.Init()
	gin.SetMode(gin.TestMode)

	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("failed to connect to postgres: %v", err)
	}
	t.Cleanup(pool.Close)

	resetIntegrationDatabase(t, pool)

	adminToken := createIntegrationAdmin(t, pool)
	router := buildIntegrationRouter(pool)

	mainCategory := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPost, "/v1/main-category", map[string]any{
		"main_category_name": "Mechanical Systems",
		"description":        "Mechanical equipment and assemblies",
	}, http.StatusCreated))
	mainCategoryID := stringField(t, mainCategory, "main_category_id")
	assertFlatID(t, mainCategoryID)

	category := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPost, "/v1/category", map[string]any{
		"main_category_id": mainCategoryID,
		"category_name":    "Lifting Equipment",
		"description":      "Hooks, ropes, and lifting parts",
	}, http.StatusCreated))
	categoryID := stringField(t, category, "category_id")
	assertFlatID(t, categoryID)

	testOne := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPost, "/v1/test-type", map[string]any{
		"test_name":         "Annual Inspection",
		"validity_duration": 365,
		"description":       "Annual safety inspection",
	}, http.StatusCreated))
	testOneID := stringField(t, testOne, "test_id")
	assertFlatID(t, testOneID)

	testTwo := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPost, "/v1/test-type", map[string]any{
		"test_name":         "Load Test",
		"validity_duration": 180,
		"description":       "Load-bearing verification",
	}, http.StatusCreated))
	testTwoID := stringField(t, testTwo, "test_id")
	assertFlatID(t, testTwoID)

	template := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPost, "/v1/template", map[string]any{
		"template_name": "Offshore Crane Template",
		"description":   "Bulk configuration regression template",
	}, http.StatusCreated))
	if _, exists := template["current_version"]; exists {
		t.Fatalf("template response unexpectedly included current_version: %v", template)
	}
	templateID := stringField(t, template, "template_id")
	assertFlatID(t, templateID)

	configureResponse := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPut, fmt.Sprintf("/v1/template/%s/configuration", templateID), map[string]any{
		"components": []map[string]any{
			{
				"category_id":      categoryID,
				"name":             "Main Hook",
				"description":      "Primary lifting hook",
				"serial_number":    "",
				"manufacturer":     "Liebherr",
				"location":         "",
				"assigned_project": "",
				"equipment_type":   "Hook",
				"structure":        "Fixed",
				"model":            "MH-500",
				"class":            "A",
				"class_code":       "LFT-001",
				"safety_critical":  "YES",
				"test_ids":         []string{testOneID, testTwoID},
			},
			{
				"category_id":      categoryID,
				"name":             "Wire Rope",
				"description":      "Primary rope assembly",
				"serial_number":    "",
				"manufacturer":     "Liebherr",
				"location":         "",
				"assigned_project": "",
				"equipment_type":   "Rope",
				"structure":        "Flexible",
				"model":            "WR-100",
				"class":            "B",
				"class_code":       "ROP-001",
				"safety_critical":  "YES",
				"test_ids":         []string{testTwoID},
			},
		},
	}, http.StatusOK))
	if intField(t, configureResponse, "components_configured") != 2 {
		t.Fatalf("expected 2 configured components, got %v", configureResponse)
	}
	if intField(t, configureResponse, "tests_assigned") != 3 {
		t.Fatalf("expected 3 configured tests, got %v", configureResponse)
	}

	componentsAfterFirstConfigure := decodeArray(t, performJSONRequest(t, router, adminToken, http.MethodGet, fmt.Sprintf("/v1/template/%s/components", templateID), nil, http.StatusOK))
	if len(componentsAfterFirstConfigure) != 2 {
		t.Fatalf("expected 2 template components after first configure, got %d", len(componentsAfterFirstConfigure))
	}

	reconfigureResponse := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPut, fmt.Sprintf("/v1/template/%s/configuration", templateID), map[string]any{
		"components": []map[string]any{
			{
				"category_id":      categoryID,
				"name":             "Control Panel",
				"description":      "Updated template structure",
				"serial_number":    "",
				"manufacturer":     "Siemens",
				"location":         "",
				"assigned_project": "",
				"equipment_type":   "Control",
				"structure":        "Panel",
				"model":            "CP-200",
				"class":            "A",
				"class_code":       "CTL-001",
				"safety_critical":  "YES",
				"test_ids":         []string{testOneID},
			},
		},
	}, http.StatusOK))
	if intField(t, reconfigureResponse, "components_configured") != 1 {
		t.Fatalf("expected 1 configured component after replace, got %v", reconfigureResponse)
	}
	if intField(t, reconfigureResponse, "tests_assigned") != 1 {
		t.Fatalf("expected 1 configured test after replace, got %v", reconfigureResponse)
	}

	componentsAfterReplace := decodeArray(t, performJSONRequest(t, router, adminToken, http.MethodGet, fmt.Sprintf("/v1/template/%s/components", templateID), nil, http.StatusOK))
	if len(componentsAfterReplace) != 1 {
		t.Fatalf("expected full replace to leave 1 template component, got %d", len(componentsAfterReplace))
	}
	templateComponentID := stringField(t, componentsAfterReplace[0], "template_component_id")
	assertFlatID(t, templateComponentID)
	if got := stringField(t, componentsAfterReplace[0], "name"); got != "Control Panel" {
		t.Fatalf("expected replaced template component to be Control Panel, got %q", got)
	}

	templateTests := decodeArray(t, performJSONRequest(t, router, adminToken, http.MethodGet, fmt.Sprintf("/v1/template-component/%s/tests", templateComponentID), nil, http.StatusOK))
	if len(templateTests) != 1 {
		t.Fatalf("expected 1 template component test after replace, got %d", len(templateTests))
	}
	if got := stringField(t, templateTests[0], "test_id"); got != testOneID {
		t.Fatalf("expected replaced template test to use %q, got %q", testOneID, got)
	}

	assetResponse := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodPost, "/v1/asset", map[string]any{
		"name":             "Configured Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Created from configured template",
		"status":           "ACTIVE",
		"location":         "Yard B",
		"assigned_project": "Project Atlas",
		"template_id":      templateID,
	}, http.StatusCreated))
	assetObject := unwrapEmbeddedObject(assetResponse, "asset")
	if _, exists := assetObject["template_version"]; exists {
		t.Fatalf("asset response unexpectedly included template_version: %v", assetObject)
	}
	assetID := stringField(t, assetObject, "asset_id")
	assertFlatID(t, assetID)

	spunUpComponentsResponse := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodGet, fmt.Sprintf("/v1/components/asset/%s?page=1&limit=20", assetID), nil, http.StatusOK))
	spunUpComponents := dataArray(t, spunUpComponentsResponse)
	if len(spunUpComponents) != 1 {
		t.Fatalf("expected 1 spun-up component from current template configuration, got %d", len(spunUpComponents))
	}
	if got := stringField(t, spunUpComponents[0], "name"); got != "Control Panel" {
		t.Fatalf("expected spun-up component to match reconfigured template, got %q", got)
	}
	componentID := stringField(t, spunUpComponents[0], "component_id")
	assertFlatID(t, componentID)

	spunUpCertificatesResponse := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodGet, fmt.Sprintf("/v1/certificates/component/%s?page=1&limit=20", componentID), nil, http.StatusOK))
	spunUpCertificates := dataArray(t, spunUpCertificatesResponse)
	if len(spunUpCertificates) != 1 {
		t.Fatalf("expected 1 spun-up certificate from current template configuration, got %d", len(spunUpCertificates))
	}
	if got := stringField(t, spunUpCertificates[0], "status"); got != "PENDING" {
		t.Fatalf("expected spun-up certificate status PENDING, got %q", got)
	}
	if got := stringField(t, spunUpCertificates[0], "test_id"); got != testOneID {
		t.Fatalf("expected spun-up certificate to use %q, got %q", testOneID, got)
	}

	deleteUsedTemplateResponse := decodeObject(t, performJSONRequest(t, router, adminToken, http.MethodDelete, fmt.Sprintf("/v1/template/%s", templateID), nil, http.StatusConflict))
	if got := stringField(t, deleteUsedTemplateResponse, "error"); got != "template is in use by existing assets" {
		t.Fatalf("expected used template delete to be blocked, got %q", got)
	}
}

func buildIntegrationRouter(pool *pgxpool.Pool) *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery())
	routes.SetupUnprotectedRoutes(router, pool)
	routes.SetupProtectedRoutes(router, pool)
	return router
}

func resetIntegrationDatabase(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	const truncateSQL = `
TRUNCATE TABLE
  scheduled_tasks,
  certificate_upload_audit,
  certificates,
  components,
  assets,
  template_component_tests,
  template_components,
  asset_templates,
  categories,
  main_categories,
  test_types,
  users
RESTART IDENTITY CASCADE;
`

	if _, err := pool.Exec(context.Background(), truncateSQL); err != nil {
		t.Fatalf("failed to reset test database: %v", err)
	}
}

func createIntegrationAdmin(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()

	hashedPassword, err := controllers.HashPassword("admin-password")
	if err != nil {
		t.Fatalf("failed to hash admin password: %v", err)
	}

	queries := db.New(pool)
	user, err := queries.CreateUser(context.Background(), db.CreateUserParams{
		FirstName: "Integration",
		LastName:  "Admin",
		Email:     "integration-admin@example.com",
		Password:  hashedPassword,
		Role:      "ADMIN",
	})
	if err != nil {
		t.Fatalf("failed to create integration admin: %v", err)
	}

	token, _, err := utils.GenerateAllTokens(user.Email, user.FirstName, user.LastName, user.Role, user.UserID)
	if err != nil {
		t.Fatalf("failed to generate admin token: %v", err)
	}

	return token
}

func performJSONRequest(t *testing.T, router *gin.Engine, token, method, path string, payload any, expectedStatus int) []byte {
	t.Helper()

	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		raw, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("failed to marshal request payload: %v", err)
		}
		body = bytes.NewReader(raw)
	}

	req := httptest.NewRequest(method, path, body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != expectedStatus {
		t.Fatalf("%s %s returned %d, expected %d: %s", method, path, recorder.Code, expectedStatus, recorder.Body.String())
	}

	return recorder.Body.Bytes()
}

func decodeObject(t *testing.T, raw []byte) map[string]any {
	t.Helper()

	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("failed to decode JSON object: %v", err)
	}
	return body
}

func decodeArray(t *testing.T, raw []byte) []map[string]any {
	t.Helper()

	var items []map[string]any
	if err := json.Unmarshal(raw, &items); err != nil {
		t.Fatalf("failed to decode JSON array: %v", err)
	}
	return items
}

func dataArray(t *testing.T, body map[string]any) []map[string]any {
	t.Helper()

	rawItems, ok := body["data"].([]any)
	if !ok {
		t.Fatalf("expected paginated response with data array, got %v", body)
	}

	items := make([]map[string]any, 0, len(rawItems))
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("expected array item to be an object, got %T", raw)
		}
		items = append(items, item)
	}

	return items
}

func unwrapEmbeddedObject(body map[string]any, key string) map[string]any {
	if raw, exists := body[key]; exists {
		if embedded, ok := raw.(map[string]any); ok {
			return embedded
		}
	}
	return body
}

func stringField(t *testing.T, body map[string]any, key string) string {
	t.Helper()

	value, ok := body[key].(string)
	if !ok {
		t.Fatalf("expected %q to be a string in %v", key, body)
	}
	return value
}

func intField(t *testing.T, body map[string]any, key string) int {
	t.Helper()

	value, ok := body[key].(float64)
	if !ok {
		t.Fatalf("expected %q to be a number in %v", key, body)
	}
	return int(value)
}

func assertFlatID(t *testing.T, value string) {
	t.Helper()

	if !flatIDPattern.MatchString(value) {
		t.Fatalf("expected flat numeric business id, got %q", value)
	}
}
