package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"github.com/riverqueue/river"
)

func GetCertificateNotificationTasks(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		tasks, err := queries.GetCertificateNotificationDeliveriesPaginated(ctx, db.GetCertificateNotificationDeliveriesPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate notification tasks"})
			return
		}

		total, err := queries.CountCertificateNotificationDeliveries(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count certificate notification tasks"})
			return
		}

		response := make([]dto.CertificateNotificationTaskResponse, len(tasks))
		for i, task := range tasks {
			sentAt := time.Time{}
			if task.SentAt != nil {
				sentAt = *task.SentAt
			}
			response[i] = dto.CertificateNotificationTaskResponse{
				TaskID:               task.TaskID.String(),
				DisplayID:            task.DisplayID,
				SourceType:           task.SourceType,
				SourceID:             task.SourceID,
				SourceDisplayID:      task.SourceDisplayID,
				SourceName:           task.SourceName,
				CertificateID:        task.CertificateID,
				CertificateDisplayID: task.CertificateDisplayID,
				CertificateName:      task.CertificateName,
				ExpiryDate:           task.ExpiryDate,
				ComponentID:          task.ComponentID,
				ComponentDisplayID:   task.ComponentDisplayID,
				ComponentName:        task.ComponentName,
				AssetID:              task.AssetID,
				AssetDisplayID:       task.AssetDisplayID,
				AssetName:            task.AssetName,
				Type:                 task.Type,
				Tier:                 task.Tier,
				Status:               task.Status,
				ExternalTaskID:       task.ExternalTaskID,
				IdempotencyKey:       task.IdempotencyKey,
				SentAt:               sentAt,
			}
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: response,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetHRAdminNotificationTasks(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		tasks, err := queries.GetHRAdminNotificationDeliveriesPaginated(ctx, db.GetHRAdminNotificationDeliveriesPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch HR/Admin notification tasks"})
			return
		}

		total, err := queries.CountHRAdminNotificationDeliveries(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count HR/Admin notification tasks"})
			return
		}

		response := make([]dto.CertificateNotificationTaskResponse, len(tasks))
		for i, task := range tasks {
			sentAt := time.Time{}
			if task.SentAt != nil {
				sentAt = *task.SentAt
			}
			response[i] = dto.CertificateNotificationTaskResponse{
				TaskID:               task.TaskID.String(),
				DisplayID:            task.DisplayID,
				SourceType:           task.SourceType,
				SourceID:             task.SourceID,
				SourceDisplayID:      task.SourceDisplayID,
				SourceName:           task.SourceName,
				CertificateID:        task.CertificateID,
				CertificateDisplayID: task.CertificateDisplayID,
				CertificateName:      task.CertificateName,
				ExpiryDate:           task.ExpiryDate,
				ComponentID:          task.ComponentID,
				ComponentDisplayID:   task.ComponentDisplayID,
				ComponentName:        task.ComponentName,
				AssetID:              task.AssetID,
				AssetDisplayID:       task.AssetDisplayID,
				AssetName:            task.AssetName,
				Type:                 task.Type,
				Tier:                 task.Tier,
				Status:               task.Status,
				ExternalTaskID:       task.ExternalTaskID,
				IdempotencyKey:       task.IdempotencyKey,
				SentAt:               sentAt,
			}
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: response,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetCertificateNotificationFailures(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		failures, err := queries.GetCertificateNotificationDeliveryFailuresPaginated(ctx, db.GetCertificateNotificationDeliveryFailuresPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch certificate notification failures"})
			return
		}

		total, err := queries.CountCertificateNotificationDeliveryFailures(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count certificate notification failures"})
			return
		}

		response := make([]dto.CertificateNotificationFailureResponse, len(failures))
		for i, failure := range failures {
			failedAt := time.Time{}
			if failure.FailedAt != nil {
				failedAt = *failure.FailedAt
			}
			response[i] = dto.CertificateNotificationFailureResponse{
				ID:                   failure.ID.String(),
				SourceType:           failure.SourceType,
				SourceID:             failure.SourceID,
				SourceDisplayID:      failure.SourceDisplayID,
				SourceName:           failure.SourceName,
				CertificateID:        failure.CertificateID,
				CertificateDisplayID: failure.CertificateDisplayID,
				CertificateName:      failure.CertificateName,
				ExpiryDate:           failure.ExpiryDate,
				ComponentID:          failure.ComponentID,
				ComponentDisplayID:   failure.ComponentDisplayID,
				ComponentName:        failure.ComponentName,
				AssetID:              failure.AssetID,
				AssetDisplayID:       failure.AssetDisplayID,
				AssetName:            failure.AssetName,
				IdempotencyKey:       failure.IdempotencyKey,
				Channel:              failure.Channel,
				Tier:                 failure.Tier,
				ErrorMessage:         failure.ErrorMessage,
				FailedAt:             failedAt,
			}
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: response,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetHRAdminNotificationFailures(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		failures, err := queries.GetHRAdminNotificationDeliveryFailuresPaginated(ctx, db.GetHRAdminNotificationDeliveryFailuresPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch HR/Admin notification failures"})
			return
		}

		total, err := queries.CountHRAdminNotificationDeliveryFailures(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count HR/Admin notification failures"})
			return
		}

		response := make([]dto.CertificateNotificationFailureResponse, len(failures))
		for i, failure := range failures {
			failedAt := time.Time{}
			if failure.FailedAt != nil {
				failedAt = *failure.FailedAt
			}
			response[i] = dto.CertificateNotificationFailureResponse{
				ID:                   failure.ID.String(),
				SourceType:           failure.SourceType,
				SourceID:             failure.SourceID,
				SourceDisplayID:      failure.SourceDisplayID,
				SourceName:           failure.SourceName,
				CertificateID:        failure.CertificateID,
				CertificateDisplayID: failure.CertificateDisplayID,
				CertificateName:      failure.CertificateName,
				ExpiryDate:           failure.ExpiryDate,
				ComponentID:          failure.ComponentID,
				ComponentDisplayID:   failure.ComponentDisplayID,
				ComponentName:        failure.ComponentName,
				AssetID:              failure.AssetID,
				AssetDisplayID:       failure.AssetDisplayID,
				AssetName:            failure.AssetName,
				IdempotencyKey:       failure.IdempotencyKey,
				Channel:              failure.Channel,
				Tier:                 failure.Tier,
				ErrorMessage:         failure.ErrorMessage,
				FailedAt:             failedAt,
			}
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: response,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func RunCertificateExpiryScheduler(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) gin.HandlerFunc {
	return func(c *gin.Context) {
		processed, err := utils.RunExpiryCheck(c.Request.Context(), pool, riverClient)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to run certificate expiry scheduler"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":                "certificate expiry scheduler run completed",
			"processed_certificates": processed,
		})
	}
}

func RunHRAdminReminderScheduler(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) gin.HandlerFunc {
	return func(c *gin.Context) {
		processed, err := utils.RunHRAdminReminderCheck(c.Request.Context(), pool, riverClient)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to run HR/Admin reminder scheduler"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":           "HR/Admin reminder scheduler run completed",
			"processed_records": processed,
		})
	}
}
