package main_test

import (
	"bytes"
	"context"
	"encoding/json"

	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/maisarasherif/asset-management-system/ams-server/maintenance"
)

const maintenanceAPI = "/v1/maintenance"

func maintenanceJSON(t *testing.T, h *integrationHarness, token, method, path string, body any, want int) map[string]any {
	t.Helper()
	return decodeObject(t, performJSONRequest(t, h.router, token, method, path, body, want))
}

func TestMaintenanceRoutinePlansAndQuarantine(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)
	staff := createIntegrationUserToken(t, h.pool, "Test", "Technician", "maintenance-staff@example.test", "staff-password", "USER")
	client := createIntegrationUserToken(t, h.pool, "Test", "Client", "maintenance-client@example.test", "client-password", "CLIENT")
	asset := createAsset(t, h, map[string]any{"name": "Compressor", "status": "ACTIVE"})
	id := stringField(t, asset, "asset_id")
	apiAsset := "/v1/asset/" + id
	request := func(method, path string, payload any, want int) map[string]any {
		return maintenanceJSON(t, h, h.adminToken, method, path, payload, want)
	}
	planBody := map[string]any{"asset_id": id, "title": "Oil and filter service", "interval_hours": 100, "interval_months": 12,
		"next_due_date": "2099-01-31", "quarantine_when_due": true, "active": true}
	plan := request("POST", maintenanceAPI+"/plans", planBody, 201)
	planID := stringField(t, plan, "plan_id")
	assertField(t, plan, "next_due_hours", 100)
	datePlan := request("POST", maintenanceAPI+"/plans", map[string]any{
		"asset_id": id, "title": "Calendar inspection", "interval_months": 6, "next_due_date": "2000-01-31", "active": true,
	}, 201)
	assertField(t, request("GET", apiAsset, nil, 200), "quarantined", false)
	maintenanceJSON(t, h, staff, "POST", maintenanceAPI+"/plans", planBody, 403)
	maintenanceJSON(t, h, client, "GET", maintenanceAPI+"/work-orders", nil, 403)
	ensureIntegrationProject(t, h, "Maintenance Project")
	fault := maintenanceJSON(t, h, staff, "POST", maintenanceAPI+"/work-orders", map[string]any{
		"asset_id": id, "title": "Air leak", "description": "Leak at supply hose", "quarantine": true,
	}, 201)
	faultID := stringField(t, fault, "work_order_id")

	results := make(chan int, 2)
	go func() {
		results <- maintenanceStatus(h, staff, "PATCH", apiAsset+"/working-hours", map[string]any{"working_hours": 125})
	}()
	go func() { results <- maintenanceStatus(h, h.adminToken, "POST", maintenanceAPI+"/scan", nil) }()
	for range 2 {
		if got := <-results; got != 200 {
			t.Fatalf("concurrent scan or reading returned %d", got)
		}
	}
	orderList := request("GET", maintenanceAPI+"/work-orders?asset_id="+id+"&type=ROUTINE", nil, 200)
	assertField(t, objectField(t, orderList, "meta"), "total", 2)
	var routineID string
	for _, row := range dataArray(t, orderList) {
		if row["plan_id"] == planID {
			routineID = stringField(t, row, "work_order_id")
			assertField(t, row, "due_hours", 100)
		}
	}
	if routineID == "" {
		t.Fatal("hour-based work order missing")
	}
	jobs := request("GET", "/v1/scheduler/certificate-notifications?source_type=routine_maintenance", nil, 200)
	assertField(t, objectField(t, jobs, "meta"), "total", 4)
	findByStringField(t, dataArray(t, jobs), "source_id", routineID)
	request("POST", maintenanceAPI+"/scan", nil, 200)
	request("PATCH", apiAsset, map[string]any{"assigned_project": "Maintenance Project"}, 409)
	request("PUT", apiAsset, map[string]any{"name": "Compressor", "status": "ACTIVE", "assigned_project": "Maintenance Project"}, 409)
	request("PATCH", apiAsset, map[string]any{"status": "MAINTENANCE"}, 400)

	holds := dataArray(t, request("GET", maintenanceAPI+"/quarantine?asset_id="+id, nil, 200))
	if len(holds) != 1 {
		t.Fatalf("expected one active hold, got %d", len(holds))
	}
	holdID := stringField(t, holds[0], "quarantine_id")
	assertField(t, holds[0], "blocking_orders", 2)
	release := maintenanceAPI + "/quarantine/" + holdID + "/release"
	maintenanceJSON(t, h, staff, "POST", release, map[string]any{"notes": "Checked"}, 403)
	request("POST", release, map[string]any{"notes": "Checked"}, 409)
	maintenanceJSON(t, h, staff, "POST", maintenanceAPI+"/work-orders/"+faultID+"/start", nil, 200)
	maintenanceJSON(t, h, staff, "POST", maintenanceAPI+"/work-orders/"+faultID+"/complete", map[string]any{"notes": "Replaced hose"}, 200)
	request("POST", release, map[string]any{"notes": "Checked"}, 409)
	maintenanceJSON(t, h, staff, "POST", maintenanceAPI+"/work-orders/"+routineID+"/complete", map[string]any{"notes": "Changed oil and filters"}, 200)
	assertField(t, request("GET", apiAsset, nil, 200), "quarantined", true)
	plans := dataArray(t, request("GET", maintenanceAPI+"/plans?asset_id="+id, nil, 200))
	assertField(t, findByStringField(t, plans, "plan_id", planID), "next_due_hours", 225)
	assertField(t, findByStringField(t, plans, "plan_id", datePlan["plan_id"].(string)), "next_due_date", "2000-01-31")
	request("POST", release, map[string]any{"notes": "Checked"}, 200)
	assertField(t, request("GET", apiAsset, nil, 200), "quarantined", false)
	request("PATCH", apiAsset, map[string]any{"assigned_project": "Maintenance Project"}, 200)
	request("DELETE", apiAsset, nil, 409)
	performJSONRequest(t, h.router, h.adminToken, "GET", apiAsset+"/routine-maintenance", nil, 404)
}

