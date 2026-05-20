package main_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	controllers "github.com/maisarasherif/asset-management-system/ams-server/controllers"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/routes"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type integrationHarness struct {
	pool       *pgxpool.Pool
	router     *gin.Engine
	adminToken string
}

func TestTemplateConfigurationAndSpinUpRegression(t *testing.T) {
	h := setupIntegrationTest(t)

	mainCategoryID := createMainCategory(t, h, "Mechanical Systems")
	categoryID := createCategory(t, h, mainCategoryID, "Lifting Equipment")
	testOneID := createTestType(t, h, "Annual Inspection", 12)
	testTwoID := createTestType(t, h, "Load Test", 6)
	templateID := createTemplate(t, h, "Offshore Crane Template")

	configureResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, fmt.Sprintf("/v1/template/%s/configuration", templateID), map[string]any{
		"components": []map[string]any{
			templateComponentPayload(categoryID, "Main Hook", []string{testOneID, testTwoID}),
			templateComponentPayload(categoryID, "Wire Rope", []string{testTwoID}),
		},
	}, http.StatusOK))
	assertField(t, configureResponse, "components_configured", 2)
	assertField(t, configureResponse, "tests_assigned", 3)

	componentsAfterFirstConfigure := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, fmt.Sprintf("/v1/template/%s/components", templateID), nil, http.StatusOK))
	if len(componentsAfterFirstConfigure) != 2 {
		t.Fatalf("expected 2 template components after first configure, got %d", len(componentsAfterFirstConfigure))
	}

	reconfigureResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, fmt.Sprintf("/v1/template/%s/configuration", templateID), map[string]any{
		"components": []map[string]any{
			templateComponentPayload(categoryID, "Control Panel", []string{testOneID}),
		},
	}, http.StatusOK))
	assertField(t, reconfigureResponse, "components_configured", 1)
	assertField(t, reconfigureResponse, "tests_assigned", 1)

	componentsAfterReplace := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, fmt.Sprintf("/v1/template/%s/components", templateID), nil, http.StatusOK))
	if len(componentsAfterReplace) != 1 {
		t.Fatalf("expected full replace to leave 1 template component, got %d", len(componentsAfterReplace))
	}
	templateComponentID := stringField(t, componentsAfterReplace[0], "template_component_id")
	assertUUID(t, templateComponentID)
	assertField(t, componentsAfterReplace[0], "name", "Control Panel")

	templateTests := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, fmt.Sprintf("/v1/template-component/%s/tests", templateComponentID), nil, http.StatusOK))
	if len(templateTests) != 1 {
		t.Fatalf("expected 1 template component test after replace, got %d", len(templateTests))
	}
	assertField(t, templateTests[0], "test_id", testOneID)

	assetObject := createAsset(t, h, map[string]any{
		"name":             "Configured Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Created from configured template",
		"status":           "ACTIVE",
		"location":         "Yard B",
		"assigned_project": "Project Atlas",
		"template_id":      templateID,
	})
	assertNotField(t, assetObject, "template_version")

	assetID := stringField(t, assetObject, "asset_id")
	assertUUID(t, assetID)

	spunUpComponentsResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, fmt.Sprintf("/v1/components/asset/%s?page=1&limit=20", assetID), nil, http.StatusOK))
	spunUpComponents := dataArray(t, spunUpComponentsResponse)
	if len(spunUpComponents) != 1 {
		t.Fatalf("expected 1 spun-up component from current template configuration, got %d", len(spunUpComponents))
	}
	assertField(t, spunUpComponents[0], "name", "Control Panel")

	componentID := stringField(t, spunUpComponents[0], "component_id")
	assertUUID(t, componentID)

	spunUpCertificatesResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, fmt.Sprintf("/v1/certificates/component/%s?page=1&limit=20", componentID), nil, http.StatusOK))
	spunUpCertificates := dataArray(t, spunUpCertificatesResponse)
	if len(spunUpCertificates) != 1 {
		t.Fatalf("expected 1 spun-up certificate from current template configuration, got %d", len(spunUpCertificates))
	}
	assertField(t, spunUpCertificates[0], "status", "PENDING")
	assertField(t, spunUpCertificates[0], "test_id", testOneID)

	deleteUsedTemplateResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, fmt.Sprintf("/v1/template/%s", templateID), nil, http.StatusConflict))
	assertField(t, deleteUsedTemplateResponse, "error", "template is in use by existing assets")
}

func TestCreateAssetWithoutTemplate(t *testing.T) {
	h := setupIntegrationTest(t)

	asset := createAsset(t, h, map[string]any{
		"name":             "Standalone Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "No template",
		"status":           "ACTIVE",
		"location":         "Warehouse A",
		"assigned_project": "Project North",
	})

	assertField(t, asset, "name", "Standalone Asset")
	assertField(t, asset, "status", "ACTIVE")
	assertField(t, asset, "location", "Warehouse A")
}

func TestCreateAssetWithInvalidStatus(t *testing.T) {
	h := setupIntegrationTest(t)

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/asset", map[string]any{
		"name":             "Bad Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Invalid status",
		"status":           "INVALID",
		"location":         "Warehouse A",
		"assigned_project": "Project North",
	}, http.StatusBadRequest))

	assertField(t, body, "error", "validation failed")
}

func TestCreateAssetWithNonExistentTemplate(t *testing.T) {
	h := setupIntegrationTest(t)
	missingTemplateID := uuid.NewString()

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/asset", map[string]any{
		"name":             "Template Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Invalid template",
		"status":           "ACTIVE",
		"location":         "Warehouse A",
		"assigned_project": "Project North",
		"template_id":      missingTemplateID,
	}, http.StatusNotFound))

	assertField(t, body, "error", "template not found")
}

func TestGetAsset(t *testing.T) {
	h := setupIntegrationTest(t)
	created := createAsset(t, h, map[string]any{
		"name":             "Gettable Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Fetch me",
		"status":           "ACTIVE",
		"location":         "Zone 1",
		"assigned_project": "Project One",
	})

	assetID := stringField(t, created, "asset_id")
	fetched := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/asset/"+assetID, nil, http.StatusOK))

	assertField(t, fetched, "asset_id", assetID)
	assertField(t, fetched, "name", "Gettable Asset")
	assertField(t, fetched, "status", "ACTIVE")
}

