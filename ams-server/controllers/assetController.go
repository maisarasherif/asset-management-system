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
	"github.com/riverqueue/river"
)

var validate = validator.New()
var errAssignedProjectNotFound = errors.New("assigned project not found")

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
		assetKind := assetInputKind(input)
		if assetKind == "SINGLE_EQUIPMENT" && templateID != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "single-asset equipment cannot be created from a template"})
			return
		}
		if assetKind == "SINGLE_EQUIPMENT" && input.SingleEquipment == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "single_equipment is required for single-asset equipment"})
			return
		}
		if assetKind == "COMPONENTIZED" && input.SingleEquipment != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "single_equipment is only valid for single-asset equipment"})
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

			assignedProject, err := resolveAssetAssignedProject(ctx, queries, input.AssignedProject)
			if err != nil {
				respondToAssignedProjectError(c, err)
				return
			}

			asset, err := queries.CreateAssetFromTemplate(ctx, db.CreateAssetFromTemplateParams{
				Name:                     input.Name,
				Photo:                    input.Photo,
				Datasheet:                input.Datasheet,
				Description:              input.Description,
				Status:                   input.Status,
				Location:                 input.Location,
				AssignedProject:          assignedProject,
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
		if assetKind == "SINGLE_EQUIPMENT" {
			tx, err := pool.Begin(ctx)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin asset creation transaction"})
				return
			}
			defer tx.Rollback(ctx)

			queries := db.New(tx)
			assignedProject, err := resolveAssetAssignedProject(ctx, queries, input.AssignedProject)
			if err != nil {
				respondToAssignedProjectError(c, err)
				return
			}

			equipmentTypeID, err := utils.ParseUUID(input.SingleEquipment.EquipmentTypeID, "equipment_type_id")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if _, err := queries.GetEquipmentTypeByID(ctx, equipmentTypeID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					c.JSON(http.StatusNotFound, gin.H{"error": "equipment type not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate equipment type"})
				return
			}

			testIDs := make([]uuid.UUID, 0, len(input.SingleEquipment.TestTypeIDs))
			seenTestIDs := map[uuid.UUID]struct{}{}
			for _, rawTestID := range input.SingleEquipment.TestTypeIDs {
				testID, err := utils.ParseUUID(rawTestID, "test_type_id")
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				if _, seen := seenTestIDs[testID]; seen {
					continue
				}
				if _, err := queries.GetTestTypeByID(ctx, testID); err != nil {
					if errors.Is(err, pgx.ErrNoRows) {
						c.JSON(http.StatusNotFound, gin.H{"error": "test type not found"})
						return
					}
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate test type"})
					return
				}
				seenTestIDs[testID] = struct{}{}
				testIDs = append(testIDs, testID)
			}
			if len(testIDs) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "at least one test type is required"})
				return
			}

			asset, err := queries.CreateAsset(ctx, db.CreateAssetParams{
				Name:                     input.Name,
				Photo:                    input.Photo,
				Datasheet:                input.Datasheet,
				Description:              input.Description,
				Status:                   input.Status,
				AssetKind:                assetKind,
				Location:                 input.Location,
				AssignedProject:          assignedProject,
				MaintenanceIntervalHours: assetInputMaintenanceInterval(input),
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
				return
			}

			equipment, err := queries.CreateSingleAssetEquipment(ctx, db.CreateSingleAssetEquipmentParams{
				AssetID:         asset.AssetID,
				EquipmentTypeID: equipmentTypeID,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add single-asset equipment"})
				return
			}

			selfComponent, err := queries.CreateSelfComponent(ctx, db.CreateSelfComponentParams{
				AssetID:                asset.AssetID,
				SingleAssetEquipmentID: &equipment.SingleAssetEquipmentID,
				Name:                   input.Name,
				Description:            input.Description,
				Location:               input.Location,
				AssignedProject:        assignedProject,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add equipment certificate bridge"})
				return
			}

			for _, testID := range testIDs {
				testType, err := queries.GetTestTypeByID(ctx, testID)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test type"})
					return
				}
				if _, err := queries.CreatePendingCertificate(ctx, db.CreatePendingCertificateParams{
					ComponentID:     selfComponent.ComponentID,
					CertificateName: testType.TestName,
					TestID:          testID,
				}); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add equipment certificate"})
					return
				}
			}

			if err := tx.Commit(ctx); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset creation"})
				return
			}

			logger.Log.Info().
				Str("asset_id", asset.AssetID.String()).
				Str("single_asset_equipment_id", equipment.SingleAssetEquipmentID.String()).
				Msg("single-asset equipment created successfully")

			c.JSON(http.StatusCreated, asset)
			return
		}

		assignedProject, err := resolveAssetAssignedProject(ctx, queries, input.AssignedProject)
		if err != nil {
			respondToAssignedProjectError(c, err)
			return
		}

		asset, err := queries.CreateAsset(ctx, db.CreateAssetParams{
			Name:                     input.Name,
			Photo:                    input.Photo,
			Datasheet:                input.Datasheet,
			Description:              input.Description,
			Status:                   input.Status,
			AssetKind:                assetKind,
			Location:                 input.Location,
			AssignedProject:          assignedProject,
			MaintenanceIntervalHours: assetInputMaintenanceInterval(input),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add asset"})
			return
		}

		c.JSON(http.StatusCreated, asset)
	}
}

