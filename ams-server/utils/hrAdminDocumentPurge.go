package utils

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/riverqueue/river"
)

const HRAdminDocumentPurgeQueue = "hr_admin_documents"

type HRAdminDocumentPurgeArgs struct {
	ObjectKey string `json:"object_key"`
}

func (HRAdminDocumentPurgeArgs) Kind() string { return "hr_admin_document_purge" }

type HRAdminDocumentPurgeWorker struct {
	river.WorkerDefaults[HRAdminDocumentPurgeArgs]
	pool *pgxpool.Pool
}

func (w *HRAdminDocumentPurgeWorker) Work(ctx context.Context, job *river.Job[HRAdminDocumentPurgeArgs]) error {
	key := job.Args.ObjectKey
	if !IsHRAdminDocumentKey(key) {
		return errors.New("document purge requires an HR/Admin upload key")
	}
	queries := db.New(w.pool)
	pending, err := queries.IsHRAdminDocumentPurgePending(ctx, key)
	if err != nil || !pending {
		return err
	}
	if err := DeleteStoredObject(ctx, key); err != nil {
		return err
	}
	return queries.FinishHRAdminDocumentPurge(ctx, key)
}