func TestUpdateAsset(t *testing.T) {
	h := setupIntegrationTest(t)
	created := createAsset(t, h, map[string]any{
		"name":             "Original Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Before update",
		"status":           "ACTIVE",
		"location":         "Old Yard",
		"assigned_project": "Project One",
	})

	assetID := stringField(t, created, "asset_id")
	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/asset/"+assetID, map[string]any{
		"name":             "Updated Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "After update",
		"status":           "MAINTENANCE",
		"location":         "New Yard",
		"assigned_project": "Project Two",
	}, http.StatusOK)

	fetched := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/asset/"+assetID, nil, http.StatusOK))
	assertField(t, fetched, "name", "Updated Asset")
	assertField(t, fetched, "description", "After update")
	assertField(t, fetched, "status", "MAINTENANCE")
	assertField(t, fetched, "location", "New Yard")
}

func TestPatchAsset(t *testing.T) {
	h := setupIntegrationTest(t)
	created := createAsset(t, h, map[string]any{
		"name":             "Patchable Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Patch me",
		"status":           "ACTIVE",
		"location":         "Yard 1",
		"assigned_project": "Project One",
	})

	assetID := stringField(t, created, "asset_id")
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/asset/"+assetID, map[string]any{
		"status": "INACTIVE",
	}, http.StatusOK)

	fetched := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/asset/"+assetID, nil, http.StatusOK))
	assertField(t, fetched, "status", "INACTIVE")
	assertField(t, fetched, "name", "Patchable Asset")
	assertField(t, fetched, "description", "Patch me")
}

func TestRoutineMaintenanceThresholdFlowIsIdempotent(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)

	created := createAsset(t, h, map[string]any{
		"name":                       "Routine Maintenance Asset",
		"photo":                      "",
		"datasheet":                  "",
		"description":                "Tracks maintenance by working hours",
		"status":                     "ACTIVE",
		"location":                   "Engine Room",
		"assigned_project":           "Project Maintenance",
		"maintenance_interval_hours": 100,
	})
	assetID := stringField(t, created, "asset_id")
	assertField(t, created, "maintenance_interval_hours", 100)
	assertField(t, created, "next_maintenance_due_hours", 100)

	belowThreshold := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/asset/"+assetID+"/working-hours", map[string]any{
		"working_hours": 90,
		"note":          "Below threshold",
	}, http.StatusOK))
	belowAsset := objectField(t, belowThreshold, "asset")
	assertField(t, belowAsset, "working_hours", 90)
	if belowThreshold["maintenance_event"] != nil {
		t.Fatalf("expected no maintenance event below threshold, got %v", belowThreshold["maintenance_event"])
	}

	events := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/asset/"+assetID+"/routine-maintenance", nil, http.StatusOK))
	if len(events) != 0 {
		t.Fatalf("expected no routine maintenance events below threshold, got %d", len(events))
	}

	triggered := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/asset/"+assetID+"/working-hours", map[string]any{
		"working_hours": 100,
		"note":          "Reached threshold",
	}, http.StatusOK))
	triggeredAsset := objectField(t, triggered, "asset")
	assertField(t, triggeredAsset, "status", "MAINTENANCE")
	assertField(t, triggeredAsset, "working_hours", 100)
	triggeredEvent := objectField(t, triggered, "maintenance_event")
	assertField(t, triggeredEvent, "status", "REQUIRED")
	assertField(t, triggeredEvent, "due_at_hours", 100)
	assertField(t, triggeredEvent, "triggered_at_hours", 100)
	eventID := stringField(t, triggeredEvent, "maintenance_event_id")

	duplicate := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/asset/"+assetID+"/working-hours", map[string]any{
		"working_hours": 125,
		"note":          "Same maintenance cycle",
	}, http.StatusOK))
	if duplicate["maintenance_event"] != nil {
		t.Fatalf("expected duplicate threshold update to return no new event, got %v", duplicate["maintenance_event"])
	}

	events = decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/asset/"+assetID+"/routine-maintenance", nil, http.StatusOK))
	if len(events) != 1 {
		t.Fatalf("expected exactly one open routine maintenance event, got %d", len(events))
	}
	assertField(t, events[0], "maintenance_event_id", eventID)
	assertField(t, events[0], "status", "REQUIRED")

	completed := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/asset/"+assetID+"/routine-maintenance/complete", map[string]any{
		"completion_notes": "Routine service completed",
	}, http.StatusOK))
	completedAsset := objectField(t, completed, "asset")
	assertField(t, completedAsset, "status", "ACTIVE")
	assertField(t, completedAsset, "last_maintenance_completed_hours", 125)
	assertField(t, completedAsset, "next_maintenance_due_hours", 225)
	completedEvent := objectField(t, completed, "maintenance_event")
	assertField(t, completedEvent, "status", "COMPLETED")
	assertField(t, completedEvent, "completion_notes", "Routine service completed")

	events = decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/asset/"+assetID+"/routine-maintenance", nil, http.StatusOK))
	if len(events) != 1 {
		t.Fatalf("expected completed event history to remain available, got %d events", len(events))
	}
	assertField(t, events[0], "status", "COMPLETED")
}

func TestWorkingHoursCannotDecrease(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)

	assetID := stringField(t, createAsset(t, h, map[string]any{
		"name":                       "Counter Guard Asset",
		"photo":                      "",
		"datasheet":                  "",
		"description":                "Protects monotonic working hours",
		"status":                     "ACTIVE",
		"location":                   "Deck",
		"assigned_project":           "Project Counter",
		"maintenance_interval_hours": 500,
	}), "asset_id")

	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/asset/"+assetID+"/working-hours", map[string]any{
		"working_hours": 200,
		"note":          "Initial reading",
	}, http.StatusOK)

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/asset/"+assetID+"/working-hours", map[string]any{
		"working_hours": 199,
		"note":          "Invalid lower reading",
	}, http.StatusBadRequest))
	assertField(t, body, "error", "working hours cannot be lower than the current counter")
}