func UpdateAsset(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) gin.HandlerFunc {
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

		assignedProject, err := resolveAssetAssignedProject(ctx, queries, input.AssignedProject)
		if err != nil {
			respondToAssignedProjectError(c, err)
			return
		}

		_, err = queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:                     input.Name,
			Photo:                    input.Photo,
			Datasheet:                input.Datasheet,
			Description:              input.Description,
			Status:                   input.Status,
			Location:                 input.Location,
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

		if _, err := triggerRoutineMaintenanceIfDue(c.Request.Context(), pool, riverClient, assetID); err != nil {
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

func PatchAsset(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) gin.HandlerFunc {
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
			resolvedAssignedProject, err := resolveAssetAssignedProject(ctx, queries, *input.AssignedProject)
			if err != nil {
				respondToAssignedProjectError(c, err)
				return
			}
			assignedProject = resolvedAssignedProject
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

		if _, err := triggerRoutineMaintenanceIfDue(c.Request.Context(), pool, riverClient, assetID); err != nil {
			logger.Log.Error().Err(err).
				Str("asset_id", assetID.String()).
				Msg("failed to evaluate routine maintenance after asset patch")
		}

		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}

func UpdateAssetWorkingHours(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) gin.HandlerFunc {
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

		event, err := triggerRoutineMaintenanceIfDue(c.Request.Context(), pool, riverClient, assetID)
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

func resolveAssetAssignedProject(ctx context.Context, queries *db.Queries, assignedProject string) (string, error) {
	trimmedAssignedProject := strings.TrimSpace(assignedProject)
	if trimmedAssignedProject == "" {
		return "", nil
	}

	project, err := queries.GetProjectByName(ctx, trimmedAssignedProject)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errAssignedProjectNotFound
		}
		return "", err
	}

	return project.ProjectName, nil
}

func respondToAssignedProjectError(c *gin.Context, err error) {
	if errors.Is(err, errAssignedProjectNotFound) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "assigned project must reference an existing project"})
		return
	}

	c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate assigned project"})
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
		deliveries, err := queries.GetRoutineMaintenanceNotificationDeliveriesForAsset(ctx, assetID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch routine maintenance notifications"})
			return
		}

		deliveriesByEvent := make(map[uuid.UUID][]dto.AssetMaintenanceNotificationDeliveryResponse, len(deliveries))
		for _, delivery := range deliveries {
			deliveriesByEvent[delivery.MaintenanceEventID] = append(deliveriesByEvent[delivery.MaintenanceEventID], dto.AssetMaintenanceNotificationDeliveryResponse{
				DeliveryID:         delivery.DeliveryID.String(),
				MaintenanceEventID: delivery.MaintenanceEventID.String(),
				Channel:            delivery.Channel,
				Status:             delivery.Status,
				ExternalID:         delivery.ExternalID,
				ErrorMessage:       delivery.ErrorMessage,
				CreatedAt:          delivery.CreatedAt,
				UpdatedAt:          delivery.UpdatedAt,
				SentAt:             delivery.SentAt,
				FailedAt:           delivery.FailedAt,
			})
		}

		response := make([]dto.AssetMaintenanceEventResponse, 0, len(events))
		for _, event := range events {
			notifications := deliveriesByEvent[event.MaintenanceEventID]
			if notifications == nil {
				notifications = []dto.AssetMaintenanceNotificationDeliveryResponse{}
			}
			response = append(response, dto.AssetMaintenanceEventResponse{
				MaintenanceEventID:  event.MaintenanceEventID.String(),
				DisplayID:           event.DisplayID,
				AssetID:             event.AssetID.String(),
				DueAtHours:          event.DueAtHours,
				TriggeredAtHours:    event.TriggeredAtHours,
				PreviousAssetStatus: event.PreviousAssetStatus,
				Status:              event.Status,
				CompletedAt:         event.CompletedAt,
				CompletionNotes:     event.CompletionNotes,
				CreatedAt:           event.CreatedAt,
				Notifications:       notifications,
			})
		}

		c.JSON(http.StatusOK, response)
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

