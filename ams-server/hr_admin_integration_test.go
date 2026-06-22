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

func TestHRAdminProductRolesEnforceWriteArchiveAndConfigurationAccess(t *testing.T) {
	h := setupIntegrationTest(t)

	hrUserToken := createIntegrationUserToken(t, h.pool, "HR", "User", "hr-user@example.com", "user-password", "USER")
	hrUser := mustGetIntegrationUserByEmail(t, h.pool, "hr-user@example.com")
	grantHRAdminProductAccess(t, h, hrUser.UserID.String(), "USER")

	hrViewerToken := createIntegrationUserToken(t, h.pool, "HR", "Viewer", "hr-viewer-roles@example.com", "viewer-password", "USER")
	hrViewer := mustGetIntegrationUserByEmail(t, h.pool, "hr-viewer-roles@example.com")
	grantHRAdminProductAccess(t, h, hrViewer.UserID.String(), "VIEWER")

	person := decodeObject(t, performJSONRequest(t, h.router, hrUserToken, http.MethodPost, "/v1/hr-admin/persons", map[string]any{
		"person_code": "HRP-ROLE-USER",
		"full_name":   "HR Product User",
		"department":  "Administration",
		"role_title":  "Coordinator",
	}, http.StatusCreated))
	personID := stringField(t, person, "person_id")
	assertUUID(t, personID)

	updatedPerson := decodeObject(t, performJSONRequest(t, h.router, hrUserToken, http.MethodPut, "/v1/hr-admin/persons/"+personID, map[string]any{
		"person_code": "HRP-ROLE-USER",
		"full_name":   "HR Product User Updated",
		"department":  "Administration",
		"role_title":  "Coordinator",
	}, http.StatusOK))
	assertField(t, updatedPerson, "message", "HR/Admin person updated successfully")

	performJSONRequest(t, h.router, hrUserToken, http.MethodPatch, "/v1/hr-admin/persons/"+personID+"/archive", map[string]any{
		"archive_reason": "USER cannot archive",
	}, http.StatusForbidden)

	performJSONRequest(t, h.router, hrUserToken, http.MethodPut, "/v1/hr-admin/notification-configuration", map[string]any{
		"email_recipients": "hr-user@example.com",
	}, http.StatusForbidden)

	performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/hr-admin/persons?page=1&limit=20", nil, http.StatusOK)
	performJSONRequest(t, h.router, hrViewerToken, http.MethodPost, "/v1/hr-admin/vehicles", map[string]any{
		"plate_number": "VIEWER-BLOCKED",
		"make":         "Blocked",
	}, http.StatusForbidden)
}