func TestDeleteAsset(t *testing.T) {
	h := setupIntegrationTest(t)
	created := createAsset(t, h, map[string]any{
		"name":             "Disposable Asset",
		"photo":            "",
		"datasheet":        "",
		"description":      "Delete me",
		"status":           "ACTIVE",
		"location":         "Yard 1",
		"assigned_project": "Project One",
	})

	assetID := stringField(t, created, "asset_id")
	performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/asset/"+assetID, nil, http.StatusOK)
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/asset/"+assetID, nil, http.StatusNotFound)
}

func TestDeleteAssetBlockedWhenTemplateInUse(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Operations")
	categoryID := createCategory(t, h, mainCategoryID, "Winches")
	testID := createTestType(t, h, "Inspection", 6)
	templateID := createConfiguredTemplate(t, h, categoryID, "Operational Template", "Configured Part", []string{testID})
	createAsset(t, h, map[string]any{
		"name":             "Asset Using Template",
		"photo":            "",
		"datasheet":        "",
		"description":      "Uses template",
		"status":           "ACTIVE",
		"location":         "Zone A",
		"assigned_project": "Project One",
		"template_id":      templateID,
	})

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/template/"+templateID, nil, http.StatusConflict))
	assertField(t, body, "error", "template is in use by existing assets")
}

func TestCreateComponent(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	assetID := stringField(t, createAsset(t, h, baseAssetPayload("Asset For Component")), "asset_id")

	component := createComponent(t, h, map[string]any{
		"asset_id":         assetID,
		"category_id":      categoryID,
		"name":             "Main Hook",
		"serial_number":    "SN-100",
		"manufacturer":     "Liebherr",
		"description":      "Primary hook",
		"location":         "Deck A",
		"assigned_project": "Project One",
		"equipment_type":   "Hook",
		"structure":        "Fixed",
		"model":            "MH-1",
		"class":            "A",
		"class_code":       "HK-1",
		"safety_critical":  "YES",
	})

	assertField(t, component, "name", "Main Hook")
	assertField(t, component, "asset_id", assetID)
	assertField(t, component, "category_id", categoryID)
}

func TestCreateComponentWithNonExistentAsset(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	missingAssetID := uuid.NewString()

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/component", map[string]any{
		"asset_id":         missingAssetID,
		"category_id":      categoryID,
		"name":             "Main Hook",
		"serial_number":    "",
		"manufacturer":     "",
		"description":      "",
		"location":         "",
		"assigned_project": "",
		"equipment_type":   "",
		"structure":        "",
		"model":            "",
		"class":            "",
		"class_code":       "",
		"safety_critical":  "YES",
	}, http.StatusNotFound))

	assertField(t, body, "error", "asset not found")
}

func TestCreateComponentWithNonExistentCategory(t *testing.T) {
	h := setupIntegrationTest(t)
	assetID := stringField(t, createAsset(t, h, baseAssetPayload("Asset For Component")), "asset_id")
	missingCategoryID := uuid.NewString()

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/component", map[string]any{
		"asset_id":         assetID,
		"category_id":      missingCategoryID,
		"name":             "Main Hook",
		"serial_number":    "",
		"manufacturer":     "",
		"description":      "",
		"location":         "",
		"assigned_project": "",
		"equipment_type":   "",
		"structure":        "",
		"model":            "",
		"class":            "",
		"class_code":       "",
		"safety_critical":  "YES",
	}, http.StatusNotFound))

	assertField(t, body, "error", "category not found")
}

func TestGetComponentsByAsset(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	assetID := stringField(t, createAsset(t, h, baseAssetPayload("Asset For Pagination")), "asset_id")

	createComponent(t, h, componentPayload(assetID, categoryID, "Component One"))
	createComponent(t, h, componentPayload(assetID, categoryID, "Component Two"))

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, fmt.Sprintf("/v1/components/asset/%s?page=1&limit=1", assetID), nil, http.StatusOK))
	if len(dataArray(t, body)) != 1 {
		t.Fatalf("expected 1 item on page, got %d", len(dataArray(t, body)))
	}

	meta, ok := body["meta"].(map[string]any)
	if !ok {
		t.Fatalf("expected meta object, got %v", body)
	}
	assertField(t, meta, "page", 1)
	assertField(t, meta, "limit", 1)
	if paginatedCount(t, body) != 2 {
		t.Fatalf("expected total count 2, got %d", paginatedCount(t, body))
	}
}

func TestDeleteComponentCascadesCertificates(t *testing.T) {
	h := setupIntegrationTest(t)
	componentID, testID := createComponentFixture(t, h, "Cascade Component")
	certificateID := stringField(t, createCertificate(t, h, certificatePayload(componentID, testID, 90)), "certificate_id")

	performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/component/"+componentID, nil, http.StatusOK)
	performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+certificateID, nil, http.StatusNotFound)
}

func TestCreateCertificate(t *testing.T) {
	h := setupIntegrationTest(t)
	componentID, testID := createComponentFixture(t, h, "Certified Component")

	certificate := createCertificate(t, h, certificatePayload(componentID, testID, 90))
	assertField(t, certificate, "component_id", componentID)
	assertField(t, certificate, "test_id", testID)
	assertField(t, certificate, "status", "VALID")
}

func TestCreateCertificateExpiryBeforeIssue(t *testing.T) {
	h := setupIntegrationTest(t)
	componentID, testID := createComponentFixture(t, h, "Bad Certificate Component")

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/certificate", map[string]any{
		"component_id":      componentID,
		"certificate_name":  "Expired on arrival",
		"issue_date":        time.Now().UTC(),
		"expiry_date":       time.Now().UTC().AddDate(0, 0, -1),
		"certificate_file":  "",
		"issuing_authority": "Bureau Veritas",
		"test_id":           testID,
		"imca_ref":          "",
		"imca_d018":         "",
		"maintenance_notes": "",
	}, http.StatusBadRequest))

	assertField(t, body, "error", "expiry date must be after issue date")
}