func triggerRoutineMaintenanceIfDue(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], assetID uuid.UUID) (*db.AssetMaintenanceEvent, error) {
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

	notifyRoutineMaintenance(parent, pool, riverClient, event, asset.Name, asset.DisplayID)
	return &event, nil
}

func notifyRoutineMaintenance(parent context.Context, pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx], event db.AssetMaintenanceEvent, assetName, assetDisplayID string) {
	recipientEmail := os.Getenv("ALERT_RECIPIENT_EMAIL")
	recipientName := os.Getenv("ALERT_RECIPIENT_NAME")
	if recipientName == "" {
		recipientName = "Maintenance team"
	}

	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()

	tx, err := pool.Begin(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Str("maintenance_event_id", event.MaintenanceEventID.String()).Msg("failed to begin routine maintenance notification transaction")
		return
	}
	defer tx.Rollback(ctx)

	if riverClient == nil {
		recordRoutineMaintenanceNotificationConfigFailure(ctx, tx, event.MaintenanceEventID, utils.NotificationChannelEmail, "River client is not configured")
		recordRoutineMaintenanceNotificationConfigFailure(ctx, tx, event.MaintenanceEventID, utils.NotificationChannelClickUp, "River client is not configured")
		if err := tx.Commit(ctx); err != nil {
			logger.Log.Error().Err(err).Str("maintenance_event_id", event.MaintenanceEventID.String()).Msg("failed to commit routine maintenance notification failure")
		}
		return
	}

	if recipientEmail == "" {
		recordRoutineMaintenanceNotificationConfigFailure(ctx, tx, event.MaintenanceEventID, utils.NotificationChannelEmail, "ALERT_RECIPIENT_EMAIL not set")
	} else {
		subject, body := utils.RoutineMaintenanceEmailMessage(recipientName, assetName, assetDisplayID, event.TriggeredAtHours, event.DueAtHours)
		inserted, err := utils.EnqueueNotificationEmailTx(ctx, tx, riverClient, utils.NotificationDeliveryParams{
			SourceType:     utils.NotificationSourceRoutineMaintenance,
			SourceID:       event.MaintenanceEventID,
			Channel:        utils.NotificationChannelEmail,
			Tier:           "",
			IdempotencyKey: buildRoutineMaintenanceNotificationKey(event.MaintenanceEventID, utils.NotificationChannelEmail),
			Tags:           []string{"routine-maintenance", "email"},
		}, utils.NotificationEmailArgs{
			ToAddress: recipientEmail,
			Subject:   subject,
			Body:      body,
		})
		if err != nil {
			logger.Log.Error().Err(err).Str("maintenance_event_id", event.MaintenanceEventID.String()).Msg("failed to enqueue routine maintenance email")
		} else if !inserted {
			logger.Log.Info().Str("maintenance_event_id", event.MaintenanceEventID.String()).Msg("routine maintenance email delivery already claimed")
		}
	}

	if os.Getenv("CLICKUP_API_TOKEN") == "" || os.Getenv("CLICKUP_LIST_ID") == "" {
		recordRoutineMaintenanceNotificationConfigFailure(ctx, tx, event.MaintenanceEventID, utils.NotificationChannelClickUp, "CLICKUP_API_TOKEN or CLICKUP_LIST_ID not set")
	} else {
		clickUpPayload := utils.RoutineMaintenanceClickUpPayload(assetName, assetDisplayID, event.TriggeredAtHours, event.DueAtHours)
		inserted, err := utils.EnqueueNotificationClickUpTx(ctx, tx, riverClient, utils.NotificationDeliveryParams{
			SourceType:     utils.NotificationSourceRoutineMaintenance,
			SourceID:       event.MaintenanceEventID,
			Channel:        utils.NotificationChannelClickUp,
			Tier:           "",
			IdempotencyKey: buildRoutineMaintenanceNotificationKey(event.MaintenanceEventID, utils.NotificationChannelClickUp),
			Tags:           []string{"routine-maintenance", "clickup"},
		}, utils.NotificationClickUpArgs{
			Name:        clickUpPayload.Name,
			Description: clickUpPayload.Description,
			Priority:    clickUpPayload.Priority,
			DueAt:       time.UnixMilli(clickUpPayload.DueDate),
		})
		if err != nil {
			logger.Log.Error().Err(err).Str("maintenance_event_id", event.MaintenanceEventID.String()).Msg("failed to enqueue routine maintenance ClickUp task")
		} else if !inserted {
			logger.Log.Info().Str("maintenance_event_id", event.MaintenanceEventID.String()).Msg("routine maintenance ClickUp delivery already claimed")
		}
	}

	if err := tx.Commit(ctx); err != nil {
		logger.Log.Error().Err(err).Str("maintenance_event_id", event.MaintenanceEventID.String()).Msg("failed to commit routine maintenance notification enqueue")
		return
	}

	logger.Log.Info().
		Str("maintenance_event_id", event.MaintenanceEventID.String()).
		Msg("routine maintenance notifications enqueued")
}