func TestHRAdminComplianceValidationAndArchiveEdges(t *testing.T) {
	h := setupIntegrationTest(t)
	now := time.Now().UTC().Truncate(time.Second)

	personID := createHRAdminPerson(t, h, "HRP-EDGE-001", "Edge Person")
	personTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":            "PERSON",
		"type_name":               "Edge Visa",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 24,
		"reminder_policy_days":    []int{90, 30, 7},
		"requires_document":       true,
		"active":                  true,
	})
	recordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":      "PERSON",
		"subject_id":        personID,
		"record_type_id":    personTypeID,
		"issue_date":        now,
		"expiry_date":       now.AddDate(2, 0, 0),
		"document_file":     "edge-visa-v1.pdf",
		"issuing_authority": "Authority",
	})

	duplicate := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records", map[string]any{
		"subject_type":      "PERSON",
		"subject_id":        personID,
		"record_type_id":    personTypeID,
		"issue_date":        now,
		"expiry_date":       now.AddDate(2, 0, 0),
		"document_file":     "edge-visa-duplicate.pdf",
		"issuing_authority": "Authority",
	}, http.StatusConflict))
	assertField(t, duplicate, "error", "active compliance record already exists for this subject and type")

	companyID := createHRAdminCompany(t, h, "HRC-EDGE-001", "Edge Company")
	companyTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":      "COMPANY",
		"type_name":         "Trade License Copy",
		"renewal_behavior":  "ONE_TIME",
		"requires_document": false,
		"active":            true,
	})
	createComplianceRecord(t, h, map[string]any{
		"subject_type":      "COMPANY",
		"subject_id":        companyID,
		"record_type_id":    companyTypeID,
		"issue_date":        now,
		"issuing_authority": "Authority",
	})

	vehicleID := createHRAdminVehicle(t, h, "EDGE-VEH-001")
	vehicleTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":            "VEHICLE",
		"type_name":               "Vehicle Registration",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 12,
		"reminder_policy_days":    []int{60, 30, 7},
		"requires_document":       false,
		"active":                  true,
	})

	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/persons/"+personID+"/archive", map[string]any{
		"archive_reason": "No longer company responsibility",
	}, http.StatusOK)

	archivedPersonRenewal := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records/"+recordID+"/versions", map[string]any{
		"issue_date":    now.AddDate(2, 0, 0),
		"expiry_date":   now.AddDate(4, 0, 0),
		"document_file": "edge-visa-v2.pdf",
	}, http.StatusBadRequest))
	assertField(t, archivedPersonRenewal, "error", "person is archived")

	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/vehicles/"+vehicleID+"/archive", map[string]any{
		"archive_reason": "Vehicle sold",
	}, http.StatusOK)
	archivedVehicleRecord := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records", map[string]any{
		"subject_type":   "VEHICLE",
		"subject_id":     vehicleID,
		"record_type_id": vehicleTypeID,
		"issue_date":     now,
		"expiry_date":    now.AddDate(1, 0, 0),
	}, http.StatusBadRequest))
	assertField(t, archivedVehicleRecord, "error", "vehicle is archived")

	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/companies/"+companyID+"/archive", map[string]any{
		"archive_reason": "Company no longer used",
	}, http.StatusOK)
	archivedCompanyRecord := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records", map[string]any{
		"subject_type":   "COMPANY",
		"subject_id":     companyID,
		"record_type_id": companyTypeID,
		"issue_date":     now,
	}, http.StatusBadRequest))
	assertField(t, archivedCompanyRecord, "error", "company is archived")
}

func grantHRAdminProductAccess(t *testing.T, h *integrationHarness, userID, productRole string) {
	t.Helper()

	access := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/platform/product-access", map[string]any{
		"user_id":      userID,
		"product_key":  "HR_ADMIN",
		"product_role": productRole,
		"status":       "ACTIVE",
	}, http.StatusOK))
	assertField(t, access, "product_key", "HR_ADMIN")
	assertField(t, access, "product_role", productRole)
}

func createHRAdminPerson(t *testing.T, h *integrationHarness, personCode, fullName string) string {
	t.Helper()

	person := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/persons", map[string]any{
		"person_code": personCode,
		"full_name":   fullName,
		"department":  "Administration",
		"role_title":  "Coordinator",
	}, http.StatusCreated))
	personID := stringField(t, person, "person_id")
	assertUUID(t, personID)
	return personID
}

func createHRAdminVehicle(t *testing.T, h *integrationHarness, plateNumber string) string {
	t.Helper()

	vehicle := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/vehicles", map[string]any{
		"plate_number": plateNumber,
		"make":         "Toyota",
		"model":        "Hiace",
		"vehicle_year": 2024,
	}, http.StatusCreated))
	vehicleID := stringField(t, vehicle, "vehicle_id")
	assertUUID(t, vehicleID)
	return vehicleID
}

func createHRAdminCompany(t *testing.T, h *integrationHarness, companyCode, companyName string) string {
	t.Helper()

	company := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/companies", map[string]any{
		"company_code": companyCode,
		"company_name": companyName,
		"company_kind": "LEGAL_ENTITY",
		"location":     "Dubai",
	}, http.StatusCreated))
	companyID := stringField(t, company, "company_id")
	assertUUID(t, companyID)
	return companyID
}

func createComplianceRecordType(t *testing.T, h *integrationHarness, payload map[string]any) string {
	t.Helper()

	recordType := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-record-types", payload, http.StatusCreated))
	recordTypeID := stringField(t, recordType, "record_type_id")
	assertUUID(t, recordTypeID)
	return recordTypeID
}

func createComplianceRecord(t *testing.T, h *integrationHarness, payload map[string]any) string {
	t.Helper()

	recordResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-records", payload, http.StatusCreated))
	record := unwrapEmbeddedObject(recordResponse, "record")
	recordID := stringField(t, record, "record_id")
	assertUUID(t, recordID)
	currentVersion := unwrapEmbeddedObject(recordResponse, "current_version")
	assertField(t, currentVersion, "version_number", float64(1))
	return recordID
}
