package main_test

import (
	"fmt"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func TestAMSOverviewWorkOrderFilters(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)
	componentID, testID := createComponentFixture(t, h, "Overview winch")
	get := func(path string) map[string]any {
		return maintenanceJSON(t, h, h.adminToken, http.MethodGet, path, nil, http.StatusOK)
	}
	assetID := stringField(t, get("/v1/component/"+componentID), "asset_id")
	today := time.Now()

	for _, fixture := range []struct {
		days int
		name string
	}{
		{-1, "Expired certificate"},
		{30, "Inspection at thirty days"},
	} {
		payload := certificatePayload(componentID, testID, fixture.days)
		payload["certificate_name"] = fixture.name
		payload["issue_date"] = utils.DubaiDocumentDate(today.AddDate(0, 0, -90)) + "T00:00:00Z"
		payload["expiry_date"] = utils.DubaiDocumentDate(today.AddDate(0, 0, fixture.days)) + "T00:00:00Z"
		createCertificate(t, h, payload)
	}

	for _, fixture := range []struct {
		name, dueDate, status string
		dueHours              *int64
	}{
		{name: "Overdue maintenance", dueDate: utils.DubaiDocumentDate(today.AddDate(0, 0, -2)), status: "IN_PROGRESS"},
		{name: "Due today", dueDate: utils.DubaiDocumentDate(today), status: "OPEN"},
		{name: "Beyond the window", dueDate: utils.DubaiDocumentDate(today.AddDate(0, 0, 31)), status: "OPEN"},
		{name: "Closed maintenance", dueDate: utils.DubaiDocumentDate(today), status: "COMPLETED"},
		{name: "Meter service", status: "OPEN", dueHours: new(int64)},
		{name: "Undated repair", status: "OPEN"},
	} {
		_, err := h.pool.Exec(t.Context(), `
			INSERT INTO maintenance_work_orders (display_id, asset_id, title, due_date, status, due_hours)
			VALUES (allocate_display_id('maintenance_work_orders.display_id', 'maintenance_work_orders'::regclass),
			        $1, $2, NULLIF($3::text, '')::date, $4, $5)`,
			assetID, fixture.name, fixture.dueDate, fixture.status, fixture.dueHours)
		if err != nil {
			t.Fatal(err)
		}
	}

	register := maintenanceAPI + "/work-orders?asset_id=" + assetID + "&open_only=true"
	for _, check := range []struct {
		name, query  string
		total, pages int
		titles       []string
	}{
		{"All page one", "&limit=5", 7, 2, []string{"Overdue maintenance", "Expired certificate", "Due today", "Inspection at thirty days", "Beyond the window"}},
		{"All page two", "&limit=5&page=2", 7, 2, []string{"Meter service", "Undated repair"}},
		{"Overdue page one", "&due_window=OVERDUE&limit=1", 2, 2, []string{"Overdue maintenance"}},
		{"Overdue page two", "&due_window=OVERDUE&limit=1&page=2", 2, 2, []string{"Expired certificate"}},
		{"Due soon page one", "&due_window=DUE_SOON&limit=1", 2, 2, []string{"Due today"}},
		{"Due soon page two", "&due_window=DUE_SOON&limit=1&page=2", 2, 2, []string{"Inspection at thirty days"}},
		{"Maintenance only", "&type=MAINTENANCE&limit=5", 5, 1, []string{"Overdue maintenance", "Due today", "Beyond the window", "Meter service", "Undated repair"}},
	} {
		t.Run(check.name, func(t *testing.T) {
			list := maintenanceJSON(t, h, h.adminToken, http.MethodGet, register+check.query, nil, http.StatusOK)
			meta := objectField(t, list, "meta")
			assertField(t, meta, "total", check.total)
			assertField(t, meta, "total_pages", check.pages)
			var titles []string
			for _, row := range dataArray(t, list) {
				title := stringField(t, row, "title")
				titles = append(titles, title)
				switch title {
				case "Expired certificate":
					assertField(t, row, "component_name", "Overview winch")
					assertField(t, row, "due_date", utils.DubaiDocumentDate(today.AddDate(0, 0, -1)))
				case "Meter service":
					assertField(t, row, "asset_name", "Overview winch Asset")
					assertField(t, row, "due_hours", 0)
				case "Undated repair":
					assertField(t, row, "due_hours", nil)
					assertField(t, row, "due_date", nil)
				}
			}
			slices.Sort(titles)
			slices.Sort(check.titles)
			if !slices.Equal(titles, check.titles) {
				t.Fatalf("got %v, want %v", titles, check.titles)
			}
		})
	}
	maintenanceJSON(t, h, h.adminToken, http.MethodGet, register+"&due_window=OTHER", nil, http.StatusBadRequest)
}

