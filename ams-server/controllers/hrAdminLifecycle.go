package controllers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"github.com/riverqueue/river"
)

func lockHRAdminSubject(ctx context.Context, queries *db.Queries, subjectType string, id uuid.UUID) (string, string, error) {
	switch subjectType {
	case "PERSON":
		row, err := queries.LockHRAdminPerson(ctx, id)
		return row.DisplayID, row.Status, err
	case "VEHICLE":
		row, err := queries.LockHRAdminVehicle(ctx, id)
		return row.DisplayID, row.Status, err
	case "COMPANY":
		row, err := queries.LockHRAdminCompany(ctx, id)
		return row.DisplayID, row.Status, err
	default:
		return "", "", errors.New("invalid subject type")
	}
}

func lifecycleFailure(c *gin.Context, err error) {
	logger.Log.Error().Err(err).Msg("HR/Admin lifecycle change failed")
	c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not complete the HR/Admin change."})
}

func readDeletionReason(c *gin.Context) (string, bool) {
	var input struct {
		Reason string `json:"reason"`
	}
	err := c.ShouldBindJSON(&input)
	input.Reason = strings.TrimSpace(input.Reason)
	if err != nil || validate.Var(input.Reason, "min=3,max=500") != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a deletion reason of 3 to 500 characters."})
		return "", false
	}
	return input.Reason, true
}

func archiveSubject(ctx context.Context, queries *db.Queries, kind string, id uuid.UUID, reason string, actor *uuid.UUID) error {
	switch kind {
	case "PERSON":
		_, err := queries.ArchiveHRAdminPerson(ctx, db.ArchiveHRAdminPersonParams{PersonID: id, ArchiveReason: reason, ArchivedBy: actor})
		return err
	case "VEHICLE":
		_, err := queries.ArchiveHRAdminVehicle(ctx, db.ArchiveHRAdminVehicleParams{VehicleID: id, ArchiveReason: reason, ArchivedBy: actor})
		return err
	default:
		_, err := queries.ArchiveHRAdminCompany(ctx, db.ArchiveHRAdminCompanyParams{CompanyID: id, ArchiveReason: reason, ArchivedBy: actor})
		return err
	}
}

func deleteSubject(ctx context.Context, queries *db.Queries, kind string, id uuid.UUID) error {
	switch kind {
	case "PERSON":
		return queries.DeleteArchivedHRAdminPerson(ctx, id)
	case "VEHICLE":
		return queries.DeleteArchivedHRAdminVehicle(ctx, id)
	default:
		return queries.DeleteArchivedHRAdminCompany(ctx, id)
	}
}

func ChangeHRAdminSubjectLifecycle(pool *pgxpool.Pool, kind, param string, permanent bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := utils.ParseUUIDParam(c, param)
		if !ok {
			return
		}
		actor := actorUUID(c)
		if actor == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authenticated actor required."})
			return
		}
		var reason string
		if permanent {
			reason, ok = readDeletionReason(c)
			if !ok {
				return
			}
		} else {
			var input dto.ArchiveInput
			if err := c.ShouldBindJSON(&input); err != nil || validate.Struct(input) != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Enter an archive reason of 3 to 500 characters."})
				return
			}
			reason = input.ArchiveReason
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		tx, err := pool.Begin(ctx)
		if err != nil {
			lifecycleFailure(c, err)
			return
		}
		defer tx.Rollback(ctx)
		queries := db.New(tx)
		displayID, status, err := lockHRAdminSubject(ctx, queries, kind, id)
		name := strings.ToLower(kind)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			c.JSON(http.StatusNotFound, gin.H{"error": "HR/Admin " + name + " not found"})
			return
		case err != nil:
			lifecycleFailure(c, err)
			return
		case permanent && status != "ARCHIVED":
			c.JSON(http.StatusConflict, gin.H{"error": "Archive this " + name + " before deleting it."})
			return
		case !permanent && status != "ACTIVE":
			c.JSON(http.StatusNotFound, gin.H{"error": "active HR/Admin " + name + " not found"})
			return
		}
		count, err := queries.CountHRAdminLinkedRecords(ctx, db.CountHRAdminLinkedRecordsParams{
			SubjectType: kind, SubjectID: id, ActiveOnly: !permanent,
		})
		if err != nil {
			lifecycleFailure(c, err)
			return
		}
		if count > 0 {
			message := fmt.Sprintf("Linked active compliance records: %d. Archive them before archiving this %s.", count, name)
			if permanent {
				message = fmt.Sprintf("Linked compliance records: %d. Permanently delete them before deleting this %s.", count, name)
			}
			c.JSON(http.StatusConflict, gin.H{"error": message, "linked_record_count": count})
			return
		}

		if permanent {
			err = deleteSubject(ctx, queries, kind, id)
			if err == nil {
				err = queries.WriteHRAdminDeletionAudit(ctx, db.WriteHRAdminDeletionAuditParams{
					ItemType: kind, ItemID: id, DisplayID: displayID, DeletedBy: *actor, Reason: reason,
				})
			}
		} else {
			err = archiveSubject(ctx, queries, kind, id, reason, actor)
		}
		if err != nil {
			lifecycleFailure(c, err)
			return
		}
		if err = tx.Commit(ctx); err != nil {
			lifecycleFailure(c, err)
			return
		}
		if permanent {
			c.JSON(http.StatusOK, gin.H{"message": "HR/Admin " + name + " permanently deleted"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "HR/Admin " + name + " archived successfully"})
	}
}