func TestPatchCertificateStatus(t *testing.T) {
	h := setupIntegrationTest(t)
	componentID, testID := createComponentFixture(t, h, "Patch Certificate Component")
	certificateID := stringField(t, createCertificate(t, h, certificatePayload(componentID, testID, 120)), "certificate_id")

	expirySoon := time.Now().UTC().AddDate(0, 0, 10)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/certificate/"+certificateID, map[string]any{
		"expiry_date": expirySoon,
	}, http.StatusOK)

	fetched := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+certificateID, nil, http.StatusOK))
	assertField(t, fetched, "status", "EXPIRING_SOON")
}

func TestCertificateStatusComputation(t *testing.T) {
	h := setupIntegrationTest(t)
	componentID, testID := createComponentFixture(t, h, "Status Component")

	cases := []struct {
		name       string
		offsetDays int
		expected   string
	}{
		{name: "valid", offsetDays: 90, expected: "VALID"},
		{name: "expiring soon", offsetDays: 10, expected: "EXPIRING_SOON"},
		{name: "expired", offsetDays: -2, expected: "EXPIRED"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			certificate := createCertificate(t, h, certificatePayload(componentID, testID, tc.offsetDays))
			assertField(t, certificate, "status", tc.expected)
		})
	}
}

func TestUploadCertificateFile(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)

	componentID, testID := createComponentFixture(t, h, "Upload Component")
	certificateID := stringField(t, createCertificate(t, h, certificatePayload(componentID, testID, 90)), "certificate_id")
	competentPersonID := createCompetentPersonFixture(t, h.pool, "Upload Competent Person")

	performMultipartRequest(t, h.router, h.adminToken, "/v1/certificate/"+certificateID+"/file", "file", "certificate.pdf", []byte("%PDF-1.4 test document"), map[string]string{
		"competent_person_id": competentPersonID,
	}, http.StatusOK)

	audit := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+certificateID+"/uploads?page=1&limit=20", nil, http.StatusOK))
	if paginatedCount(t, audit) != 1 {
		t.Fatalf("expected 1 upload audit entry, got %d", paginatedCount(t, audit))
	}
}

func TestGetCertificateSignedURL(t *testing.T) {
	h := setupIntegrationTest(t)
	requireStorageIntegrationEnv(t)

	componentID, testID := createComponentFixture(t, h, "Signed URL Component")
	certificateID := stringField(t, createCertificate(t, h, certificatePayload(componentID, testID, 90)), "certificate_id")
	competentPersonID := createCompetentPersonFixture(t, h.pool, "Signed URL Competent Person")

	performMultipartRequest(t, h.router, h.adminToken, "/v1/certificate/"+certificateID+"/file", "file", "certificate.pdf", []byte("%PDF-1.4 signed url document"), map[string]string{
		"competent_person_id": competentPersonID,
	}, http.StatusOK)

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/certificate/"+certificateID+"/file", nil, http.StatusOK))
	url := stringField(t, body, "url")
	if strings.TrimSpace(url) == "" {
		t.Fatal("expected signed URL, got empty string")
	}
}

func TestDeleteCertificate(t *testing.T) {
	h := setupIntegrationTest(t)
	componentID, testID := createComponentFixture(t, h, "Delete Certificate Component")
	certificateID := stringField(t, createCertificate(t, h, certificatePayload(componentID, testID, 90)), "certificate_id")
	parsedCertificateID, err := utils.ParseUUID(certificateID, "certificate_id")
	if err != nil {
		t.Fatalf("failed to parse certificate id: %v", err)
	}
	queries := db.New(h.pool)

	if _, err := queries.CreateCertificateUploadAuditEntry(context.Background(), db.CreateCertificateUploadAuditEntryParams{
		CertificateID:     parsedCertificateID,
		FileKey:           "certificates/manual.pdf",
		FileName:          "manual.pdf",
		UploadedBy:        adminUserID(t, h.pool),
		CompetentPersonID: nil,
	}); err != nil {
		t.Fatalf("failed to seed certificate upload audit: %v", err)
	}

	performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/certificate/"+certificateID, nil, http.StatusOK)

	count, err := queries.CountCertificateUploadAuditByCertificateID(context.Background(), parsedCertificateID)
	if err != nil {
		t.Fatalf("failed to count certificate upload audit after delete: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected certificate upload audit to cascade delete, got %d rows", count)
	}
}

func TestDeleteCategoryBlockedWhenComponentsExist(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	assetID := stringField(t, createAsset(t, h, baseAssetPayload("Asset For Category Guard")), "asset_id")
	createComponent(t, h, componentPayload(assetID, categoryID, "Blocking Component"))

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/category/"+categoryID, nil, http.StatusConflict))
	assertField(t, body, "error", "category has components assigned to it")
}

func TestDeleteCategoryBlockedWhenTemplateComponentsExist(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	testID := createTestType(t, h, "Inspection", 12)
	createConfiguredTemplate(t, h, categoryID, "Category Guard Template", "Blocking Template Component", []string{testID})

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/category/"+categoryID, nil, http.StatusConflict))
	assertField(t, body, "error", "category is used by template components")
}

func TestDeleteCategoryNotFound(t *testing.T) {
	h := setupIntegrationTest(t)
	missingCategoryID := uuid.NewString()

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/category/"+missingCategoryID, nil, http.StatusNotFound))
	assertField(t, body, "error", "category not found")
}

func TestDeleteMainCategoryBlockedWhenCategoriesExist(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	createCategory(t, h, mainCategoryID, "Hooks")

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/main-category/"+mainCategoryID, nil, http.StatusConflict))
	assertField(t, body, "error", "main category has categories assigned to it")
}

func TestConfigureTemplateWithDuplicateTestIDs(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	testID := createTestType(t, h, "Inspection", 12)
	templateID := createTemplate(t, h, "Duplicate Tests Template")

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/template/"+templateID+"/configuration", map[string]any{
		"components": []map[string]any{
			templateComponentPayload(categoryID, "Hook Assembly", []string{testID, testID}),
		},
	}, http.StatusBadRequest))

	assertField(t, body, "error", fmt.Sprintf("duplicate test_id %q found in component %q", testID, "Hook Assembly"))
}

