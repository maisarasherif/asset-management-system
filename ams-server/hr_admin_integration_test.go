package main_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestHRAdminProductAccessAndComplianceRecordVersionFlow(t *testing.T) {
	h := setupIntegrationTest(t)

	hrViewerToken := createIntegrationUserToken(t, h.pool, "HR", "Viewer", "hr-viewer@example.com", "viewer-password", "USER")
	hrViewer := mustGetIntegrationUserByEmail(t, h.pool, "hr-viewer@example.com")

	performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/hr-admin/overview", nil, http.StatusForbidden)
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

	performJSONRequest(t, h.router, hrViewerToken, http.MethodGet, "/v1/hr-admin/overview", nil, http.StatusOK)
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

	departments := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/departments", nil, http.StatusOK))
	findByStringField(t, departments, "department_name", "HR & Administration")
	findByStringField(t, departments, "department_name", "Operations")

	invalidDepartment := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, "/v1/hr-admin/persons", map[string]any{
		"person_code": "HRP-INVALID-DEPT",
		"full_name":   "Invalid Department Person",
		"department":  "Administration",
		"role_title":  "Technician",
	}, http.StatusBadRequest))
	assertField(t, invalidDepartment, "error", "department must be selected from HR/Admin departments")

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
		"department":  "HR & Administration",
		"role_title":  "Coordinator",
	}, http.StatusCreated))
	personID := stringField(t, person, "person_id")
	assertUUID(t, personID)

	updatedPerson := decodeObject(t, performJSONRequest(t, h.router, hrUserToken, http.MethodPut, "/v1/hr-admin/persons/"+personID, map[string]any{
		"person_code": "HRP-ROLE-USER",
		"full_name":   "HR Product User Updated",
		"department":  "HR & Administration",
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
	companyRecordID := createComplianceRecord(t, h, map[string]any{
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

	// Preserve coverage for a legacy archived subject with an active linked record.
	if _, err := h.pool.Exec(context.Background(), "UPDATE hr_admin_persons SET status = 'ARCHIVED' WHERE person_id = $1", personID); err != nil {
		t.Fatal(err)
	}
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

	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/compliance-records/"+companyRecordID+"/archive",
		map[string]any{"archive_reason": "Company no longer used"}, http.StatusOK)
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

func TestHRAdminPermanentDeletionAndArchiveGuards(t *testing.T) {
	h := setupIntegrationTest(t)
	const root = "/v1/hr-admin/"
	const deletionReason = "Remove duplicate test entry"
	reason := map[string]any{"reason": deletionReason}
	archive := map[string]any{"archive_reason": "Retired from use"}
	user := createIntegrationUserToken(t, h.pool, "HR", "Writer", "delete-writer@example.com", "writer-password", "USER")
	writer := mustGetIntegrationUserByEmail(t, h.pool, "delete-writer@example.com")
	grantHRAdminProductAccess(t, h, writer.UserID.String(), "USER")
	for _, subject := range []struct{ kind, path, id string }{
		{"PERSON", "persons", createHRAdminPerson(t, h, "DELETE-PERSON", "Deletion Person")},
		{"VEHICLE", "vehicles", createHRAdminVehicle(t, h, "DELETE-VEHICLE")},
		{"COMPANY", "companies", createHRAdminCompany(t, h, "DELETE-COMPANY", "Deletion Company")},
	} {
		subjectPath := root + subject.path + "/" + subject.id
		typeID := createComplianceRecordType(t, h, map[string]any{
			"subject_type": subject.kind, "type_name": "Deletion evidence", "renewal_behavior": "RENEWABLE", "active": true,
		})
		record := createComplianceRecord(t, h, map[string]any{
			"subject_type": subject.kind, "subject_id": subject.id, "record_type_id": typeID,
			"expiry_date": "2098-01-01T00:00:00Z", "document_file": "certificate-files/unknown-legacy-owner.pdf",
		})
		recordPath := root + "compliance-records/" + record
		performJSONRequest(t, h.router, h.adminToken, http.MethodPost, recordPath+"/versions", map[string]any{
			"expiry_date": "2099-01-01T00:00:00Z", "document_file": "certificate-files/unknown-legacy-owner.pdf",
		}, http.StatusCreated)
		performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, subjectPath, reason, http.StatusConflict)
		performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, recordPath, reason, http.StatusConflict)
		blockedArchive := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, subjectPath+"/archive", archive, http.StatusConflict))
		assertField(t, blockedArchive, "linked_record_count", 1)
		performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, recordPath+"/archive", archive, http.StatusOK)
		performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, subjectPath+"/archive", archive, http.StatusOK)
		blockedDelete := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, subjectPath, reason, http.StatusConflict))
		assertField(t, blockedDelete, "linked_record_count", 1)
		performJSONRequest(t, h.router, user, http.MethodDelete, subjectPath, reason, http.StatusForbidden)
		performJSONRequest(t, h.router, user, http.MethodDelete, recordPath, reason, http.StatusForbidden)
		performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, recordPath, map[string]any{"reason": "   "}, http.StatusBadRequest)
		deleted := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, recordPath, reason, http.StatusOK))
		assertField(t, deleted, "queued_document_count", 0)
		assertField(t, deleted, "retained_legacy_document_count", 1)
		if versions := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, recordPath+"/versions", nil, http.StatusOK)); len(versions) != 0 {
			t.Fatal("deleted record versions remain")
		}
		performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, subjectPath, reason, http.StatusOK)
		performJSONRequest(t, h.router, h.adminToken, http.MethodDelete, subjectPath, reason, http.StatusNotFound)
	}
	var count int
	err := h.pool.QueryRow(context.Background(), "SELECT count(*) FROM hr_admin_deletion_audit WHERE reason = $1 AND deleted_by IS NOT NULL AND display_id <> ''", deletionReason).Scan(&count)
	if err != nil || count != 6 {
		t.Fatalf("expected six audited deletions, got %d: %v", count, err)
	}
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
	// Archived subjects from before the lifecycle guard still exist in production.
	if _, err := h.pool.Exec(context.Background(), "UPDATE hr_admin_vehicles SET status = 'ARCHIVED' WHERE vehicle_id = $1", archivedVehicleID); err != nil {
		t.Fatal(err)
	}

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
	// Archived subjects from before the lifecycle guard still exist in production.
	if _, err := h.pool.Exec(context.Background(), "UPDATE hr_admin_vehicles SET status = 'ARCHIVED' WHERE vehicle_id = $1", archivedVehicleID); err != nil {
		t.Fatal(err)
	}

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
		"department":  "HR & Administration",
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