func TestMaintenanceComponentAvailability(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)
	childID, _ := createComponentFixture(t, h, "Control valve")
	childPath := "/v1/component/" + childID
	request := func(method, path string, payload any, want int) map[string]any {
		return maintenanceJSON(t, h, h.adminToken, method, path, payload, want)
	}
	component := request("GET", childPath, nil, 200)
	assetID := stringField(t, component, "asset_id")
	assetPath := "/v1/asset/" + assetID
	ensureIntegrationProject(t, h, "New Deployment")
	childHold := request("POST", maintenanceAPI+"/quarantine", map[string]any{"asset_id": assetID, "component_id": childID, "reason": "Leak"}, 201)
	assertField(t, request("GET", assetPath, nil, 200), "quarantined", false)
	assertField(t, request("GET", childPath, nil, 200), "quarantined", true)
	request("PATCH", childPath, map[string]any{"assigned_project": "New Deployment"}, 409)
	request("PATCH", assetPath, map[string]any{"assigned_project": "New Deployment"}, 200)
	parentHold := request("POST", maintenanceAPI+"/quarantine", map[string]any{"asset_id": assetID, "reason": "Workshop inspection"}, 201)
	request("PATCH", assetPath, map[string]any{"assigned_project": ""}, 200)
	assertField(t, request("GET", assetPath, nil, 200), "quarantined", true)
	request("POST", maintenanceAPI+"/quarantine/"+stringField(t, parentHold, "quarantine_id")+"/release", map[string]any{"notes": "Inspection complete"}, 200)
	assertField(t, request("GET", assetPath, nil, 200), "quarantined", false)
	assertField(t, request("GET", childPath, nil, 200), "quarantined", true)
	request("POST", maintenanceAPI+"/quarantine/"+stringField(t, childHold, "quarantine_id")+"/release", map[string]any{"notes": "Pressure test passed"}, 200)
	assertField(t, request("GET", childPath, nil, 200), "quarantined", false)
	request("DELETE", childPath, nil, 409)
}

