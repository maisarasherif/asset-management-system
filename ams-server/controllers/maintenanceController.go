package controllers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/maintenance"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

type MaintenanceController struct{ Service maintenance.Service }

func maintenanceResponse(c *gin.Context, status int, data any, err error) {
	if err == nil {
		c.JSON(status, data)
		return
	}
	var input maintenance.InputError
	var conflict maintenance.Conflict
	var sqlErr *pgconn.PgError
	switch {
	case errors.As(err, &input):
		c.JSON(http.StatusBadRequest, gin.H{"error": input.Error()})
	case errors.As(err, &conflict):
		c.JSON(http.StatusConflict, gin.H{"error": conflict.Error()})
	case errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "Record not found"})
	case errors.As(err, &sqlErr) && sqlErr.Code == "23505":
		c.JSON(http.StatusConflict, gin.H{"error": "A record with the same identifier already exists"})
	case errors.As(err, &sqlErr) && sqlErr.Code == "23503":
		c.JSON(http.StatusBadRequest, gin.H{"error": "A related record no longer exists"})
	default:
		logger.Log.Error().Err(err).Str("path", c.FullPath()).Msg("Maintenance request failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Maintenance request failed"})
	}
}

func maintenanceRelatedConflict(c *gin.Context, err error, deleting bool) bool {
	var sqlErr *pgconn.PgError
	if !errors.As(err, &sqlErr) {
		return false
	}
	if sqlErr.ConstraintName == "quarantined_deployment" {
		c.JSON(http.StatusConflict, gin.H{"error": "Quarantined equipment cannot be assigned to a new project"})
		return true
	}
	if deleting && (sqlErr.Code == "23503" || sqlErr.Code == "23001") &&
		(strings.HasPrefix(sqlErr.ConstraintName, "maintenance_") || strings.HasPrefix(sqlErr.TableName, "maintenance_")) {
		c.JSON(http.StatusConflict, gin.H{"error": "Equipment has linked maintenance plans or history and cannot be deleted"})
		return true
	}
	return false
}

func RequireMaintenanceRole(adminOnly bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := utils.GetRoleFromContext(c)
		switch role {
		case "ADMIN", "SUPER_ADMIN":
			c.Next()
		case "USER":
			if !adminOnly {
				c.Next()
				return
			}
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Maintenance administrator access required"})
		default:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "AMS staff access required"})
		}
	}
}

func maintenanceInput(c *gin.Context, input any) bool {
	if err := c.ShouldBindJSON(input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid maintenance request"})
		return false
	}
	return true
}

func maintenanceQueryID(c *gin.Context, key string) *uuid.UUID {
	raw := c.Query(key)
	if raw == "" || c.IsAborted() {
		return nil
	}
	id, err := uuid.Parse(raw)
	if err != nil || id == uuid.Nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Invalid " + key})
		return nil
	}
	return &id
}

func maintenanceQueryDate(c *gin.Context, key string) pgtype.Date {
	raw := c.Query(key)
	if raw == "" || c.IsAborted() {
		return pgtype.Date{}
	}
	parsed, err := time.Parse(time.DateOnly, raw)
	if err != nil || parsed.Year() < 1 {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Invalid " + key})
		return pgtype.Date{}
	}
	return pgtype.Date{Time: parsed, Valid: true}
}

func maintenancePage[T any](c *gin.Context, rows []T, err error, meta dto.PaginationQuery, count func() (int64, error)) {
	if err != nil {
		maintenanceResponse(c, http.StatusOK, nil, err)
		return
	}
	total, err := count()
	if rows == nil {
		rows = []T{}
	}
	maintenanceResponse(c, http.StatusOK, dto.PaginatedResponse{Data: rows, Meta: utils.BuildMeta(meta, total)}, err)
}

func (h MaintenanceController) WorkOrders(c *gin.Context) {
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	limit, offset, page := utils.ParsePagination(c)
	filters := utils.ReadListFilters(c)
	status := filters.Enum("status", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED")
	kind := filters.Enum("type", "ROUTINE", "NON_ROUTINE")
	if !filters.Valid() {
		return
	}
	asset := maintenanceQueryID(c, "asset_id")
	component := maintenanceQueryID(c, "component_id")
	from, to := maintenanceQueryDate(c, "from"), maintenanceQueryDate(c, "to")
	if c.IsAborted() {
		return
	}
	search := filters.Text("search")
	rows, err := q.ListMaintenanceWorkOrders(ctx, db.ListMaintenanceWorkOrdersParams{
		FilterAsset: asset, FilterComponent: component, FilterStatus: status, FilterType: kind, OpenOnly: c.Query("open_only") == "true",
		FromDate: from, ToDate: to, Search: search, PageLimit: limit, PageOffset: offset,
	})
	maintenancePage(c, rows, err, page, func() (int64, error) {
		return q.CountMaintenanceWorkOrders(ctx, db.CountMaintenanceWorkOrdersParams{
			FilterAsset: asset, FilterComponent: component, FilterStatus: status, FilterType: kind, OpenOnly: c.Query("open_only") == "true",
			FromDate: from, ToDate: to, Search: search,
		})
	})
}

func (h MaintenanceController) WorkOrder(c *gin.Context) {
	id, ok := utils.ParseUUIDParam(c, "order_id")
	if !ok {
		return
	}
	row, err := db.New(h.Service.Pool).GetMaintenanceWorkOrderDetail(c.Request.Context(), id)
	maintenanceResponse(c, http.StatusOK, row, err)
}

func (h MaintenanceController) Raise(c *gin.Context) {
	actor, ok := requestUserID(c)
	if !ok {
		return
	}
	var input dto.WorkOrderInput
	if !maintenanceInput(c, &input) {
		return
	}
	row, err := h.Service.RaiseWorkOrder(c.Request.Context(), actor, input)
	maintenanceResponse(c, http.StatusCreated, row, err)
}

func (h MaintenanceController) OrderAction(action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := utils.ParseUUIDParam(c, "order_id")
		if !ok {
			return
		}
		actor, ok := requestUserID(c)
		if !ok {
			return
		}
		var input dto.WorkOrderAction
		if action != "start" && !maintenanceInput(c, &input) {
			return
		}
		row, err := h.Service.WorkOrderAction(c.Request.Context(), id, actor, action, input)
		maintenanceResponse(c, http.StatusOK, row, err)
	}
}