func checkHRAdminDocumentForAttachment(c *gin.Context, ctx context.Context, queries *db.Queries, key string) bool {
	// Legacy keys remain attachable. Only uploads owned by HR/Admin can be purged.
	if !utils.IsHRAdminDocumentKey(key) {
		return true
	}
	row, err := queries.LockHRAdminDocument(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.PurgeRequestedAt != nil) {
		c.JSON(http.StatusConflict, gin.H{"error": "This compliance document is unavailable. Upload a replacement."})
		return false
	}
	if err != nil {
		lifecycleFailure(c, err)
		return false
	}
	return true
}

func DeleteArchivedComplianceRecord(pool *pgxpool.Pool, riverClient *river.Client[pgx.Tx]) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := utils.ParseUUIDParam(c, "record_id")
		if !ok {
			return
		}
		actor := actorUUID(c)
		if actor == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authenticated actor required."})
			return
		}
		reason, ok := readDeletionReason(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		tx, err := pool.Begin(ctx)
		if err != nil {
			lifecycleFailure(c, err)
			return
		}
		defer tx.Rollback(ctx)
		queries := db.New(tx)
		record, err := queries.LockComplianceRecord(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "compliance record not found"})
			return
		}
		if err != nil {
			lifecycleFailure(c, err)
			return
		}
		if record.Status != "ARCHIVED" {
			c.JSON(http.StatusConflict, gin.H{"error": "Archive this compliance record before deleting it."})
			return
		}

		keys, err := queries.ListComplianceRecordDocumentKeys(ctx, id)
		if err != nil {
			lifecycleFailure(c, err)
			return
		}
		managed := make([]string, 0, len(keys))
		for _, key := range keys {
			if _, err = queries.LockHRAdminDocument(ctx, key); errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			if err != nil {
				lifecycleFailure(c, err)
				return
			}
			managed = append(managed, key)
		}
		if err = queries.DeleteArchivedComplianceRecord(ctx, id); err != nil {
			lifecycleFailure(c, err)
			return
		}
		if err = queries.WriteHRAdminDeletionAudit(ctx, db.WriteHRAdminDeletionAuditParams{
			ItemType: "COMPLIANCE_RECORD", ItemID: id, DisplayID: record.DisplayID, DeletedBy: *actor, Reason: reason,
		}); err != nil {
			lifecycleFailure(c, err)
			return
		}
		queued := 0
		for _, key := range managed {
			changed, err := queries.RequestHRAdminDocumentPurge(ctx, key)
			if err != nil {
				lifecycleFailure(c, err)
				return
			}
			if changed == 0 {
				continue
			}
			if riverClient == nil {
				lifecycleFailure(c, errors.New("document purge queue unavailable"))
				return
			}
			_, err = riverClient.InsertTx(ctx, tx, utils.HRAdminDocumentPurgeArgs{ObjectKey: key},
				&river.InsertOpts{Queue: utils.HRAdminDocumentPurgeQueue})
			if err != nil {
				lifecycleFailure(c, err)
				return
			}
			queued++
		}
		if err = tx.Commit(ctx); err != nil {
			lifecycleFailure(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message": "compliance record permanently deleted", "queued_document_count": queued,
			"retained_legacy_document_count": len(keys) - len(managed),
		})
	}
}