func TestMaintenanceInventoryTransactions(t *testing.T) {
	h := setupIntegrationTest(t)
	staff := createIntegrationUserToken(t, h.pool, "Stock", "Technician", "stock-tech@example.test", "staff-password", "USER")
	request := func(method, path string, payload any, want int) map[string]any {
		return maintenanceJSON(t, h, h.adminToken, method, path, payload, want)
	}
	warehouse := decodeArray(t, performJSONRequest(t, h.router, h.adminToken, "GET", maintenanceAPI+"/stores", nil, 200))[0]
	warehouseID := stringField(t, warehouse, "store_id")
	sites := make([]string, 0, 2)
	for _, name := range []string{"Inventory Site A", "Inventory Site B"} {
		project := request("POST", "/v1/project", map[string]any{"project_name": name + uuid.NewString(), "status": "ACTIVE"}, 201)
		store := request("POST", maintenanceAPI+"/stores", map[string]any{"project_id": project["project_id"]}, 201)
		sites = append(sites, stringField(t, store, "store_id"))
	}
	part := request("POST", maintenanceAPI+"/parts", map[string]any{"part_number": "FLT-01", "name": "Oil filter"}, 201)
	partID := stringField(t, part, "part_id")
	stock := func(store string) string { return maintenanceAPI + "/stores/" + store + "/stock" }
	request("PUT", stock(warehouseID)+"/"+partID, map[string]any{"quantity": 10, "version": 0, "reason": "Opening count"}, 200)
	request("PUT", stock(sites[0])+"/"+partID, map[string]any{"quantity": 1, "version": 0, "reason": "Opening count"}, 200)
	maintenanceJSON(t, h, staff, "PUT", stock(sites[0])+"/"+partID, map[string]any{"quantity": 100, "version": 1, "reason": "Unauthorized"}, 403)
	asset := createAsset(t, h, map[string]any{"name": "Inventory Compressor", "status": "ACTIVE"})
	inputs := make([]map[string]any, 2)
	orderPaths := make([]string, 2)
	for i := range inputs {
		order := request("POST", maintenanceAPI+"/work-orders", map[string]any{
			"asset_id": asset["asset_id"], "title": "Repair", "description": "Replace filter",
		}, 201)
		orderPaths[i] = maintenanceAPI + "/work-orders/" + stringField(t, order, "work_order_id")
		inputs[i] = map[string]any{"request_id": uuid.NewString(), "store_id": sites[0], "part_id": partID, "quantity": 1}
	}
	maintenanceJSON(t, h, staff, "POST", orderPaths[0]+"/usage", map[string]any{"request_id": uuid.NewString(), "store_id": sites[1], "part_id": partID, "quantity": 1}, 409)
	maintenanceJSON(t, h, staff, "POST", orderPaths[0]+"/usage", map[string]any{"request_id": uuid.NewString(), "store_id": sites[0], "part_id": partID, "quantity": 1.5}, 400)
	status := make([]int, 2)
	done := make(chan int, 2)
	for i := range inputs {
		go func() { status[i] = maintenanceStatus(h, staff, "POST", orderPaths[i]+"/usage", inputs[i]); done <- i }()
	}
	<-done
	<-done
	codes := []int{status[0], status[1]}
	sort.Ints(codes)
	if codes[0] != 201 || codes[1] != 409 {
		t.Fatalf("expected one deduction and one conflict, got %v", status)
	}
	winner := 0
	if status[1] == 201 {
		winner = 1
	}
	usage := maintenanceJSON(t, h, staff, "POST", orderPaths[winner]+"/usage", inputs[winner], 201)
	assertField(t, usage, "quantity", 1)
	assertField(t, dataArray(t, request("GET", stock(sites[0]), nil, 200))[0], "quantity", 0)
	assertField(t, dataArray(t, request("GET", stock(warehouseID), nil, 200))[0], "quantity", 10)
	assertField(t, dataArray(t, request("GET", stock(sites[1]), nil, 200))[0], "quantity", 0)

	// Force the audit INSERT at the end of a new deduction to fail. Both prior writes must roll back.
	collision := uuid.New()
	if _, err := h.pool.Exec(context.Background(), `
  INSERT INTO maintenance_stock_changes (change_id, store_id, part_id, previous_quantity, quantity, reason)
  VALUES ($1, $2, $3, 10, 10, 'Collision fixture')`, collision, warehouseID, partID); err != nil {
		t.Fatal(err)
	}
	warehouseUsage := map[string]any{"request_id": collision.String(), "store_id": warehouseID, "part_id": partID, "quantity": 2}
	maintenanceJSON(t, h, staff, "POST", orderPaths[winner]+"/usage", warehouseUsage, 409)
	assertField(t, dataArray(t, request("GET", stock(warehouseID), nil, 200))[0], "quantity", 10)
	assertField(t, objectField(t, request("GET", maintenanceAPI+"/usage?store_id="+warehouseID, nil, 200), "meta"), "total", 0)

	request("PUT", stock(sites[0])+"/"+partID, map[string]any{"quantity": 10, "version": 1, "reason": "Stale"}, 409)
	correction := map[string]any{"request_id": uuid.NewString(), "quantity": 0, "version": 1, "reason": "Part was not installed"}
	path := maintenanceAPI + "/usage/" + stringField(t, usage, "usage_id")
	maintenanceJSON(t, h, staff, "PATCH", path, correction, 200)
	maintenanceJSON(t, h, staff, "PATCH", path, correction, 200)
	assertField(t, dataArray(t, request("GET", stock(sites[0]), nil, 200))[0], "quantity", 1)
	changes := request("GET", stock(sites[0])+"/"+partID+"/changes", nil, 200)
	assertField(t, objectField(t, changes, "meta"), "total", 3)
	ledger := request("GET", maintenanceAPI+"/usage?store_id="+sites[0]+"&part_id="+partID, nil, 200)
	assertField(t, objectField(t, ledger, "meta"), "total", 1)
	request("POST", orderPaths[winner]+"/complete", map[string]any{"notes": "Repair complete"}, 200)
	correction["request_id"] = uuid.NewString()
	correction["version"] = 2
	maintenanceJSON(t, h, staff, "PATCH", path, correction, 409)
}