func recordRoutineMaintenanceNotificationConfigFailure(ctx context.Context, tx pgx.Tx, maintenanceEventID uuid.UUID, channel, errorMessage string) {
	queries := db.New(tx)
	key := buildRoutineMaintenanceNotificationKey(maintenanceEventID, channel)
	delivery, err := queries.ClaimNotificationDelivery(ctx, db.ClaimNotificationDeliveryParams{
		SourceType:     utils.NotificationSourceRoutineMaintenance,
		SourceID:       maintenanceEventID,
		Channel:        channel,
		Tier:           "",
		IdempotencyKey: key,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return
	}
	if err != nil {
		logger.Log.Error().Err(err).Str("maintenance_event_id", maintenanceEventID.String()).Str("channel", channel).Msg("failed to claim routine maintenance failed notification delivery")
		return
	}
	if err := queries.MarkNotificationDeliveryFailed(ctx, db.MarkNotificationDeliveryFailedParams{
		DeliveryID:   delivery.DeliveryID,
		ErrorMessage: errorMessage,
	}); err != nil {
		logger.Log.Error().Err(err).Str("maintenance_event_id", maintenanceEventID.String()).Str("channel", channel).Msg("failed to mark routine maintenance notification delivery failed")
	}
}

func buildRoutineMaintenanceNotificationKey(maintenanceEventID uuid.UUID, channel string) string {
	return "routine-maintenance:" + maintenanceEventID.String() + ":" + channel
}

func assetInputMaintenanceInterval(input dto.AssetInput) int64 {
	if input.MaintenanceIntervalHours == nil {
		return 0
	}
	return *input.MaintenanceIntervalHours
}

func assetInputKind(input dto.AssetInput) string {
	if input.AssetKind == "" {
		return "COMPONENTIZED"
	}
	return input.AssetKind
}
