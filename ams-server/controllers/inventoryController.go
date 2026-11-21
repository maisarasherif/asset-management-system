package controllers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/maintenance"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func (h MaintenanceController) Stores(c *gin.Context) {
	rows, err := db.New(h.Service.Pool).ListMaintenanceStores(c.Request.Context())
	maintenanceResponse(c, http.StatusOK, rows, err)
}

func (h MaintenanceController) AddStore(c *gin.Context) {
	var input struct {
		ProjectID uuid.UUID `json:"project_id"`
	}
	if !maintenanceInput(c, &input) {
		return
	}
	if input.ProjectID == uuid.Nil {
		maintenanceResponse(c, http.StatusCreated, nil, maintenance.InputError("Select a project"))
		return
	}
	row, err := db.New(h.Service.Pool).CreateMaintenanceStore(c.Request.Context(), &input.ProjectID)
	maintenanceResponse(c, http.StatusCreated, row, err)
}

func (h MaintenanceController) AddPart(c *gin.Context) {
	var input struct {
		PartNumber string `json:"part_number"`
		Name       string `json:"name"`
	}
	if !maintenanceInput(c, &input) {
		return
	}
	number, name := strings.TrimSpace(input.PartNumber), strings.TrimSpace(input.Name)
	if number == "" || name == "" {
		maintenanceResponse(c, http.StatusCreated, nil, maintenance.InputError("Enter a part number and name"))
		return
	}
	row, err := db.New(h.Service.Pool).CreateMaintenancePart(c.Request.Context(), db.CreateMaintenancePartParams{PartNumber: number, Name: name})
	maintenanceResponse(c, http.StatusCreated, row, err)
}

func (h MaintenanceController) Stock(c *gin.Context) {
	store, ok := utils.ParseUUIDParam(c, "store_id")
	if !ok {
		return
	}
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	limit, offset, page := utils.ParsePagination(c)
	search := utils.ReadListFilters(c).Text("search")
	available := c.Query("in_stock") == "true"
	rows, err := q.ListMaintenanceStock(ctx, db.ListMaintenanceStockParams{
		StoreID: store, Search: search, InStock: available, PageLimit: limit, PageOffset: offset,
	})
	maintenancePage(c, rows, err, page, func() (int64, error) {
		return q.CountMaintenanceStock(ctx, db.CountMaintenanceStockParams{StoreID: store, Search: search, InStock: available})
	})
}

func (h MaintenanceController) SaveStock(c *gin.Context) {
	store, ok := utils.ParseUUIDParam(c, "store_id")
	if !ok {
		return
	}
	part, ok := utils.ParseUUIDParam(c, "part_id")
	if !ok {
		return
	}
	actor, ok := requestUserID(c)
	if !ok {
		return
	}
	var input dto.StockCountInput
	if !maintenanceInput(c, &input) {
		return
	}
	row, err := h.Service.SetStockCount(c.Request.Context(), actor, store, part, input)
	maintenanceResponse(c, http.StatusOK, row, err)
}

func (h MaintenanceController) StockChanges(c *gin.Context) {
	store, ok := utils.ParseUUIDParam(c, "store_id")
	if !ok {
		return
	}
	part, ok := utils.ParseUUIDParam(c, "part_id")
	if !ok {
		return
	}
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	limit, offset, page := utils.ParsePagination(c)
	rows, err := q.ListMaintenanceStockChanges(ctx, db.ListMaintenanceStockChangesParams{
		StoreID: store, PartID: part, PageLimit: limit, PageOffset: offset,
	})
	maintenancePage(c, rows, err, page, func() (int64, error) {
		return q.CountMaintenanceStockChanges(ctx, db.CountMaintenanceStockChangesParams{StoreID: store, PartID: part})
	})
}

func (h MaintenanceController) Usage(c *gin.Context) {
	order, asset := maintenanceQueryID(c, "work_order_id"), maintenanceQueryID(c, "asset_id")
	store, part := maintenanceQueryID(c, "store_id"), maintenanceQueryID(c, "part_id")
	from, to := maintenanceQueryDate(c, "from"), maintenanceQueryDate(c, "to")
	if c.IsAborted() {
		return
	}
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	limit, offset, page := utils.ParsePagination(c)
	rows, err := q.ListMaintenanceUsage(ctx, db.ListMaintenanceUsageParams{
		FilterOrder: order, FilterAsset: asset, FilterStore: store, FilterPart: part,
		FromDate: from, ToDate: to, PageLimit: limit, PageOffset: offset,
	})
	maintenancePage(c, rows, err, page, func() (int64, error) {
		return q.CountMaintenanceUsage(ctx, db.CountMaintenanceUsageParams{
			FilterOrder: order, FilterAsset: asset, FilterStore: store, FilterPart: part, FromDate: from, ToDate: to,
		})
	})
}

func (h MaintenanceController) RecordUsage(c *gin.Context) {
	id, ok := utils.ParseUUIDParam(c, "order_id")
	if !ok {
		return
	}
	actor, ok := requestUserID(c)
	if !ok {
		return
	}
	var input dto.PartUsageInput
	if !maintenanceInput(c, &input) {
		return
	}
	row, err := h.Service.RecordUsage(c.Request.Context(), actor, id, input)
	maintenanceResponse(c, http.StatusCreated, row, err)
}

func (h MaintenanceController) CorrectUsage(c *gin.Context) {
	id, ok := utils.ParseUUIDParam(c, "usage_id")
	if !ok {
		return
	}
	actor, ok := requestUserID(c)
	if !ok {
		return
	}
	var input dto.PartUsageCorrection
	if !maintenanceInput(c, &input) {
		return
	}
	row, err := h.Service.CorrectUsage(c.Request.Context(), actor, id, input)
	maintenanceResponse(c, http.StatusOK, row, err)
}
