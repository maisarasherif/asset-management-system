package controllers

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

var validate = validator.New()

func GetAssets(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		assets, err := queries.GetAllAssetsPaginated(ctx, db.GetAllAssetsPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch assets"})
			return
		}

		total, err := queries.CountAssets(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count assets"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: assets,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		asset, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}

		c.JSON(http.StatusOK, asset)
	}
}

func AddAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.AssetInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		templateID, err := utils.ParseOptionalUUID(input.TemplateID, "template_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if templateID != nil {
			tx, err := pool.Begin(ctx)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin asset creation transaction"})
				return
			}
			defer tx.Rollback(ctx)

			queries := db.New(tx)

			template, err := queries.GetAssetTemplateByID(ctx, *templateID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate template"})
				return
			}

			asset, err := queries.CreateAssetFromTemplate(ctx, db.CreateAssetFromTemplateParams{
				Name:                     input.Name,
				Photo:                    input.Photo,
				Datasheet:                input.Datasheet,
				Description:              input.Description,
				Status:                   input.Status,
				Location:                 input.Location,
				AssignedProject:          input.AssignedProject,
				TemplateID:               templateID,
				MaintenanceIntervalHours: assetInputMaintenanceInterval(input),
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
				return
			}

			if err := utils.SpinUpAssetFromTemplate(ctx, tx, asset.AssetID, template.TemplateID); err != nil {
				logger.Log.Error().
					Err(err).
					Str("asset_id", asset.AssetID.String()).
					Str("template_id", template.TemplateID.String()).
					Msg("template-backed asset creation rolled back")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to spin up asset from template"})
				return
			}

			if err := tx.Commit(ctx); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset creation"})
				return
			}

			logger.Log.Info().
				Str("asset_id", asset.AssetID.String()).
				Str("template_id", template.TemplateID.String()).
				Msg("asset created and spun up from template successfully")

			c.JSON(http.StatusCreated, asset)
			return
		}

		queries := db.New(pool)

		asset, err := queries.CreateAsset(ctx, db.CreateAssetParams{
			Name:                     input.Name,
			Photo:                    input.Photo,
			Datasheet:                input.Datasheet,
			Description:              input.Description,
			Status:                   input.Status,
			Location:                 input.Location,
			AssignedProject:          input.AssignedProject,
			MaintenanceIntervalHours: assetInputMaintenanceInterval(input),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
			return
		}

		c.JSON(http.StatusCreated, asset)
	}
}

func UpdateAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		var input dto.AssetInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}

		maintenanceIntervalHours := existing.MaintenanceIntervalHours
		if input.MaintenanceIntervalHours != nil {
			maintenanceIntervalHours = *input.MaintenanceIntervalHours
		}

		_, err = queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:                     input.Name,
			Photo:                    input.Photo,
			Datasheet:                input.Datasheet,
			Description:              input.Description,
			Status:                   input.Status,
			Location:                 input.Location,
			AssignedProject:          input.AssignedProject,
			MaintenanceIntervalHours: maintenanceIntervalHours,
			AssetID:                  assetID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			return
		}

		if _, err := triggerRoutineMaintenanceIfDue(c.Request.Context(), pool, assetID); err != nil {
			logger.Log.Error().Err(err).
				Str("asset_id", assetID.String()).
				Msg("failed to evaluate routine maintenance after asset update")
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}

func DeleteAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		rows, err := queries.DeleteAsset(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete asset"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		userID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Warn().
			Str("asset_id", assetID.String()).
			Str("asset_name", existing.Name).
			Str("deleted_by", userID).
			Msg("asset deleted")

		c.JSON(http.StatusOK, gin.H{"message": "asset deleted successfully"})
	}
}

func PatchAsset(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		var input dto.PatchAssetInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		existing, err := queries.GetAssetByID(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}

		name := existing.Name
		photo := existing.Photo
		datasheet := existing.Datasheet
		description := existing.Description
		status := existing.Status
		location := existing.Location
		assignedProject := existing.AssignedProject
		maintenanceIntervalHours := existing.MaintenanceIntervalHours

		if input.Name != nil {
			name = *input.Name
		}
		if input.Photo != nil {
			photo = *input.Photo
		}
		if input.Datasheet != nil {
			datasheet = *input.Datasheet
		}
		if input.Description != nil {
			description = *input.Description
		}
		if input.Status != nil {
			status = *input.Status
		}
		if input.Location != nil {
			location = *input.Location
		}
		if input.AssignedProject != nil {
			assignedProject = *input.AssignedProject
		}
		if input.MaintenanceIntervalHours != nil {
			maintenanceIntervalHours = *input.MaintenanceIntervalHours
		}

		_, err = queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:                     name,
			Photo:                    photo,
			Datasheet:                datasheet,
			Description:              description,
			Status:                   status,
			Location:                 location,
			AssignedProject:          assignedProject,
			MaintenanceIntervalHours: maintenanceIntervalHours,
			AssetID:                  assetID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			return
		}

		if _, err := triggerRoutineMaintenanceIfDue(c.Request.Context(), pool, assetID); err != nil {
			logger.Log.Error().Err(err).
				Str("asset_id", assetID.String()).
				Msg("failed to evaluate routine maintenance after asset patch")
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}