func maintenanceStatus(h *integrationHarness, token, method, path string, body any) int {
	raw, _ := json.Marshal(body)
	request := httptest.NewRequest(method, path, bytes.NewReader(raw))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	result := httptest.NewRecorder()
	h.router.ServeHTTP(result, request)
	return result.Code
}

func TestMaintenanceCalendarPlanOpensFromDubaiDate(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)
	asset := createAsset(t, h, map[string]any{"name": "Calendar service", "status": "ACTIVE"})
	date := time.Now().UTC().Add(4 * time.Hour).Format(time.DateOnly)
	flow := func(method, path string, body any, want int) map[string]any {
		return maintenanceJSON(t, h, h.adminToken, method, maintenanceAPI+path, body, want)
	}
	plan := flow("POST", "/plans", map[string]any{"asset_id": asset["asset_id"], "title": "Due today",
		"interval_months": 1, "next_due_date": date, "active": true,
	}, 201)
	orders := dataArray(t, flow("GET", "/work-orders?type=ROUTINE", nil, 200))
	if len(orders) != 1 {
		t.Fatalf("expected one due order, got %d", len(orders))
	}
	assertField(t, orders[0], "due_date", date)
	assertField(t, orders[0], "plan_id", plan["plan_id"])
	flow("POST", "/work-orders/"+stringField(t, orders[0], "work_order_id")+"/complete", map[string]any{"notes": "Inspection complete"}, 200)
	updated := dataArray(t, flow("GET", "/plans", nil, 200))[0]
	next, err := time.Parse(time.DateOnly, stringField(t, updated, "next_due_date"))
	if err != nil || next.Format(time.DateOnly) <= date {
		t.Fatalf("calendar date did not advance: %v (%v)", next, err)
	}
}