func TestHRAdminListSearchAndFacetsBeforePagination(t *testing.T) {
	h := setupIntegrationTest(t)
	get := func(path string, want int) map[string]any {
		return decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/"+path, nil, want))
	}
	vehicle := createHRAdminVehicle(t, h, "LIMIT-TARGET")
	_, err := h.pool.Exec(context.Background(), `
		UPDATE hr_admin_vehicles SET make = 'Search Make', updated_at = '2000-01-01' WHERE plate_number = 'LIMIT-TARGET';
		INSERT INTO hr_admin_vehicles (plate_number)
		SELECT 'LIMIT-FILLER-' || n FROM generate_series(1, 105) AS n;
	`)
	if err != nil {
		t.Fatal(err)
	}
	page := get("vehicles?limit=100", http.StatusOK)
	assertField(t, page["meta"].(map[string]any), "total", 106)
	for _, item := range page["data"].([]any) {
		if item.(map[string]any)["vehicle_id"] == vehicle {
			t.Fatal("test fixture must place the match after the unfiltered first 100 rows")
		}
	}

	found := get("vehicles?limit=1&search=target&make=search%20make&status=ACTIVE", http.StatusOK)
	assertField(t, found["meta"].(map[string]any), "total", 1)
	assertField(t, found["data"].([]any)[0].(map[string]any), "vehicle_id", vehicle)
	empty := get("vehicles?search=target&status=ARCHIVED", http.StatusOK)
	assertField(t, empty["meta"].(map[string]any), "total", 0)
	get("vehicles?status=INVALID", http.StatusBadRequest)

	recordType := createComplianceRecordType(t, h, map[string]any{
		"subject_type": "VEHICLE", "type_name": "Searchable registration", "renewal_behavior": "RENEWABLE", "active": true,
	})
	createComplianceRecordType(t, h, map[string]any{
		"subject_type": "PERSON", "type_name": "Searchable permit", "renewal_behavior": "RENEWABLE", "active": true,
	})
	typePage := get("compliance-record-types?subject_type=VEHICLE&status=ACTIVE&search=Searchable&limit=1", http.StatusOK)
	assertField(t, typePage["meta"].(map[string]any), "total", 1)
	assertField(t, typePage["data"].([]any)[0].(map[string]any), "record_type_id", recordType)

	record := createComplianceRecord(t, h, map[string]any{
		"subject_type": "VEHICLE", "subject_id": vehicle, "record_type_id": recordType,
		"expiry_date": "2001-11-18T22:30:00Z",
	})
	records := get("compliance-records?subject_type=VEHICLE&status=ACTIVE&expiry_status=EXPIRED&limit=1&record_type_id="+recordType, http.StatusOK)
	assertField(t, records["meta"].(map[string]any), "total", 1)
	assertField(t, records["data"].([]any)[0].(map[string]any), "record_id", record)
}