func TestAMSOverviewNextServiceAndQuarantine(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)
	componentID, _ := createComponentFixture(t, h, "Overview valve")
	assetID := stringField(t, maintenanceJSON(t, h, h.adminToken, "GET", "/v1/component/"+componentID, nil, 200), "asset_id")
	call := func(method, path string, body any, status int) map[string]any {
		return maintenanceJSON(t, h, h.adminToken, method, maintenanceAPI+path, body, status)
	}
	for _, fixture := range []struct {
		title  string
		hours  int
		date   string
		active bool
	}{
		{"Alphabetical first", 700, "2099-03-01", true},
		{"Meter first", 400, "2099-04-01", true},
		{"Calendar first", 0, "2099-02-01", true},
		{"Hours only", 500, "", true},
		{"Inactive", 100, "2099-01-01", false},
	} {
		body := map[string]any{"asset_id": assetID, "title": fixture.title, "active": fixture.active}
		if fixture.hours > 0 {
			body["interval_hours"], body["next_due_hours"] = 100, fixture.hours
		}
		if fixture.date != "" {
			body["interval_months"], body["next_due_date"] = 3, fixture.date
		}
		call("POST", "/plans", body, 201)
	}

	for _, check := range []struct{ order, title string }{
		{"next_due_hours", "Meter first"},
		{"next_due_date", "Calendar first"},
	} {
		path := fmt.Sprintf("/plans?asset_id=%s&active_only=true&order_by=%s&limit=1", assetID, check.order)
		list := call("GET", path, nil, 200)
		assertField(t, objectField(t, list, "meta"), "total", 4)
		plans := dataArray(t, list)
		if len(plans) != 1 {
			t.Fatalf("expected one plan sorted by %s, got %v", check.order, plans)
		}
		assertField(t, plans[0], "title", check.title)
	}

	assetPath := "/v1/asset/" + assetID
	const photo = "https://example.com/overview-asset.png"
	maintenanceJSON(t, h, h.adminToken, http.MethodPatch, assetPath, map[string]any{"photo": photo}, http.StatusOK)
	maintenanceJSON(t, h, h.adminToken, http.MethodPatch, assetPath+"/working-hours", map[string]any{"working_hours": 40}, http.StatusOK)
	asset := maintenanceJSON(t, h, h.adminToken, http.MethodGet, assetPath, nil, http.StatusOK)
	assertField(t, asset, "photo", photo)
	assertField(t, asset, "working_hours", 40)

	previous := call("POST", "/quarantine", map[string]any{"asset_id": assetID, "reason": "Released hold"}, 201)
	call("POST", "/quarantine/"+stringField(t, previous, "quarantine_id")+"/release", map[string]any{"notes": "Cleared"}, 200)
	call("POST", "/quarantine", map[string]any{"asset_id": assetID, "reason": "Whole asset held"}, 201)
	call("POST", "/quarantine", map[string]any{"asset_id": assetID, "component_id": componentID, "reason": "Component held"}, 201)

	tags := call("GET", "/quarantine?asset_id="+assetID+"&whole_asset_only=true&limit=1", nil, 200)
	assertField(t, objectField(t, tags, "meta"), "total", 1)
	rows := dataArray(t, tags)
	if len(rows) != 1 {
		t.Fatalf("expected one active whole-asset quarantine, got %v", rows)
	}
	assertField(t, rows[0], "component_id", nil)
	assertField(t, rows[0], "reason", "Whole asset held")
}
