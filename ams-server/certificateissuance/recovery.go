package certificateissuance

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

var ErrIssuanceAbandoned = errors.New("this approval was abandoned and cannot be retried")
var ErrIssuanceCompleted = errors.New("a completed certificate cannot be abandoned or deleted")
var ErrIssuanceBusy = errors.New("this approval is still processing; refresh its history before trying again")
var ErrIssuanceCleanup = errors.New("the approval is abandoned but its unissued file could not be deleted; retry file deletion")
var ErrOriginalFileRequired = errors.New("storage has no approved external file; choose the same original renewal file and retry")

func (s Issuances) recoveryRow(ctx context.Context, actor, certificate, id uuid.UUID, retry bool) (db.CertificateIssuance, error) {
	role, err := s.Previews.Management.actorRole(ctx, actor, false)
	if err != nil {
		return db.CertificateIssuance{}, err
	}
	row, err := db.New(s.Pool).GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: certificate, IssuanceID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return row, ErrNotFound
	}
	if err != nil {
		return row, err
	}
	if role != "SUPER_ADMIN" && row.ActorID != actor {
		return db.CertificateIssuance{}, ErrIssuerForbidden
	}
	if retry && role == "ADMIN" && row.Source == "GENERATED" {
		var snapshot Snapshot
		if json.Unmarshal(row.Snapshot, &snapshot) != nil || snapshot.Signer.OwnerKind != "ACCOUNT" || snapshot.Signer.SignerID != actor {
			return db.CertificateIssuance{}, ErrIssuerForbidden
		}
	}
	return row, nil
}

// Retry resumes the saved approval, never consulting an expired preview token or allocating a number.
// External bytes are optional when storage already contains the approved document.
func (s Issuances) Retry(ctx context.Context, actor, certificate, id uuid.UUID, original []byte) (Issuance, error) {
	row, err := s.recoveryRow(ctx, actor, certificate, id, true)
	if err != nil {
		return Issuance{}, err
	}
	if len(original) > 0 && (row.Source != "EXTERNAL" || !matchesDocument(original, row.DocumentSha256, row.DocumentSize)) {
		return Issuance{}, ErrApprovalMismatch
	}
	return s.processDocument(ctx, row, original)
}

func (s Issuances) Abandon(ctx context.Context, actor, certificate, id uuid.UUID) (Issuance, error) {
	row, err := s.recoveryRow(ctx, actor, certificate, id, false)
	if err != nil {
		return Issuance{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Issuance{}, err
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)
	// Fence role/status changes while the irreversible abandonment is saved.
	var role, status string
	if err = tx.QueryRow(ctx, "SELECT role, status FROM users WHERE user_id=$1 FOR SHARE", actor).Scan(&role, &status); err != nil {
		return Issuance{}, ErrIssuerForbidden
	}
	if status != "ACTIVE" || (role != "SUPER_ADMIN" && (role != "ADMIN" || row.ActorID != actor)) {
		return Issuance{}, ErrIssuerForbidden
	}
	row, err = q.LockIssuanceForRecovery(ctx, db.LockIssuanceForRecoveryParams{CertificateID: certificate, IssuanceID: id})
	if err != nil {
		return Issuance{}, err
	}
	if row.State == "COMPLETED" {
		return Issuance{}, ErrIssuanceCompleted
	}
	if row.State == "PROCESSING" && (row.LeaseUntil == nil || row.LeaseUntil.After(time.Now())) {
		return Issuance{}, ErrIssuanceBusy
	}
	// Same lock order as publication: issuance before the current certificate.
	if _, err = q.LockCertificateForApproval(ctx, certificate); err != nil {
		return Issuance{}, err
	}
	referenced, err := q.IssuanceDocumentReferenced(ctx, row.FileKey)
	if err != nil {
		return Issuance{}, err
	}
	if !referenced.Valid || referenced.Bool {
		return Issuance{}, ErrIssuanceCompleted
	}
	if row.State != "ABANDONED" {
		row, err = q.AbandonCertificateIssuance(ctx, db.AbandonCertificateIssuanceParams{IssuanceID: id, AbandonedBy: &actor})
		if errors.Is(err, pgx.ErrNoRows) {
			return Issuance{}, ErrIssuanceBusy
		}
		if err != nil {
			return Issuance{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Issuance{}, err
	}
	return s.cleanup(ctx, row)
}

func (s Issuances) RetryCleanup(ctx context.Context, actor, certificate, id uuid.UUID) (Issuance, error) {
	row, err := s.recoveryRow(ctx, actor, certificate, id, false)
	if err != nil {
		return Issuance{}, err
	}
	if row.State != "ABANDONED" {
		return Issuance{}, ErrIssuanceCompleted
	}
	return s.cleanup(ctx, row)
}

func (s Issuances) cleanup(ctx context.Context, row db.CertificateIssuance) (Issuance, error) {
	q := db.New(s.Pool)
	attempt := uuid.New()
	claimed, err := q.ClaimIssuanceCleanup(ctx, db.ClaimIssuanceCleanupParams{IssuanceID: row.IssuanceID, AttemptID: &attempt})
	if errors.Is(err, pgx.ErrNoRows) {
		current, err := q.GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{CertificateID: row.CertificateID, IssuanceID: row.IssuanceID})
		if err != nil {
			return Issuance{}, err
		}
		return PublicIssuance(current)
	}
	if err != nil {
		return Issuance{}, err
	}
	row = claimed
	referenced, err := q.IssuanceDocumentReferenced(ctx, row.FileKey)
	if err == nil && (!referenced.Valid || referenced.Bool) {
		err = ErrIssuanceCompleted
	}
	if err == nil {
		err = s.Documents.Delete(ctx, row.FileKey)
	}
	state, code := "DELETED", ""
	if err != nil {
		state, code = "FAILED", "STORAGE_DELETE"
	}
	// Persist cleanup acknowledgement/failure even if the HTTP client disconnected.
	recovery, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	affected, markErr := q.FinishIssuanceCleanup(recovery, db.FinishIssuanceCleanupParams{IssuanceID: row.IssuanceID, AttemptID: &attempt, CleanupState: state, CleanupFailureCode: code, CleanupGeneration: row.CleanupGeneration})
	if markErr == nil && affected != 1 {
		markErr = ErrIssuanceBusy
	}
	current, readErr := q.GetCertificateIssuance(recovery, db.GetCertificateIssuanceParams{CertificateID: row.CertificateID, IssuanceID: row.IssuanceID})
	if readErr == nil {
		row = current
	}
	result, publicErr := PublicIssuance(row)
	if err != nil || markErr != nil || readErr != nil {
		return result, errors.Join(ErrIssuanceCleanup, err, markErr, readErr, publicErr)
	}
	return result, publicErr
}