func TestConfigureTemplateWithNonExistentCategory(t *testing.T) {
	h := setupIntegrationTest(t)
	testID := createTestType(t, h, "Inspection", 12)
	templateID := createTemplate(t, h, "Missing Category Template")
	missingCategoryID := uuid.NewString()

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/template/"+templateID+"/configuration", map[string]any{
		"components": []map[string]any{
			templateComponentPayload(missingCategoryID, "Hook Assembly", []string{testID}),
		},
	}, http.StatusNotFound))

	assertField(t, body, "error", "one or more categories were not found")
}

func TestConfigureTemplateWithNonExistentTestType(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	templateID := createTemplate(t, h, "Missing Test Template")
	missingTestID := uuid.NewString()

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/template/"+templateID+"/configuration", map[string]any{
		"components": []map[string]any{
			templateComponentPayload(categoryID, "Hook Assembly", []string{missingTestID}),
		},
	}, http.StatusNotFound))

	assertField(t, body, "error", "one or more test types were not found")
}

func TestReconfigureTemplateReplacesComponents(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	testID := createTestType(t, h, "Inspection", 12)
	templateID := createTemplate(t, h, "Replace Template")

	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/template/"+templateID+"/configuration", map[string]any{
		"components": []map[string]any{
			templateComponentPayload(categoryID, "First Component", []string{testID}),
			templateComponentPayload(categoryID, "Second Component", []string{testID}),
		},
	}, http.StatusOK)

	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/template/"+templateID+"/configuration", map[string]any{
		"components": []map[string]any{
			templateComponentPayload(categoryID, "Replacement Component", []string{testID}),
		},
	}, http.StatusOK)

	components := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/template/"+templateID+"/components", nil, http.StatusOK))
	if len(components) != 1 {
		t.Fatalf("expected 1 component after replacement, got %d", len(components))
	}
	assertField(t, components[0], "name", "Replacement Component")
}

func TestDeleteTemplateBlockedWhenAssetsExist(t *testing.T) {
	h := setupIntegrationTest(t)
	mainCategoryID := createMainCategory(t, h, "Mechanical")
	categoryID := createCategory(t, h, mainCategoryID, "Hooks")
	testID := createTestType(t, h, "Inspection", 12)
	templateID := createConfiguredTemplate(t, h, categoryID, "Delete Guard Template", "Configured Component", []string{testID})
	createAsset(t, h, map[string]any{
		"name":             "Asset Using Template",
		"photo":            "",
		"datasheet":        "",
		"description":      "Template user",
		"status":           "ACTIVE",
		"location":         "Yard 1",
		"assigned_project": "Project One",
		"template_id":      templateID,
	})

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/template/"+templateID, nil, http.StatusConflict))
	assertField(t, body, "error", "template is in use by existing assets")
}

func TestLoginSuccess(t *testing.T) {
	h := setupIntegrationTest(t)
	createIntegrationUser(t, h.pool, "Regular", "User", "login-success@example.com", "user-password", "USER")

	body := decodeObject(t, performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "login-success@example.com",
		"password": "user-password",
	}, http.StatusOK))

	if strings.TrimSpace(stringField(t, body, "token")) == "" {
		t.Fatal("expected token in login response")
	}
	if _, ok := body["refresh_token"]; ok {
		t.Fatal("expected login response not to expose refresh token")
	}
}

func TestLoginSetsAccessTokenCookieAndSessionReadsIt(t *testing.T) {
	h := setupIntegrationTest(t)
	createIntegrationUser(t, h.pool, "Cookie", "User", "login-cookie@example.com", "user-password", "USER")

	raw, err := json.Marshal(map[string]any{
		"email":    "login-cookie@example.com",
		"password": "user-password",
	})
	if err != nil {
		t.Fatalf("failed to marshal request payload: %v", err)
	}
	loginReq := httptest.NewRequest(http.MethodPost, "/v1/login", bytes.NewReader(raw))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRecorder := httptest.NewRecorder()
	h.router.ServeHTTP(loginRecorder, loginReq)
	if loginRecorder.Code != http.StatusOK {
		t.Fatalf("login returned %d, expected %d: %s", loginRecorder.Code, http.StatusOK, loginRecorder.Body.String())
	}

	var accessCookie *http.Cookie
	for _, cookie := range loginRecorder.Result().Cookies() {
		if cookie.Name == utils.AccessTokenCookieName {
			accessCookie = cookie
			break
		}
	}
	if accessCookie == nil {
		t.Fatal("expected access token cookie")
	}
	if !accessCookie.HttpOnly {
		t.Fatal("expected access token cookie to be HTTP-only")
	}
	if accessCookie.Value == "" {
		t.Fatal("expected access token cookie value")
	}
	if accessCookie.MaxAge != 0 {
		t.Fatal("expected access token cookie to be session scoped")
	}

	sessionReq := httptest.NewRequest(http.MethodGet, "/v1/session", nil)
	sessionReq.AddCookie(accessCookie)
	sessionRecorder := httptest.NewRecorder()
	h.router.ServeHTTP(sessionRecorder, sessionReq)
	if sessionRecorder.Code != http.StatusOK {
		t.Fatalf("session returned %d, expected %d: %s", sessionRecorder.Code, http.StatusOK, sessionRecorder.Body.String())
	}

	body := decodeObject(t, sessionRecorder.Body.Bytes())
	assertField(t, body, "email", "login-cookie@example.com")
	if _, ok := body["token"]; ok {
		t.Fatal("expected session response not to expose token")
	}
}

func TestLogoutClearsAccessTokenCookie(t *testing.T) {
	h := setupIntegrationTest(t)
	token := createIntegrationUserToken(t, h.pool, "Logout", "User", "logout-cookie@example.com", "user-password", "USER")

	req := httptest.NewRequest(http.MethodPost, "/v1/logout", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	h.router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("logout returned %d, expected %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == utils.AccessTokenCookieName {
			if cookie.MaxAge >= 0 {
				t.Fatalf("expected logout cookie to clear access token, got MaxAge %d", cookie.MaxAge)
			}
			return
		}
	}
	t.Fatal("expected logout to clear access token cookie")
}