func UpdateAssetWorkingHours(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		var input dto.AssetWorkingHoursInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin working hours update"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)
		asset, err := queries.LockAssetForMaintenance(ctx, assetID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lock asset"})
			return
		}

		if input.WorkingHours < asset.WorkingHours {
			c.JSON(http.StatusBadRequest, gin.H{"error": "working hours cannot be lower than the current counter"})
			return
		}

		_, err = queries.UpdateAssetWorkingHours(ctx, db.UpdateAssetWorkingHoursParams{
			AssetID:          assetID,
			WorkingHours:     input.WorkingHours,
			WorkingHoursNote: strings.TrimSpace(input.Note),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update working hours"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit working hours update"})
			return
		}

		event, err := triggerRoutineMaintenanceIfDue(c.Request.Context(), pool, assetID)
		if err != nil {
			logger.Log.Error().Err(err).
				Str("asset_id", assetID.String()).
				Msg("failed to evaluate routine maintenance after working hours update")
		}

		queries = db.New(pool)
		updatedAsset, err := queries.GetAssetByID(c.Request.Context(), assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch updated asset"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"asset":             updatedAsset,
			"maintenance_event": event,
		})
	}
}

func GetAssetRoutineMaintenance(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		if _, err := queries.GetAssetByID(ctx, assetID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch asset"})
			return
		}

		events, err := queries.ListAssetMaintenanceEvents(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch routine maintenance"})
			return
		}
		if events == nil {
			events = []db.AssetMaintenanceEvent{}
		}

		c.JSON(http.StatusOK, events)
	}
}

func CompleteAssetRoutineMaintenance(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}

		var input dto.CompleteAssetMaintenanceInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin maintenance completion"})
			return
		}
		defer tx.Rollback(ctx)

		queries := db.New(tx)
		if _, err := queries.LockAssetForMaintenance(ctx, assetID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lock asset"})
			return
		}

		event, err := queries.CompleteOpenAssetMaintenanceEvent(ctx, db.CompleteOpenAssetMaintenanceEventParams{
			AssetID:         assetID,
			CompletionNotes: strings.TrimSpace(input.CompletionNotes),
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "no routine maintenance is currently required for this asset"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to complete routine maintenance"})
			return
		}

		asset, err := queries.MarkAssetMaintenanceCompleted(ctx, db.MarkAssetMaintenanceCompletedParams{
			AssetID:             assetID,
			PreviousAssetStatus: event.PreviousAssetStatus,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset maintenance state"})
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit maintenance completion"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"asset":             asset,
			"maintenance_event": event,
		})
	}
}

func triggerRoutineMaintenanceIfDue(parent context.Context, pool *pgxpool.Pool, assetID uuid.UUID) (*db.AssetMaintenanceEvent, error) {
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	queries := db.New(tx)
	asset, err := queries.LockAssetForMaintenance(ctx, assetID)
	if err != nil {
		return nil, err
	}

	if _, err := queries.GetOpenAssetMaintenanceEvent(ctx, assetID); err == nil {
		if asset.Status != "MAINTENANCE" {
			if _, err := queries.MarkAssetMaintenanceRequired(ctx, assetID); err != nil {
				return nil, err
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return nil, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	if asset.MaintenanceIntervalHours <= 0 ||
		asset.NextMaintenanceDueHours <= 0 ||
		asset.WorkingHours < asset.NextMaintenanceDueHours {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return nil, nil
	}

	event, err := queries.CreateAssetMaintenanceEvent(ctx, db.CreateAssetMaintenanceEventParams{
		AssetID:             assetID,
		DueAtHours:          asset.NextMaintenanceDueHours,
		TriggeredAtHours:    asset.WorkingHours,
		PreviousAssetStatus: asset.Status,
	})
	if err != nil {
		return nil, err
	}

	if _, err := queries.MarkAssetMaintenanceRequired(ctx, assetID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	notifyRoutineMaintenance(pool, event, asset.Name, asset.DisplayID)
	return &event, nil
}

func notifyRoutineMaintenance(pool *pgxpool.Pool, event db.AssetMaintenanceEvent, assetName, assetDisplayID string) {
	recipientEmail := os.Getenv("ALERT_RECIPIENT_EMAIL")
	recipientName := os.Getenv("ALERT_RECIPIENT_NAME")
	if recipientName == "" {
		recipientName = "Maintenance team"
	}

	errorsList := []string{}
	if recipientEmail == "" {
		errorsList = append(errorsList, "ALERT_RECIPIENT_EMAIL not set")
	} else if err := utils.SendRoutineMaintenanceEmail(
		recipientEmail,
		recipientName,
		assetName,
		assetDisplayID,
		event.TriggeredAtHours,
		event.DueAtHours,
	); err != nil {
		errorsList = append(errorsList, "email: "+err.Error())
	}

	clickUpTaskID, err := utils.CreateRoutineMaintenanceClickUpTask(
		assetName,
		assetDisplayID,
		event.TriggeredAtHours,
		event.DueAtHours,
	)
	if err != nil {
		errorsList = append(errorsList, "clickup: "+err.Error())
	}

	notificationError := strings.Join(errorsList, "; ")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.New(pool).MarkMaintenanceNotificationResult(ctx, db.MarkMaintenanceNotificationResultParams{
		MaintenanceEventID: event.MaintenanceEventID,
		ClickupTaskID:      clickUpTaskID,
		NotificationError:  notificationError,
	}); err != nil {
		logger.Log.Error().Err(err).
			Str("maintenance_event_id", event.MaintenanceEventID.String()).
			Msg("failed to record routine maintenance notification result")
	}

	if notificationError != "" {
		logger.Log.Error().
			Str("maintenance_event_id", event.MaintenanceEventID.String()).
			Str("notification_error", notificationError).
			Msg("routine maintenance notification completed with errors")
		return
	}

	logger.Log.Info().
		Str("maintenance_event_id", event.MaintenanceEventID.String()).
		Str("clickup_task_id", clickUpTaskID).
		Msg("routine maintenance notification sent")
}

func assetInputMaintenanceInterval(input dto.AssetInput) int64 {
	if input.MaintenanceIntervalHours == nil {
		return 0
	}
	return *input.MaintenanceIntervalHours
}