func (h MaintenanceController) Technicians(c *gin.Context) {
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	limit, offset, page := utils.ParsePagination(c)
	search := utils.ReadListFilters(c).Text("search")
	rows, err := q.ListMaintenanceTechnicians(ctx, db.ListMaintenanceTechniciansParams{Search: search, PageLimit: limit, PageOffset: offset})
	maintenancePage(c, rows, err, page, func() (int64, error) { return q.CountMaintenanceTechnicians(ctx, search) })
}

func (h MaintenanceController) Plans(c *gin.Context) {
	asset := maintenanceQueryID(c, "asset_id")
	if c.IsAborted() {
		return
	}
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	limit, offset, page := utils.ParsePagination(c)
	rows, err := q.ListMaintenancePlans(ctx, db.ListMaintenancePlansParams{FilterAsset: asset, ActiveOnly: c.Query("active_only") == "true", PageLimit: limit, PageOffset: offset})
	maintenancePage(c, rows, err, page, func() (int64, error) {
		return q.CountMaintenancePlans(ctx, db.CountMaintenancePlansParams{FilterAsset: asset, ActiveOnly: c.Query("active_only") == "true"})
	})
}

func (h MaintenanceController) SavePlan(update bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var id *uuid.UUID
		status := http.StatusCreated
		if update {
			parsed, ok := utils.ParseUUIDParam(c, "plan_id")
			if !ok {
				return
			}
			id = &parsed
			status = http.StatusOK
		}
		var input dto.MaintenancePlanInput
		if !maintenanceInput(c, &input) {
			return
		}
		row, err := h.Service.SavePlan(c.Request.Context(), id, input)
		maintenanceResponse(c, status, row, err)
	}
}

func (h MaintenanceController) Quarantines(c *gin.Context) {
	asset := maintenanceQueryID(c, "asset_id")
	if c.IsAborted() {
		return
	}
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	limit, offset, page := utils.ParsePagination(c)
	history := c.Query("include_released") == "true"
	rows, err := q.ListMaintenanceQuarantines(ctx, db.ListMaintenanceQuarantinesParams{
		FilterAsset: asset, IncludeReleased: history, PageLimit: limit, PageOffset: offset,
	})
	maintenancePage(c, rows, err, page, func() (int64, error) {
		return q.CountMaintenanceQuarantines(ctx, db.CountMaintenanceQuarantinesParams{FilterAsset: asset, IncludeReleased: history})
	})
}

func (h MaintenanceController) Blockers(c *gin.Context) {
	id, ok := utils.ParseUUIDParam(c, "quarantine_id")
	if !ok {
		return
	}
	ctx := c.Request.Context()
	q := db.New(h.Service.Pool)
	if _, err := q.GetMaintenanceQuarantine(ctx, id); err != nil {
		maintenanceResponse(c, http.StatusOK, nil, err)
		return
	}
	rows, err := q.GetBlockingMaintenanceWorkOrders(ctx, id)
	if rows == nil {
		rows = []db.MaintenanceWorkOrder{}
	}
	maintenanceResponse(c, http.StatusOK, rows, err)
}

func (h MaintenanceController) Tag(c *gin.Context) {
	actor, ok := requestUserID(c)
	if !ok {
		return
	}
	var input dto.QuarantineInput
	if !maintenanceInput(c, &input) {
		return
	}
	row, err := h.Service.Tag(c.Request.Context(), actor, input)
	maintenanceResponse(c, http.StatusCreated, row, err)
}

func (h MaintenanceController) Release(c *gin.Context) {
	id, ok := utils.ParseUUIDParam(c, "quarantine_id")
	if !ok {
		return
	}
	actor, ok := requestUserID(c)
	if !ok {
		return
	}
	var input dto.WorkOrderAction
	if !maintenanceInput(c, &input) {
		return
	}
	row, err := h.Service.Release(c.Request.Context(), id, actor, input.Notes)
	maintenanceResponse(c, http.StatusOK, row, err)
}

func (h MaintenanceController) Scan(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Minute)
	defer cancel()
	maintenanceResponse(c, http.StatusOK, gin.H{"message": "Routine plans checked"}, h.Service.ScanDue(ctx))
}