func TestLoginWrongPassword(t *testing.T) {
	h := setupIntegrationTest(t)
	createIntegrationUser(t, h.pool, "Regular", "User", "login-fail@example.com", "user-password", "USER")

	body := decodeObject(t, performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "login-fail@example.com",
		"password": "wrong-password",
	}, http.StatusUnauthorized))

	assertField(t, body, "error", "invalid email or password")
}

func TestAccessProtectedRouteWithoutToken(t *testing.T) {
	h := setupIntegrationTest(t)

	body := decodeObject(t, performJSONRequest(t, h.router, "", http.MethodGet, "/v1/assets", nil, http.StatusUnauthorized))
	if _, ok := body["error"]; !ok {
		t.Fatalf("expected unauthorized error body, got %v", body)
	}
}

func TestAccessAdminRouteAsUser(t *testing.T) {
	h := setupIntegrationTest(t)
	userToken := createIntegrationUserToken(t, h.pool, "Regular", "User", "admin-route-user@example.com", "user-password", "USER")

	body := decodeObject(t, performJSONRequest(t, h.router, userToken, http.MethodPost, "/v1/template", map[string]any{
		"template_name": "Forbidden Template",
		"description":   "Should not be allowed",
	}, http.StatusUnauthorized))

	assertField(t, body, "error", "only ADMINS allowed")
}

func TestUpdatePassword(t *testing.T) {
	h := setupIntegrationTest(t)
	userToken := createIntegrationUserToken(t, h.pool, "Password", "User", "password-update@example.com", "old-password", "USER")

	performJSONRequest(t, h.router, userToken, http.MethodPut, "/v1/account/password", map[string]any{
		"current_password": "old-password",
		"new_password":     "new-password",
	}, http.StatusOK)

	performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "password-update@example.com",
		"password": "old-password",
	}, http.StatusUnauthorized)

	body := decodeObject(t, performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "password-update@example.com",
		"password": "new-password",
	}, http.StatusOK))
	if strings.TrimSpace(stringField(t, body, "token")) == "" {
		t.Fatal("expected token after password update")
	}
}

func TestSuperAdminCanChangeUserPassword(t *testing.T) {
	h := setupIntegrationTest(t)
	createIntegrationUser(t, h.pool, "Managed", "User", "managed-password@example.com", "old-password", "USER")
	targetUser := mustGetIntegrationUserByEmail(t, h.pool, "managed-password@example.com")

	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/user/"+targetUser.UserID.String()+"/password", map[string]any{
		"new_password": "new-password",
	}, http.StatusOK)

	performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "managed-password@example.com",
		"password": "old-password",
	}, http.StatusUnauthorized)

	body := decodeObject(t, performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "managed-password@example.com",
		"password": "new-password",
	}, http.StatusOK))
	if strings.TrimSpace(stringField(t, body, "token")) == "" {
		t.Fatal("expected token after super admin password change")
	}
}

func TestAdminCannotChangeUserPassword(t *testing.T) {
	h := setupIntegrationTest(t)
	adminToken := createIntegrationUserToken(t, h.pool, "Other", "Admin", "non-seeded-admin@example.com", "admin-password", "ADMIN")
	createIntegrationUser(t, h.pool, "Managed", "User", "blocked-password@example.com", "old-password", "USER")
	targetUser := mustGetIntegrationUserByEmail(t, h.pool, "blocked-password@example.com")

	body := decodeObject(t, performJSONRequest(t, h.router, adminToken, http.MethodPut, "/v1/user/"+targetUser.UserID.String()+"/password", map[string]any{
		"new_password": "new-password",
	}, http.StatusForbidden))
	assertField(t, body, "error", "only SUPER ADMIN can change user passwords")

	performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "blocked-password@example.com",
		"password": "new-password",
	}, http.StatusUnauthorized)

	body = decodeObject(t, performJSONRequest(t, h.router, "", http.MethodPost, "/v1/login", map[string]any{
		"email":    "blocked-password@example.com",
		"password": "old-password",
	}, http.StatusOK))
	if strings.TrimSpace(stringField(t, body, "token")) == "" {
		t.Fatal("expected old password to remain valid")
	}
}

func TestUserManagementAuditLogsRecordAdminActions(t *testing.T) {
	h := setupIntegrationTest(t)

	created := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/user", map[string]any{
		"first_name": "Audit",
		"last_name":  "User",
		"email":      "audit-user@example.com",
		"password":   "audit-password",
		"role":       "USER",
	}, http.StatusCreated))
	userID := stringField(t, created, "user_id")

	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/user/"+userID, map[string]any{
		"first_name": "Audit",
		"last_name":  "Admin",
		"email":      "audit-user@example.com",
		"role":       "ADMIN",
		"status":     "ACTIVE",
	}, http.StatusOK)

	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/user/"+userID+"/password", map[string]any{
		"new_password": "changed-password",
	}, http.StatusOK)

	performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, "/v1/user/"+userID, nil, http.StatusOK)

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/user-management-audit-logs?page=1&limit=20", nil, http.StatusOK))
	events := dataArray(t, body)
	if len(events) < 4 {
		t.Fatalf("expected at least 4 audit log events, got %d", len(events))
	}

	seen := map[string]bool{}
	for _, event := range events {
		if stringField(t, event, "target_email") == "audit-user@example.com" {
			seen[stringField(t, event, "action")] = true
		}
	}
	for _, action := range []string{"CREATE_USER", "UPDATE_USER", "RESET_PASSWORD", "DELETE_USER"} {
		if !seen[action] {
			t.Fatalf("expected audit action %s in events %v", action, seen)
		}
	}
}

