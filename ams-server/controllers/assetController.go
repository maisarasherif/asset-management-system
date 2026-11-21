package controllers

import (
	"context"
	"errors"
	"net/http"
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
	"github.com/maisarasherif/asset-management-system/ams-server/maintenance"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

var validate = validator.New()
var errAssignedProjectNotFound = errors.New("assigned project not found")

func GetAssets(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		filters := utils.ReadListFilters(c)
		search := filters.Text("search")
		filterProject := filters.Text("project")
		filterStatus := filters.Enum("status", "ACTIVE", "INACTIVE", "QUARANTINED")
		if !filters.Valid() {
			return
		}

		assets, err := queries.GetAllAssetsPaginated(ctx, db.GetAllAssetsPaginatedParams{
			SearchText: search, FilterProject: filterProject, FilterStatus: filterStatus,
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch assets"})
			return
		}

		total, err := queries.CountAssets(ctx, db.CountAssetsParams{SearchText: search, FilterProject: filterProject, FilterStatus: filterStatus})
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
				Name:            input.Name,
				Photo:           input.Photo,
				Datasheet:       input.Datasheet,
				Description:     input.Description,
				Status:          input.Status,
				Location:        input.Location,
				AssignedProject: assignedProject,
				TemplateID:      templateID,
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
				Name:            input.Name,
				Photo:           input.Photo,
				Datasheet:       input.Datasheet,
				Description:     input.Description,
				Status:          input.Status,
				AssetKind:       assetKind,
				Location:        input.Location,
				AssignedProject: assignedProject,
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
			Name:            input.Name,
			Photo:           input.Photo,
			Datasheet:       input.Datasheet,
			Description:     input.Description,
			Status:          input.Status,
			AssetKind:       assetKind,
			Location:        input.Location,
			AssignedProject: assignedProject,
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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin asset update"})
			return
		}
		defer tx.Rollback(ctx)
		queries := db.New(tx)
		if _, err := queries.LockMaintenanceAsset(ctx, assetID); err != nil {
			maintenanceResponse(c, http.StatusOK, nil, err)
			return
		}

		assignedProject, err := resolveAssetAssignedProject(ctx, queries, input.AssignedProject)
		if err != nil {
			respondToAssignedProjectError(c, err)
			return
		}

		_, err = queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:            input.Name,
			Photo:           input.Photo,
			Datasheet:       input.Datasheet,
			Description:     input.Description,
			Status:          input.Status,
			Location:        input.Location,
			AssignedProject: assignedProject,

			AssetID: assetID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			if !maintenanceRelatedConflict(c, err, false) {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			}
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset update"})
			return
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
			if !maintenanceRelatedConflict(c, err, true) {
				logger.Log.Error().Err(err).Str("asset_id", assetID.String()).Msg("Asset deletion failed")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete asset"})
			}
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

		tx, err := pool.Begin(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin asset update"})
			return
		}
		defer tx.Rollback(ctx)
		queries := db.New(tx)
		if _, err := queries.LockMaintenanceAsset(ctx, assetID); err != nil {
			maintenanceResponse(c, http.StatusOK, nil, err)
			return
		}

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

		_, err = queries.UpdateAsset(ctx, db.UpdateAssetParams{
			Name:            name,
			Photo:           photo,
			Datasheet:       datasheet,
			Description:     description,
			Status:          status,
			Location:        location,
			AssignedProject: assignedProject,

			AssetID: assetID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
				return
			}
			if !maintenanceRelatedConflict(c, err, false) {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update asset"})
			}
			return
		}

		if err := tx.Commit(ctx); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to commit asset update"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "asset updated successfully"})
	}
}

func UpdateAssetWorkingHours(service maintenance.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}
		var input dto.AssetWorkingHoursInput
		if !maintenanceInput(c, &input) {
			return
		}
		if input.WorkingHours == nil || *input.WorkingHours < 0 {
			maintenanceResponse(c, http.StatusOK, nil, maintenance.InputError("Enter nonnegative working hours"))
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		orders, err := service.SaveMeter(ctx, assetID, *input.WorkingHours, input.Note)
		if err != nil {
			maintenanceResponse(c, http.StatusOK, nil, err)
			return
		}
		asset, err := db.New(service.Pool).GetAssetByID(ctx, assetID)
		maintenanceResponse(c, http.StatusOK, gin.H{"asset": asset, "work_orders": orders}, err)
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

func assetInputKind(input dto.AssetInput) string {
	if input.AssetKind == "" {
		return "COMPONENTIZED"
	}
	return input.AssetKind
}

func GetAssetCertificateSummary(pool *pgxpool.Pool, client bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		assetID, ok := utils.ParseUUIDParam(c, "asset_id")
		if !ok {
			return
		}
		userID := uuid.Nil
		if client {
			userID, ok = requestUserID(c)
			if !ok {
				return
			}
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		summary, err := db.New(pool).GetAssetCertificateSummary(ctx, db.GetAssetCertificateSummaryParams{
			AssetID: assetID, ClientUserID: userID, AsOf: time.Now().Format(time.DateOnly),
		})
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load certificate totals."})
			return
		}
		c.JSON(http.StatusOK, summary)
	}
}
