package main_test

import (
	"context"
	"errors"
	"testing"
	"time"

	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
)

func TestInspectionWorkOrderCompletesOnlyOnPublishedIssuance(t *testing.T) {
	h := setupIntegrationTest(t)
	ctx := context.Background()
	service, actor, cert, preview, documents := generatedIssuanceFixture(t, h)
	if _, err := h.pool.Exec(ctx, "UPDATE certificates SET status = 'PENDING', issue_date = NULL, expiry_date = NULL, certificate_file = '' WHERE certificate_id = $1", cert); err != nil {
		t.Fatal(err)
	}
	call := func(method, path string, data any, status int) map[string]any {
		return maintenanceJSON(t, h, h.adminToken, method, maintenanceAPI+path, data, status)
	}
	initial := call("GET", "/work-orders?type=INSPECTION", nil, 200)
	assertField(t, objectField(t, initial, "meta"), "total", 1)
	order := dataArray(t, initial)[0]
	id := stringField(t, order, "work_order_id")
	assetID := stringField(t, order, "asset_id")
	assertField(t, order, "certificate_id", cert.String())
	assertField(t, order, "status", "OPEN")
	if order["due_date"] != nil || order["assignee_id"] != nil {
		t.Fatalf("unexpected scheduling fields on an initial inspection: %v", order)
	}
	path := "/work-orders/" + id
	assertField(t, call("POST", path+"/start", nil, 200), "status", "IN_PROGRESS")
	call("POST", path+"/complete", map[string]any{"notes": "Inspection done"}, 409)
	call("POST", path+"/assign", map[string]any{"assignee_id": actor}, 409)
	call("POST", "/work-orders", map[string]any{"asset_id": assetID, "title": "Pump repair", "description": "Repair pump"}, 201)
	combined := call("GET", "/work-orders?asset_id="+assetID+"&open_only=true", nil, 200)
	assertField(t, objectField(t, combined, "meta"), "total", 2)
	filtered := call("GET", "/work-orders?asset_id="+assetID+"&type=MAINTENANCE", nil, 200)
	assertField(t, objectField(t, filtered, "meta"), "total", 1)

	input := externalInput(*preview.SignerID)
	today := time.Now().In(time.FixedZone("Dubai", 4*60*60))
	input.IssueDate = today.Format(time.DateOnly)
	input.ExpiryDate = today.AddDate(1, 0, 0).Format(time.DateOnly)
	documents.failPut = true
	if _, err := service.ApproveExternal(ctx, actor, cert, input); !errors.Is(err, issuance.ErrIssuanceFailed) {
		t.Fatalf("expected upload to fail, got %v", err)
	}
	assertField(t, call("GET", path, nil, 200), "status", "IN_PROGRESS")
	documents.failPut = false
	published, err := service.ApproveExternal(ctx, actor, cert, input)
	if err != nil {
		t.Fatal(err)
	}
	closed := call("GET", path, nil, 200)
	assertField(t, closed, "status", "COMPLETED")
	assertField(t, closed, "issuance_id", published.ID.String())
	assertField(t, objectField(t, call("GET", "/work-orders?type=INSPECTION&open_only=true", nil, 200), "meta"), "total", 0)

	due := today.AddDate(0, 0, 12).Format(time.DateOnly)
	if _, err := h.pool.Exec(ctx, "UPDATE certificates SET expiry_date = $1::text::date::timestamp AT TIME ZONE 'UTC' WHERE certificate_id = $2", due, cert); err != nil {
		t.Fatal(err)
	}
	call("POST", "/scan", nil, 200)
	followup := call("GET", "/work-orders?type=INSPECTION&open_only=true", nil, 200)
	assertField(t, objectField(t, followup, "meta"), "total", 1)
	next := dataArray(t, followup)[0]
	assertField(t, next, "due_date", due)
	if next["work_order_id"] == id {
		t.Fatal("a renewal reused the completed order")
	}
}

func TestInspectionScanIncludesCertificatesEnteringDueWindow(t *testing.T) {
	h := setupIntegrationTest(t)
	_, _, cert, _, _ := generatedIssuanceFixture(t, h)
	ctx := context.Background()
	// Suppress insert-time discovery to simulate a certificate that became due while AMS was offline.
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "ALTER TABLE certificates DISABLE TRIGGER refresh_inspection_on_certificate_change"); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE certificates SET expiry_date = now() - interval '1 day' WHERE certificate_id = $1`, cert); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "ALTER TABLE certificates ENABLE TRIGGER refresh_inspection_on_certificate_change"); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		maintenanceJSON(t, h, h.adminToken, "POST", maintenanceAPI+"/scan", nil, 200)
	}
	list := maintenanceJSON(t, h, h.adminToken, "GET", maintenanceAPI+"/work-orders?type=INSPECTION&open_only=true", nil, 200)
	assertField(t, objectField(t, list, "meta"), "total", 1)
	assertField(t, dataArray(t, list)[0], "certificate_id", cert.String())
}