func TestHRAdminOverviewExpiryBoundaryAndDirectory(t *testing.T) {
	h := setupIntegrationTest(t)
	// This legacy instant's document date is 19 November in Dubai.
	const expiry = "2026-11-18T22:30:00Z"
	for _, test := range []struct {
		now  string
		days int
	}{
		{"2026-11-19T19:59:59.999999Z", 0}, {"2026-11-19T20:00:00Z", -1},
	} {
		var days int
		err := h.pool.QueryRow(context.Background(), "SELECT hr_admin_days_until_expiry($1::text::timestamptz, $2::text::timestamptz)", expiry, test.now).Scan(&days)
		if err != nil || days != test.days {
			t.Fatalf("days at %s: got %d, want %d, err %v", test.now, days, test.days, err)
		}
	}
	get := func(path string) map[string]any {
		return decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/"+path, nil, http.StatusOK))
	}
	group := func(kind string) map[string]any {
		groups := get("overview")["groups"].([]any)
		if len(groups) != 3 {
			t.Fatalf("expected three groups, got %v", groups)
		}
		for _, raw := range groups {
			row := raw.(map[string]any)
			if row["subject_type"] == kind {
				return row
			}
		}
		t.Fatalf("missing group %s", kind)
		return nil
	}
	active := createHRAdminVehicle(t, h, "DB-FLEET-01")
	archived := createHRAdminVehicle(t, h, "DB-FLEET-02")
	createHRAdminVehicle(t, h, "OTHER-03")
	kind := createComplianceRecordType(t, h, map[string]any{"subject_type": "VEHICLE", "type_name": "Fleet registration", "renewal_behavior": "RENEWABLE", "active": true})
	add := func(id string) string {
		return createComplianceRecord(t, h, map[string]any{"subject_type": "VEHICLE", "subject_id": id, "record_type_id": kind,
			"issue_date": "2000-01-01T00:00:00Z", "expiry_date": "2001-11-18T22:30:00Z", "document_file": "registry/original.pdf"})
	}
	record := add(active)
	archivedRecord := add(archived)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/compliance-records/"+archivedRecord+"/archive",
		map[string]any{"archive_reason": "Retired from fleet"}, http.StatusOK)
	performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/vehicles/"+archived+"/archive", map[string]any{"archive_reason": "Retired from fleet"}, http.StatusOK)
	assertField(t, group("VEHICLE"), "subject_count", 3)
	assertField(t, group("VEHICLE"), "expired_count", 1)
	for _, kind := range []string{"PERSON", "COMPANY"} {
		empty := group(kind)
		for _, field := range []string{"subject_count", "valid_count", "expiring_soon_count", "expired_count"} {
			assertField(t, empty, field, 0)
		}
	}
	nowInDubai := time.Now().UTC().Add(4 * time.Hour)
	documentDate := time.Date(nowInDubai.Year(), nowInDubai.Month(), nowInDubai.Day(), 0, 0, 0, 0, time.UTC)
	person := createHRAdminPerson(t, h, "DB-30", "Expiring person")
	company := createHRAdminCompany(t, h, "DB-31", "Valid company")
	for _, test := range []struct {
		subjectType, subjectID, name, behavior string
		days                                   int
		archive                                bool
	}{
		{"PERSON", person, "Expires today", "RENEWABLE", 0, false},
		{"PERSON", person, "Expires in 30 days", "RENEWABLE", 30, false},
		{"PERSON", person, "Archived person record", "RENEWABLE", -1, true},
		{"COMPANY", company, "Expires in 31 days", "RENEWABLE", 31, false},
		{"COMPANY", company, "One-time evidence", "ONE_TIME", -1, false},
	} {
		typeID := createComplianceRecordType(t, h, map[string]any{
			"subject_type": test.subjectType, "type_name": test.name, "renewal_behavior": test.behavior, "active": true,
		})
		id := createComplianceRecord(t, h, map[string]any{
			"subject_type": test.subjectType, "subject_id": test.subjectID, "record_type_id": typeID,
			"expiry_date": documentDate.AddDate(0, 0, test.days).Format(time.RFC3339),
		})
		if test.archive {
			performJSONRequest(t, h.router, h.adminToken, http.MethodPatch, "/v1/hr-admin/compliance-records/"+id+"/archive",
				map[string]any{"archive_reason": "Superseded evidence"}, http.StatusOK)
		}
	}
	personCounts := group("PERSON")
	assertField(t, personCounts, "valid_count", 0)
	assertField(t, personCounts, "expiring_soon_count", 2)
	assertField(t, personCounts, "expired_count", 0)
	companyCounts := group("COMPANY")
	assertField(t, companyCounts, "valid_count", 1)
	assertField(t, companyCounts, "expiring_soon_count", 0)
	assertField(t, companyCounts, "expired_count", 0)
	first := get("vehicles?search=db-fleet&limit=1&page=1")
	second := get("vehicles?search=db-fleet&limit=1&page=2")
	assertField(t, first["meta"].(map[string]any), "total", 2)
	if first["data"].([]any)[0].(map[string]any)["vehicle_id"] == second["data"].([]any)[0].(map[string]any)["vehicle_id"] {
		t.Fatal("duplicate subject across pages")
	}
	assertField(t, get("vehicles")["meta"].(map[string]any), "total", 3)
	records := "compliance-records?subject_type=VEHICLE&subject_id=" + active
	rows := get(records)
	assertField(t, rows["meta"].(map[string]any), "total", 1)
	row := rows["data"].([]any)[0].(map[string]any)
	assertField(t, row, "record_id", record)
	assertField(t, row, "expiry_status", "EXPIRED")
	if !strings.HasSuffix(stringField(t, row, "created_at"), "Z") {
		t.Fatal("expected UTC event timestamp")
	}
	for _, query := range []string{"subject_type=", "subject_id=", "subject_id=" + active, "subject_type=OTHER&subject_id=" + active, "subject_type=PERSON&subject_id=invalid"} {
		performJSONRequest(t, h.router, h.adminToken, http.MethodGet, "/v1/hr-admin/compliance-records?"+query, nil, http.StatusBadRequest)
	}
	assertField(t, get("compliance-records?subject_type=PERSON&subject_id=" + active)["meta"].(map[string]any), "total", 0)
	versions := "/v1/hr-admin/compliance-records/" + record + "/versions"
	performJSONRequest(t, h.router, h.adminToken, http.MethodPost, versions, map[string]any{
		"issue_date": "2026-11-18T21:30:00Z", "expiry_date": "2026-11-19T10:00:00Z",
	}, http.StatusBadRequest)
	for _, version := range []struct {
		expiry, document string
		number           int
	}{
		{"2098-01-01T00:00:00Z", "registry/original.pdf", 2},
		{"2099-01-01T00:00:00Z", "registry/replacement.pdf", 3},
	} {
		saved := decodeObject(t, performJSONRequest(t, h.router, h.adminToken, http.MethodPost, versions, map[string]any{
			"issue_date": "2090-01-01T00:00:00Z", "expiry_date": version.expiry, "document_file": version.document,
		}, http.StatusCreated))
		assertField(t, saved, "version_number", version.number)
		assertField(t, saved, "document_file", version.document)
		counts := group("VEHICLE")
		assertField(t, counts, "expired_count", 0)
		assertField(t, counts, "valid_count", 1)
		assertField(t, get(records)["data"].([]any)[0].(map[string]any), "expiry_status", "OK")
	}
	history := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, http.MethodGet, versions, nil, http.StatusOK))
	if len(history) != 3 {
		t.Fatalf("incomplete history: %v", history)
	}
	for i, v := range history {
		assertField(t, v, "is_current", i == 0)
	}
}
