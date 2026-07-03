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
		"email_recipients":      "hr@example.com",
		"clickup_list_id":       "list-123",
		"clickup_assignee_ids":  "456,789",
		"default_reminder_days": []int{60, 30, 7},
	}, http.StatusOK))
	assertField(t, config, "product_key", "HR_ADMIN")
	assertField(t, config, "email_recipients", "hr@example.com")
	assertField(t, config, "clickup_list_id", "list-123")
	assertField(t, config, "clickup_assignee_ids", "456,789")
	assertField(t, config, "default_reminder_days", []any{float64(60), float64(30), float64(7)})

	readConfig := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/notification-configuration", nil, http.StatusOK))
	assertField(t, readConfig, "product_key", "HR_ADMIN")
	assertField(t, readConfig, "email_recipients", "hr@example.com")
	assertField(t, readConfig, "clickup_list_id", "list-123")
	assertField(t, readConfig, "clickup_assignee_ids", "456,789")
	assertField(t, readConfig, "default_reminder_days", []any{float64(60), float64(30), float64(7)})

	defaultConfig := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/hr-admin/notification-configuration", map[string]any{
		"email_recipients":     "hr-default@example.com",
		"clickup_list_id":      "list-default",
		"clickup_assignee_ids": "123",
	}, http.StatusOK))
	assertField(t, defaultConfig, "default_reminder_days", []any{float64(30), float64(7), float64(1)})

	invalidConfig := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/hr-admin/notification-configuration", map[string]any{
		"default_reminder_days": []int{30, -1},
	}, http.StatusBadRequest))
	assertField(t, invalidConfig, "error", "default reminder days must be between 0 and 3650")

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

	performJSONRequest(t, h.router, hrUserToken, http.MethodPost, "/v1/hr-admin/compliance-record-types", map[string]any{
		"subject_type":      "PERSON",
		"type_name":         "USER Blocked Type",
		"renewal_behavior":  "ONE_TIME",
		"requires_document": false,
		"active":            true,
	}, http.StatusForbidden)

	hrUserConfig := decodeObject(t, performJSONRequest(t, h.router, hrUserToken, http.MethodGet, "/v1/hr-admin/notification-configuration", nil, http.StatusOK))
	assertField(t, hrUserConfig, "product_key", "HR_ADMIN")

	missingDocument := decodeObject(t, performJSONRequest(t, h.router, hrUserToken, http.MethodPost, "/v1/hr-admin/compliance-record-documents", nil, http.StatusBadRequest))
	assertField(t, missingDocument, "error", "file is required")

	performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/hr-admin/persons?page=1&limit=20", nil, http.StatusOK)
	performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/hr-admin/notification-configuration", nil, http.StatusOK)
	performJSONRequest(t, h.router, hrViewerToken, http.MethodPost, "/v1/hr-admin/vehicles", map[string]any{
		"plate_number": "VIEWER-BLOCKED",
		"make":         "Blocked",
	}, http.StatusForbidden)
	performJSONRequest(t, h.router, hrViewerToken, http.MethodPut, "/v1/hr-admin/notification-configuration", map[string]any{
		"email_recipients": "hr-viewer@example.com",
	}, http.StatusForbidden)
	performJSONRequest(t, h.router, hrViewerToken, http.MethodPost, "/v1/hr-admin/compliance-record-documents", nil, http.StatusForbidden)
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
	oneTimeWithDefaultValidity := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/compliance-record-types", map[string]any{
		"subject_type":            "COMPANY",
		"type_name":               "Invalid One-Time Type",
		"renewal_behavior":        "ONE_TIME",
		"default_validity_months": 12,
		"requires_document":       false,
		"active":                  true,
	}, http.StatusBadRequest))
	assertField(t, oneTimeWithDefaultValidity, "error", "default validity duration must be omitted for one-time compliance record types")

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