func setupIntegrationTest(t *testing.T) *integrationHarness {
	t.Helper()

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
	_ = os.Setenv("SEED_ADMIN_EMAIL", "integration-admin@example.com")

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

	return &integrationHarness{
		pool:       pool,
		router:     buildIntegrationRouter(pool),
		adminToken: createIntegrationAdmin(t, pool),
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
  asset_maintenance_events,
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
	  competent_persons,
	  competency_categories,
	  user_management_audit_logs,
	  users
RESTART IDENTITY CASCADE;
`

	if _, err := pool.Exec(context.Background(), truncateSQL); err != nil {
		t.Fatalf("failed to reset test database: %v", err)
	}

	if _, err := pool.Exec(context.Background(), "ALTER SEQUENCE IF EXISTS asset_maintenance_event_display_id_seq RESTART WITH 1"); err != nil {
		t.Fatalf("failed to reset asset maintenance event display sequence: %v", err)
	}
}

func disableExternalMaintenanceNotifications(t *testing.T) {
	t.Helper()

	t.Setenv("ALERT_RECIPIENT_EMAIL", "")
	t.Setenv("CLICKUP_API_TOKEN", "")
	t.Setenv("CLICKUP_LIST_ID", "")
}

func createIntegrationAdmin(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	return createIntegrationUserToken(t, pool, "Integration", "Admin", "integration-admin@example.com", "admin-password", "SUPER_ADMIN")
}

func createIntegrationUserToken(t *testing.T, pool *pgxpool.Pool, firstName, lastName, email, password, role string) string {
	t.Helper()

	user := createIntegrationUser(t, pool, firstName, lastName, email, password, role)
	token, _, err := utils.GenerateAllTokens(user.Email, user.FirstName, user.LastName, user.Role, user.UserID.String())
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}
	return token
}

func createIntegrationUser(t *testing.T, pool *pgxpool.Pool, firstName, lastName, email, password, role string) db.CreateUserRow {
	t.Helper()

	hashedPassword, err := controllers.HashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	queries := db.New(pool)
	user, err := queries.CreateUser(context.Background(), db.CreateUserParams{
		FirstName: firstName,
		LastName:  lastName,
		Email:     email,
		Password:  hashedPassword,
		Role:      role,
		Status:    "ACTIVE",
	})
	if err != nil {
		t.Fatalf("failed to create integration user: %v", err)
	}
	return user
}

func mustGetIntegrationUserByEmail(t *testing.T, pool *pgxpool.Pool, email string) db.GetUserByEmailRow {
	t.Helper()

	queries := db.New(pool)
	user, err := queries.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("failed to get integration user by email: %v", err)
	}
	return user
}

func adminUserID(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()

	queries := db.New(pool)
	user, err := queries.GetUserByEmail(context.Background(), "integration-admin@example.com")
	if err != nil {
		t.Fatalf("failed to get integration admin user: %v", err)
	}
	return user.UserID.String()
}

func createMainCategory(t *testing.T, h *integrationHarness, name string) string {
	t.Helper()
	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/main-category", map[string]any{
		"main_category_name": name,
		"description":        name + " description",
		"sort_order":         1,
	}, http.StatusCreated))
	stringField(t, body, "display_id")
	id := stringField(t, body, "main_category_id")
	assertUUID(t, id)
	return id
}

func createCategory(t *testing.T, h *integrationHarness, mainCategoryID, name string) string {
	t.Helper()
	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/category", map[string]any{
		"main_category_id": mainCategoryID,
		"category_name":    name,
		"description":      name + " description",
		"sort_order":       1,
	}, http.StatusCreated))
	stringField(t, body, "display_id")
	id := stringField(t, body, "category_id")
	assertUUID(t, id)
	return id
}

func createTestType(t *testing.T, h *integrationHarness, name string, validity int) string {
	t.Helper()
	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/test-type", map[string]any{
		"test_name":         name,
		"validity_duration": validity,
		"description":       name + " description",
	}, http.StatusCreated))
	stringField(t, body, "display_id")
	id := stringField(t, body, "test_id")
	assertUUID(t, id)
	return id
}

func createTemplate(t *testing.T, h *integrationHarness, name string) string {
	t.Helper()
	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/template", map[string]any{
		"template_name": name,
		"description":   name + " description",
	}, http.StatusCreated))
	stringField(t, body, "display_id")
	id := stringField(t, body, "template_id")
	assertUUID(t, id)
	return id
}

func createConfiguredTemplate(t *testing.T, h *integrationHarness, categoryID, templateName, componentName string, testIDs []string) string {
	t.Helper()

	templateID := createTemplate(t, h, templateName)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/template/"+templateID+"/configuration", map[string]any{
		"components": []map[string]any{
			templateComponentPayload(categoryID, componentName, testIDs),
		},
	}, http.StatusOK)
	return templateID
}

func createAsset(t *testing.T, h *integrationHarness, payload map[string]any) map[string]any {
	t.Helper()
	body := unwrapEmbeddedObject(decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/asset", payload, http.StatusCreated)), "asset")
	stringField(t, body, "display_id")
	assertUUID(t, stringField(t, body, "asset_id"))
	return body
}

func createComponent(t *testing.T, h *integrationHarness, payload map[string]any) map[string]any {
	t.Helper()
	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/component", payload, http.StatusCreated))
	stringField(t, body, "display_id")
	assertUUID(t, stringField(t, body, "component_id"))
	return body
}

func createCertificate(t *testing.T, h *integrationHarness, payload map[string]any) map[string]any {
	t.Helper()
	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/certificate", payload, http.StatusCreated))
	stringField(t, body, "display_id")
	assertUUID(t, stringField(t, body, "certificate_id"))
	return body
}

func createComponentFixture(t *testing.T, h *integrationHarness, componentName string) (string, string) {
	t.Helper()

	mainCategoryID := createMainCategory(t, h, componentName+" Main Category")
	categoryID := createCategory(t, h, mainCategoryID, componentName+" Category")
	testID := createTestType(t, h, componentName+" Test", 12)
	assetID := stringField(t, createAsset(t, h, baseAssetPayload(componentName+" Asset")), "asset_id")
	componentID := stringField(t, createComponent(t, h, componentPayload(assetID, categoryID, componentName)), "component_id")
	return componentID, testID
}

func createCompetentPersonFixture(t *testing.T, pool *pgxpool.Pool, name string) string {
	t.Helper()

	queries := db.New(pool)
	category, err := queries.CreateCompetencyCategory(context.Background(), db.CreateCompetencyCategoryParams{
		CategoryCode: "TEST_" + strings.ReplaceAll(strings.ToUpper(name), " ", "_"),
		CategoryName: name + " Category",
		Description:  "Integration competency category",
		Active:       true,
	})
	if err != nil {
		t.Fatalf("failed to create competency category: %v", err)
	}

	person, err := queries.CreateCompetentPerson(context.Background(), db.CreateCompetentPersonParams{
		FullName:             name,
		PersonType:           "Internal",
		Organization:         "Integration",
		CompetencyCategoryID: category.CompetencyCategoryID,
		Active:               true,
	})
	if err != nil {
		t.Fatalf("failed to create competent person: %v", err)
	}

	return person.CompetentPersonID.String()
}

func baseAssetPayload(name string) map[string]any {
	return map[string]any{
		"name":             name,
		"photo":            "",
		"datasheet":        "",
		"description":      name + " description",
		"status":           "ACTIVE",
		"location":         "Default Yard",
		"assigned_project": "Default Project",
	}
}

func componentPayload(assetID, categoryID, name string) map[string]any {
	return map[string]any{
		"asset_id":         assetID,
		"category_id":      categoryID,
		"name":             name,
		"serial_number":    name + "-SN",
		"manufacturer":     "Integration Manufacturer",
		"description":      name + " description",
		"location":         "Deck A",
		"assigned_project": "Project One",
		"equipment_type":   "Equipment",
		"structure":        "Fixed",
		"model":            "Model-1",
		"class":            "A",
		"class_code":       "CLS-1",
		"safety_critical":  "YES",
	}
}

func templateComponentPayload(categoryID, name string, testIDs []string) map[string]any {
	return map[string]any{
		"category_id":      categoryID,
		"name":             name,
		"description":      name + " description",
		"serial_number":    "",
		"manufacturer":     "Integration Manufacturer",
		"location":         "",
		"assigned_project": "",
		"equipment_type":   "Equipment",
		"structure":        "Fixed",
		"model":            "Model-1",
		"class":            "A",
		"class_code":       "CLS-1",
		"safety_critical":  "YES",
		"test_ids":         testIDs,
	}
}

func certificatePayload(componentID, testID string, expiryOffsetDays int) map[string]any {
	now := time.Now().UTC().Truncate(time.Second)
	issueDate := now.AddDate(0, 0, -1)
	expiryDate := now.AddDate(0, 0, expiryOffsetDays)
	if expiryOffsetDays < 0 {
		issueDate = now.AddDate(0, 0, expiryOffsetDays-30)
	}
	return map[string]any{
		"component_id":      componentID,
		"certificate_name":  fmt.Sprintf("Certificate %d", expiryOffsetDays),
		"issue_date":        issueDate,
		"expiry_date":       expiryDate,
		"certificate_file":  "",
		"issuing_authority": "Bureau Veritas",
		"test_id":           testID,
		"imca_ref":          "",
		"imca_d018":         "",
		"maintenance_notes": "Integration test note",
	}
}

func requireStorageIntegrationEnv(t *testing.T) {
	t.Helper()

	required := []string{
		"R2_S3_ENDPOINT",
		"R2_S3_REGION",
		"R2_S3_ACCESS_KEY_ID",
		"R2_S3_SECRET_ACCESS_KEY",
		"R2_S3_BUCKET",
	}
	for _, key := range required {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Skipf("skipping storage-backed integration test because %s is not set", key)
		}
	}
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

func performMultipartRequest(t *testing.T, router *gin.Engine, token, path string, fieldName, fileName string, fileContent []byte, fields map[string]string, expectedStatus int) []byte {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("failed to write multipart field: %v", err)
		}
	}

	contentType := mime.TypeByExtension(filepath.Ext(fileName))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	partHeader := textproto.MIMEHeader{}
	partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, fileName))
	partHeader.Set("Content-Type", contentType)

	part, err := writer.CreatePart(partHeader)
	if err != nil {
		t.Fatalf("failed to create multipart part: %v", err)
	}
	if _, err := part.Write(fileContent); err != nil {
		t.Fatalf("failed to write multipart file content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != expectedStatus {
		t.Fatalf("POST %s returned %d, expected %d: %s", path, recorder.Code, expectedStatus, recorder.Body.String())
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

func objectField(t *testing.T, body map[string]any, key string) map[string]any {
	t.Helper()

	value, ok := body[key].(map[string]any)
	if !ok {
		t.Fatalf("expected %q to be an object in %v", key, body)
	}
	return value
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

func assertField(t *testing.T, body map[string]any, key string, expected any) {
	t.Helper()

	got, ok := body[key]
	if !ok {
		t.Fatalf("expected field %q in %v", key, body)
	}

	switch want := expected.(type) {
	case int:
		gotNumber, ok := got.(float64)
		if !ok || int(gotNumber) != want {
			t.Fatalf("expected %q=%v, got %v", key, expected, got)
		}
	case int64:
		gotNumber, ok := got.(float64)
		if !ok || int64(gotNumber) != want {
			t.Fatalf("expected %q=%v, got %v", key, expected, got)
		}
	default:
		if !reflect.DeepEqual(got, expected) {
			t.Fatalf("expected %q=%v, got %v", key, expected, got)
		}
	}
}

func assertNotField(t *testing.T, body map[string]any, key string) {
	t.Helper()

	if _, exists := body[key]; exists {
		t.Fatalf("expected field %q to be absent in %v", key, body)
	}
}

func paginatedCount(t *testing.T, body map[string]any) int {
	t.Helper()

	meta, ok := body["meta"].(map[string]any)
	if !ok {
		t.Fatalf("expected paginated response meta in %v", body)
	}
	total, ok := meta["total"].(float64)
	if !ok {
		t.Fatalf("expected meta.total number in %v", body)
	}
	return int(total)
}

func assertUUID(t *testing.T, value string) {
	t.Helper()

	if !uuidPattern.MatchString(strings.ToLower(value)) {
		t.Fatalf("expected UUID id, got %q", value)
	}
}
