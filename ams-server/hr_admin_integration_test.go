package main_test

import (
	"net/http"
	"testing"
	"time"
)

func TestHRAdminProductAccessAndComplianceRecordVersionFlow(t *testing.T) {
	h := setupIntegrationTest(t)

	hrViewerToken := createIntegrationUserToken(t, h.pool, "HR", "Viewer", "hr-viewer@example.com", "viewer-password", "USER")
	hrViewer := mustGetIntegrationUserByEmail(t, h.pool, "hr-viewer@example.com")

	performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/hr-admin/persons?page=1&limit=20", nil, http.StatusForbidden)

	body := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/platform/product-access", map[string]any{
		"user_id":      hrViewer.UserID.String(),
		"product_key":  "HR_ADMIN",
		"product_role": "CLIENT",
		"status":       "ACTIVE",
	}, http.StatusBadRequest))
	assertField(t, body, "error", "HR/Admin product does not support CLIENT role")

	access := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/platform/product-access", map[string]any{
		"user_id":      hrViewer.UserID.String(),
		"product_key":  "HR_ADMIN",
		"product_role": "VIEWER",
		"status":       "ACTIVE",
	}, http.StatusOK))
	assertField(t, access, "product_key", "HR_ADMIN")
	assertField(t, access, "product_role", "VIEWER")

	products := decodeObject(t, performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/platform/products", nil, http.StatusOK))
	productList := products["products"].([]any)
	if len(productList) != 2 {
		t.Fatalf("expected AMS and HR/Admin product entries, got %#v", productList)
	}

	performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/hr-admin/persons?page=1&limit=20", nil, http.StatusOK)
	performJSONRequest(t, h.router, hrViewerToken, http.MethodPost, "/v1/hr-admin/persons", map[string]any{
		"full_name": "Blocked Viewer",
	}, http.StatusForbidden)

	config := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/hr-admin/notification-configuration", map[string]any{
		"email_recipients":     "hr@example.com",
		"clickup_list_id":      "list-123",
		"clickup_assignee_ids": "456,789",
	}, http.StatusOK))
	assertField(t, config, "product_key", "HR_ADMIN")
	assertField(t, config, "email_recipients", "hr@example.com")

	person := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/persons", map[string]any{
		"person_code": "HRP-001",
		"full_name":   "Company Responsibility Person",
		"department":  "Operations",
		"role_title":  "Technician",
	}, http.StatusCreated))
	personID := stringField(t, person, "person_id")
	assertUUID(t, personID)

	recordType := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-record-types", map[string]any{
		"subject_type":            "PERSON",
		"type_name":               "Employment Visa",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 24,
		"reminder_policy_days":    []int{90, 30, 7},
		"requires_document":       true,
		"active":                  true,
		"description":             "Person visa renewal tracking",
	}, http.StatusCreated))
	recordTypeID := stringField(t, recordType, "record_type_id")
	assertUUID(t, recordTypeID)

	now := time.Now().UTC().Truncate(time.Second)
	missingExpiry := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records", map[string]any{
		"subject_type":      "PERSON",
		"subject_id":        personID,
		"record_type_id":    recordTypeID,
		"issue_date":        now,
		"document_file":     "visa-v1.pdf",
		"issuing_authority": "Authority",
	}, http.StatusBadRequest))
	assertField(t, missingExpiry, "error", "expiry date is required for renewable compliance record types")

	recordResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records", map[string]any{
		"subject_type":      "PERSON",
		"subject_id":        personID,
		"record_type_id":    recordTypeID,
		"issue_date":        now,
		"expiry_date":       now.AddDate(2, 0, 0),
		"document_file":     "visa-v1.pdf",
		"issuing_authority": "Authority",
		"notes":             "Initial issue",
	}, http.StatusCreated))
	record := unwrapEmbeddedObject(recordResponse, "record")
	recordID := stringField(t, record, "record_id")
	assertUUID(t, recordID)
	currentVersion := unwrapEmbeddedObject(recordResponse, "current_version")
	assertField(t, currentVersion, "version_number", float64(1))

	renewed := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records/"+recordID+"/versions", map[string]any{
		"issue_date":        now.AddDate(2, 0, 0),
		"expiry_date":       now.AddDate(4, 0, 0),
		"document_file":     "visa-v2.pdf",
		"issuing_authority": "Authority",
		"notes":             "Renewed",
	}, http.StatusCreated))
	assertField(t, renewed, "version_number", float64(2))

	versions := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/compliance-records/"+recordID+"/versions", nil, http.StatusOK))
	if len(versions) != 2 {
		t.Fatalf("expected two compliance record versions after renewal, got %d", len(versions))
	}

	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/compliance-records/"+recordID+"/archive", map[string]any{}, http.StatusBadRequest)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/compliance-records/"+recordID+"/archive", map[string]any{
		"archive_reason": "No longer company responsibility",
	}, http.StatusOK)

	archivedRenewal := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records/"+recordID+"/versions", map[string]any{
		"issue_date":    now.AddDate(4, 0, 0),
		"expiry_date":   now.AddDate(6, 0, 0),
		"document_file": "visa-v3.pdf",
	}, http.StatusBadRequest))
	assertField(t, archivedRenewal, "error", "archived compliance records cannot be renewed")
}