func TestMaintenanceStartScannerCatchesExistingDuePlan(t *testing.T) {
	h := setupIntegrationTest(t)
	disableExternalMaintenanceNotifications(t)
	asset := createAsset(t, h, map[string]any{"name": "Startup service fixture", "status": "ACTIVE"})
	assetID := stringField(t, asset, "asset_id")
	if _, err := h.pool.Exec(context.Background(), `
   INSERT INTO maintenance_plans (asset_id, title, interval_hours, next_due_hours, quarantine_when_due)
   VALUES ($1, 'Existing due plan', 100, 0, TRUE)`, assetID); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	service := maintenance.Service{Pool: h.pool}
	service.StartScanner(ctx)
	for {
		var orderCount int
		if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM maintenance_work_orders WHERE asset_id = $1", assetID).Scan(&orderCount); err != nil {
			t.Fatal(err)
		}
		if orderCount != 0 {
			if orderCount != 1 {
				t.Fatalf("startup created %d orders", orderCount)
			}
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := service.ScanDue(ctx); err != nil {
		t.Fatal(err)
	}
	rows := maintenanceJSON(t, h, h.adminToken, "GET", maintenanceAPI+"/work-orders?asset_id="+assetID, nil, 200)
	assertField(t, objectField(t, rows, "meta"), "total", 1)
	assertField(t, maintenanceJSON(t, h, h.adminToken, "GET", "/v1/asset/"+assetID, nil, 200), "quarantined", true)
}

func TestMaintenanceReleaseRacingNewBlockingFault(t *testing.T) {
	h := setupIntegrationTest(t)
	asset := createAsset(t, h, map[string]any{"name": "Release fixture", "status": "ACTIVE"})
	id := stringField(t, asset, "asset_id")
	previousHold := maintenanceJSON(t, h, h.adminToken, "POST", maintenanceAPI+"/quarantine", map[string]any{"asset_id": id, "reason": "Workshop test"}, 201)
	releasePath := maintenanceAPI + "/quarantine/" + stringField(t, previousHold, "quarantine_id") + "/release"
	release := make(chan int, 1)
	raise := make(chan int, 1)
	go func() {
		release <- maintenanceStatus(h, h.adminToken, "POST", releasePath, map[string]any{"notes": "Inspection complete"})
	}()
	go func() {
		raise <- maintenanceStatus(h, h.adminToken, "POST", maintenanceAPI+"/work-orders", map[string]any{
			"asset_id": id, "title": "New fault", "description": "Persistent leak found", "quarantine": true,
		})
	}()
	if got := <-raise; got != 201 {
		t.Fatalf("raising blocking fault returned %d", got)
	}
	if got := <-release; got != 200 && got != 409 {
		t.Fatalf("concurrent release returned %d", got)
	}
	assertField(t, maintenanceJSON(t, h, h.adminToken, "GET", "/v1/asset/"+id, nil, 200), "quarantined", true)
	active := dataArray(t, maintenanceJSON(t, h, h.adminToken, "GET", maintenanceAPI+"/quarantine?asset_id="+id, nil, 200))
	if len(active) != 1 {
		t.Fatalf("expected one active hold, got %d", len(active))
	}
	assertField(t, active[0], "blocking_orders", 1)
}
