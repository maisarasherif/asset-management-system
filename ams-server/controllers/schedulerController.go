package controllers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
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
				CertificateID:        task.CertificateID.String(),
				CertificateDisplayID: task.CertificateDisplayID,
				CertificateName:      task.CertificateName,
				ExpiryDate:           task.ExpiryDate,
				ComponentID:          task.ComponentID.String(),
				ComponentDisplayID:   task.ComponentDisplayID,
				ComponentName:        task.ComponentName,
				AssetID:              task.AssetID.String(),
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
				CertificateID:        failure.CertificateID.String(),
				CertificateDisplayID: failure.CertificateDisplayID,
				CertificateName:      failure.CertificateName,
				ExpiryDate:           failure.ExpiryDate,
				ComponentID:          failure.ComponentID.String(),
				ComponentDisplayID:   failure.ComponentDisplayID,
				ComponentName:        failure.ComponentName,
				AssetID:              failure.AssetID.String(),
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