func TestHRAdminRenewalQueueUsesSchedulerEligibilityRules(t *testing.T) {
	h := setupIntegrationTest(t)
	dubai := time.FixedZone("UTC+4", 4*60*60)
	today := time.Now().In(dubai)
	dateAtOffset := func(days int) time.Time {
		return time.Date(today.Year(), today.Month(), today.Day()+days, 12, 0, 0, 0, dubai).UTC()
	}
	issueDate := dateAtOffset(-10)

	performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/hr-admin/notification-configuration", map[string]any{
		"email_recipients":      "",
		"clickup_list_id":       "",
		"clickup_assignee_ids":  "",
		"default_reminder_days": []int{30},
	}, http.StatusOK)

	defaultPolicyPersonID := createHRAdminPerson(t, h, "HRP-QUEUE-001", "Queue Default Policy")
	defaultPolicyTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":            "PERSON",
		"type_name":               "Queue Default Visa",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 12,
		"requires_document":       false,
		"active":                  true,
	})
	defaultPolicyRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "PERSON",
		"subject_id":     defaultPolicyPersonID,
		"record_type_id": defaultPolicyTypeID,
		"issue_date":     issueDate,
		"expiry_date":    dateAtOffset(30),
	})

	upcomingVehicleID := createHRAdminVehicle(t, h, "QUEUE-UPCOMING")
	vehicleTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":            "VEHICLE",
		"type_name":               "Queue Vehicle Registration",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 12,
		"reminder_policy_days":    []int{30},
		"requires_document":       false,
		"active":                  true,
	})
	upcomingRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "VEHICLE",
		"subject_id":     upcomingVehicleID,
		"record_type_id": vehicleTypeID,
		"issue_date":     issueDate,
		"expiry_date":    dateAtOffset(20),
	})

	okCompanyID := createHRAdminCompany(t, h, "HRC-QUEUE-OK", "Queue OK Company")
	companyTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":            "COMPANY",
		"type_name":               "Queue Company License",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 12,
		"reminder_policy_days":    []int{30},
		"requires_document":       false,
		"active":                  true,
	})
	okRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "COMPANY",
		"subject_id":     okCompanyID,
		"record_type_id": companyTypeID,
		"issue_date":     issueDate,
		"expiry_date":    dateAtOffset(120),
	})

	expiredPersonID := createHRAdminPerson(t, h, "HRP-QUEUE-EXP", "Queue Expired Person")
	expiredRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "PERSON",
		"subject_id":     expiredPersonID,
		"record_type_id": defaultPolicyTypeID,
		"issue_date":     issueDate,
		"expiry_date":    dateAtOffset(-2),
	})

	archivedVehicleID := createHRAdminVehicle(t, h, "QUEUE-ARCHIVED")
	archivedRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "VEHICLE",
		"subject_id":     archivedVehicleID,
		"record_type_id": vehicleTypeID,
		"issue_date":     issueDate,
		"expiry_date":    dateAtOffset(30),
	})
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/vehicles/"+archivedVehicleID+"/archive", map[string]any{
		"archive_reason": "Vehicle sold",
	}, http.StatusOK)

	queue := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/renewal-queue", nil, http.StatusOK))
	defaultPolicyItem := findByStringField(t, queue, "record_id", defaultPolicyRecordID)
	assertField(t, defaultPolicyItem, "queue_status", "DUE_NOW")
	assertField(t, defaultPolicyItem, "days_until_expiry", 30)
	assertField(t, defaultPolicyItem, "reminder_policy_source", "PRODUCT_DEFAULT")
	assertField(t, defaultPolicyItem, "effective_reminder_days", []any{float64(30)})

	upcomingItem := findByStringField(t, queue, "record_id", upcomingRecordID)
	assertField(t, upcomingItem, "queue_status", "UPCOMING")
	assertField(t, upcomingItem, "days_until_expiry", 20)
	assertField(t, upcomingItem, "reminder_policy_source", "RECORD_TYPE")

	okItem := findByStringField(t, queue, "record_id", okRecordID)
	assertField(t, okItem, "queue_status", "OK")
	assertField(t, okItem, "days_until_expiry", 120)

	expiredItem := findByStringField(t, queue, "record_id", expiredRecordID)
	assertField(t, expiredItem, "queue_status", "EXPIRED")
	assertField(t, expiredItem, "days_until_expiry", -2)

	for _, item := range queue {
		if item["record_id"] == archivedRecordID {
			t.Fatalf("archived subject records must not appear in renewal queue, got %v", item)
		}
	}
}

func TestHRAdminReminderSchedulerUsesPolicyAndSkipsArchivedSubjects(t *testing.T) {
	h := setupIntegrationTest(t)
	t.Setenv("CLICKUP_API_TOKEN", "")

	dubai := time.FixedZone("UTC+4", 4*60*60)
	today := time.Now().In(dubai)
	dateAtOffset := func(days int) time.Time {
		return time.Date(today.Year(), today.Month(), today.Day()+days, 12, 0, 0, 0, dubai).UTC()
	}
	issueDate := dateAtOffset(-10)
	expiry := dateAtOffset(30)
	expiryStr := expiry.In(dubai).Format("2006-01-02")
	soonExpiry := dateAtOffset(5)
	soonExpiryStr := soonExpiry.In(dubai).Format("2006-01-02")
	expiredExpiry := dateAtOffset(-2)
	expiredExpiryStr := expiredExpiry.In(dubai).Format("2006-01-02")
	outsideWindowExpiry := dateAtOffset(120)

	config := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPut, "/v1/hr-admin/notification-configuration", map[string]any{
		"email_recipients":      "",
		"clickup_list_id":       "",
		"clickup_assignee_ids":  "",
		"default_reminder_days": []int{30},
	}, http.StatusOK))
	assertField(t, config, "default_reminder_days", []any{float64(30)})

	activePersonID := createHRAdminPerson(t, h, "HRP-REM-001", "Reminder Active Person")
	activeTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":            "PERSON",
		"type_name":               "Default Policy License",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 12,
		"requires_document":       false,
		"active":                  true,
	})
	activeRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "PERSON",
		"subject_id":     activePersonID,
		"record_type_id": activeTypeID,
		"issue_date":     issueDate,
		"expiry_date":    expiry,
	})

	soonPersonID := createHRAdminPerson(t, h, "HRP-REM-SOON", "Reminder Soon Person")
	soonRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "PERSON",
		"subject_id":     soonPersonID,
		"record_type_id": activeTypeID,
		"issue_date":     issueDate,
		"expiry_date":    soonExpiry,
	})

	expiredPersonID := createHRAdminPerson(t, h, "HRP-REM-EXP", "Reminder Expired Person")
	expiredRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "PERSON",
		"subject_id":     expiredPersonID,
		"record_type_id": activeTypeID,
		"issue_date":     issueDate,
		"expiry_date":    expiredExpiry,
	})

	immediateFailuresResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/scheduler/notification-failures?page=1&limit=20", nil, http.StatusOK))
	immediateFailures := dataArray(t, immediateFailuresResponse)
	soonFailure := findByStringField(t, immediateFailures, "idempotency_key", "hr-admin-compliance-expiry:"+soonRecordID+":"+soonExpiryStr+":30d:EMAIL")
	assertField(t, soonFailure, "tier", "30d")
	expiredFailure := findByStringField(t, immediateFailures, "idempotency_key", "hr-admin-compliance-expiry:"+expiredRecordID+":"+expiredExpiryStr+":expired:EMAIL")
	assertField(t, expiredFailure, "tier", "expired")

	archivedVehicleID := createHRAdminVehicle(t, h, "REM-ARCH-VEH")
	vehicleTypeID := createComplianceRecordType(t, h, map[string]any{
		"subject_type":            "VEHICLE",
		"type_name":               "Archived Vehicle Registration",
		"renewal_behavior":        "RENEWABLE",
		"default_validity_months": 12,
		"reminder_policy_days":    []int{30},
		"requires_document":       false,
		"active":                  true,
	})
	archivedVehicleRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "VEHICLE",
		"subject_id":     archivedVehicleID,
		"record_type_id": vehicleTypeID,
		"issue_date":     issueDate,
		"expiry_date":    outsideWindowExpiry,
	})
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/vehicles/"+archivedVehicleID+"/archive", map[string]any{
		"archive_reason": "Vehicle sold",
	}, http.StatusOK)

	archivedRecordPersonID := createHRAdminPerson(t, h, "HRP-REM-002", "Archived Record Person")
	archivedRecordID := createComplianceRecord(t, h, map[string]any{
		"subject_type":   "PERSON",
		"subject_id":     archivedRecordPersonID,
		"record_type_id": activeTypeID,
		"issue_date":     issueDate,
		"expiry_date":    outsideWindowExpiry,
	})
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/compliance-records/"+archivedRecordID+"/archive", map[string]any{
		"archive_reason": "No longer company responsibility",
	}, http.StatusOK)

	run := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/scheduler/run", nil, http.StatusOK))
	assertField(t, run, "message", "HR/Admin reminder scheduler run completed")
	assertField(t, run, "processed_records", 3)

	tasksResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/scheduler/notification-tasks?page=1&limit=20", nil, http.StatusOK))
	if got := paginatedCount(t, tasksResponse); got < 6 {
		t.Fatalf("expected HR/Admin scheduler task audit to include immediate reminder attempts, got %d", got)
	}

	failuresResponse := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/scheduler/notification-failures?page=1&limit=20", nil, http.StatusOK))
	failures := dataArray(t, failuresResponse)
	emailFailure := findByStringField(t, failures, "idempotency_key", "hr-admin-compliance-expiry:"+activeRecordID+":"+expiryStr+":30d:EMAIL")
	assertField(t, emailFailure, "source_type", "hr_admin_compliance_expiry")
	assertField(t, emailFailure, "source_id", activeRecordID)
	assertField(t, emailFailure, "source_name", "Default Policy License - Reminder Active Person")
	assertField(t, emailFailure, "channel", "EMAIL")
	assertField(t, emailFailure, "tier", "30d")
	assertField(t, emailFailure, "error_message", "HR/Admin email recipients not configured")

	clickUpFailure := findByStringField(t, failures, "idempotency_key", "hr-admin-compliance-expiry:"+activeRecordID+":"+expiryStr+":30d:CLICKUP")
	assertField(t, clickUpFailure, "channel", "CLICKUP")
	assertField(t, clickUpFailure, "error_message", "CLICKUP_API_TOKEN or HR/Admin ClickUp list ID not set")

	for _, failure := range failures {
		if failure["source_id"] == archivedVehicleRecordID || failure["source_id"] == archivedRecordID {
			t.Fatalf("archived HR/Admin records must not create reminders, got %v", failure)
		}
	}

	initialFailureCount := paginatedCount(t, failuresResponse)
	secondRun := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/scheduler/run", nil, http.StatusOK))
	assertField(t, secondRun, "processed_records", 3)
	afterSecondRun := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/scheduler/notification-failures?page=1&limit=20", nil, http.StatusOK))
	if got := paginatedCount(t, afterSecondRun); got != initialFailureCount {
		t.Fatalf("expected idempotent HR/Admin scheduler rerun to keep %d failures, got %d", initialFailureCount, got)
	}
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
