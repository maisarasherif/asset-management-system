package certificateissuance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

var ErrIssuanceFailed = errors.New("issuance was approved but could not finish; its number is retained and the current certificate is unchanged")
var ErrIssuanceConflict = errors.New("the certificate changed after approval; this issuance cannot replace its current document")
var ErrDocumentMissing = errors.New("issued object not found")

const MaxDocumentBytes = 16 * 1024 * 1024

type DocumentStore interface {
	PrepareKey(uuid.UUID, uuid.UUID) (string, error)
	// Put creates an object only if absent; an existing document must never be overwritten.
	Put(context.Context, string, []byte) error
	Read(context.Context, string) ([]byte, error)
}
type Issuances struct {
	Pool      *pgxpool.Pool
	Previews  Previews
	Documents DocumentStore
}
type Issuance struct {
	ID            uuid.UUID  `json:"issuance_id"`
	CertificateID uuid.UUID  `json:"certificate_id"`
	Source        string     `json:"source"`
	ActorID       uuid.UUID  `json:"actor_id"`
	Number        string     `json:"document_number"`
	State         string     `json:"state"`
	IssueDate     string     `json:"issue_date"`
	ExpiryDate    string     `json:"expiry_date"`
	Snapshot      Snapshot   `json:"snapshot"`
	SHA256        string     `json:"document_sha256"`
	Size          int64      `json:"document_size"`
	FailureCode   string     `json:"failure_code"`
	ApprovedAt    time.Time  `json:"approved_at"`
	CompletedAt   *time.Time `json:"completed_at"`
}

func PublicIssuance(row db.CertificateIssuance) (Issuance, error) {
	var snapshot Snapshot
	if err := json.Unmarshal(row.Snapshot, &snapshot); err != nil {
		return Issuance{}, err
	}
	expiry := ""
	if row.ExpiryDate.Valid {
		expiry = row.ExpiryDate.Time.Format("2006-01-02")
	}
	return Issuance{ID: row.IssuanceID, CertificateID: row.CertificateID, Source: row.Source, ActorID: row.ActorID,
		Number: row.DocumentNumber.String, State: row.State, IssueDate: row.IssueDate.Time.Format("2006-01-02"), ExpiryDate: expiry,
		Snapshot: snapshot, SHA256: row.DocumentSha256, Size: row.DocumentSize, FailureCode: row.FailureCode,
		ApprovedAt: row.ApprovedAt, CompletedAt: row.CompletedAt}, nil
}
func dateValue(value string) pgtype.Date {
	t, err := time.Parse("2006-01-02", value)
	return pgtype.Date{Time: t, Valid: err == nil}
}
func serializationFailure(err error) bool {
	var postgres *pgconn.PgError
	return errors.As(err, &postgres) && (postgres.Code == "40001" || postgres.Code == "40P01")
}
func (s Issuances) approved(ctx context.Context, actor, certificate uuid.UUID, raw string) (db.CertificateIssuance, error) {
	if _, err := s.Previews.Management.actorRole(ctx, actor, false); err != nil {
		return db.CertificateIssuance{}, err
	}
	identity, err := verifyPreview(s.Previews.Secret, raw, actor, certificate, time.Now(), true)
	if err != nil {
		return db.CertificateIssuance{}, err
	}
	approval, err := uuid.Parse(identity.ID)
	if err != nil {
		return db.CertificateIssuance{}, ErrPreviewToken
	}
	// This transaction never renders, reads images, or uploads documents.
	for retry := 0; retry < 5; retry++ {
		row, err := s.approveTransaction(ctx, actor, certificate, approval, raw, identity.Snapshot)
		if !serializationFailure(err) {
			return row, err
		}
		if ctx.Err() != nil {
			return row, ctx.Err()
		}
	}
	return db.CertificateIssuance{}, ErrPreviewChanged
}
func (s Issuances) approveTransaction(ctx context.Context, actor, certificate, approval uuid.UUID, raw string, snapshot Snapshot) (db.CertificateIssuance, error) {
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return db.CertificateIssuance{}, err
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)
	manager := s.Previews.Management
	manager.Pool = tx
	role, err := manager.actorRole(ctx, actor, false)
	if err != nil {
		return db.CertificateIssuance{}, err
	}
	if role == "ADMIN" && (snapshot.Signer.OwnerKind != "ACCOUNT" || snapshot.Signer.SignerID != actor) {
		return db.CertificateIssuance{}, ErrIssuerForbidden
	}
	version, err := q.LockCertificateForApproval(ctx, certificate)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.CertificateIssuance{}, ErrSigningProfileNotFound
	}
	if err != nil {
		return db.CertificateIssuance{}, err
	}
	existing, err := q.GetCertificateIssuanceByApproval(ctx, approval)
	if err == nil {
		var saved Snapshot
		if json.Unmarshal(existing.Snapshot, &saved) != nil {
			return existing, ErrPreviewToken
		}
		a, _ := json.Marshal(saved)
		b, _ := json.Marshal(snapshot)
		if existing.ActorID != actor || existing.CertificateID != certificate || !bytes.Equal(a, b) {
			return existing, ErrPreviewToken
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return existing, err
	}
	preview := s.Previews
	preview.Management.Pool = tx
	if _, err = preview.Validate(ctx, actor, certificate, raw); err != nil {
		return existing, err
	}
	issue, expiry := dateValue(snapshot.IssueDate), dateValue(snapshot.ExpiryDate)
	sequence, err := q.AllocateCertificateNumber(ctx, db.AllocateCertificateNumberParams{ComponentID: snapshot.ComponentID, IssueDate: issue})
	if err != nil {
		return existing, err
	}
	id := uuid.New()
	key, err := s.Documents.PrepareKey(id, certificate)
	if err != nil {
		return existing, errors.Join(ErrIssuanceFailed, err)
	}
	data, err := json.Marshal(snapshot)
	if err != nil {
		return existing, err
	}
	row, err := q.InsertGeneratedIssuance(ctx, db.InsertGeneratedIssuanceParams{
		IssuanceID: id, ApprovalID: approval, CertificateID: certificate, ComponentID: snapshot.ComponentID, ActorID: actor,
		SignatureID: &snapshot.Signer.Signature.ID, DocumentNumber: pgtype.Text{String: DocumentNumber(snapshot, fmt.Sprintf("%02d", sequence)), Valid: true},
		Sequence: pgtype.Int8{Int64: sequence, Valid: true}, IssueDate: issue, ExpiryDate: expiry, Snapshot: data, BaseVersion: version, FileKey: key,
	})
	if err != nil {
		return row, err
	}
	return row, tx.Commit(ctx)
}

func (s Issuances) Approve(ctx context.Context, actor, certificate uuid.UUID, token string) (Issuance, error) {
	row, err := s.approved(ctx, actor, certificate, token)
	if err != nil {
		return Issuance{}, err
	}
	return s.process(ctx, row)
}
func (s Issuances) process(ctx context.Context, row db.CertificateIssuance) (Issuance, error) {
	q := db.New(s.Pool)
	if row.State == "COMPLETED" || row.State == "ABANDONED" {
		return PublicIssuance(row)
	}
	attempt := uuid.New()
	claimed, err := q.ClaimCertificateIssuance(ctx, db.ClaimCertificateIssuanceParams{IssuanceID: row.IssuanceID, AttemptID: &attempt})
	if errors.Is(err, pgx.ErrNoRows) {
		current, readErr := q.GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{IssuanceID: row.IssuanceID, CertificateID: row.CertificateID})
		if readErr != nil {
			return Issuance{}, readErr
		}
		return PublicIssuance(current)
	}
	if err != nil {
		result, _ := PublicIssuance(row)
		return result, errors.Join(ErrIssuanceFailed, err)
	}
	row = claimed
	fail := func(code string, cause error) (Issuance, error) {
		if errors.Is(cause, ErrIssuanceConflict) {
			code = "STALE_CERTIFICATE"
		}
		// The HTTP request may have timed out; retain failure independently of its cancellation.
		recovery, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, markErr := q.FailCertificateIssuance(recovery, db.FailCertificateIssuanceParams{IssuanceID: row.IssuanceID, AttemptID: &attempt, FailureCode: code})
		current, readErr := q.GetCertificateIssuance(recovery, db.GetCertificateIssuanceParams{IssuanceID: row.IssuanceID, CertificateID: row.CertificateID})
		if readErr == nil {
			row = current
		}
		if row.State == "COMPLETED" {
			return PublicIssuance(row)
		}
		result, _ := PublicIssuance(row)
		return result, errors.Join(ErrIssuanceFailed, cause, markErr)
	}
	var snapshot Snapshot
	if err := json.Unmarshal(row.Snapshot, &snapshot); err != nil || snapshot.SchemaVersion != SnapshotVersion || snapshot.TemplateVersion != TemplateVersion {
		return fail("SNAPSHOT", ErrPreviewToken)
	}
	// Refuse old approved work before expensive rendering and again atomically on publication.
	source, err := q.GetCertificatePreviewSource(ctx, row.CertificateID)
	if err != nil || source.RenewalVersion != row.BaseVersion {
		return fail("STALE_CERTIFICATE", ErrIssuanceConflict)
	}
	data, err := s.Documents.Read(ctx, row.FileKey)
	if err != nil && !errors.Is(err, ErrDocumentMissing) {
		return fail("STORAGE_READ", err)
	}
	if errors.Is(err, ErrDocumentMissing) {
		signature, err := q.GetIssuanceSignature(ctx, *row.SignatureID)
		if err != nil || signature.OwnerID != snapshot.Signer.SignerID || signature.OwnerKind != snapshot.Signer.OwnerKind || signature.Sha256 != snapshot.Signer.Signature.SHA256 || signature.ByteSize != snapshot.Signer.Signature.ByteSize {
			return fail("SIGNATURE", errors.Join(ErrStorage, err))
		}
		image, err := s.Previews.Management.Store.Read(ctx, signature.FileKey)
		if err != nil || !matchesDocument(image, signature.Sha256, signature.ByteSize) {
			return fail("SIGNATURE", errors.Join(ErrStorage, err))
		}
		data, err = s.Previews.Renderer.Render(ctx, snapshot, row.DocumentNumber.String, image)
		if err != nil {
			return fail("RENDER", err)
		}
		if len(data) == 0 || len(data) > MaxDocumentBytes || !bytes.HasPrefix(data, []byte("%PDF-")) {
			return fail("RENDER", ErrPreviewInput)
		}
		digest := sha256.Sum256(data)
		row.DocumentSha256 = hex.EncodeToString(digest[:])
		row.DocumentSize = int64(len(data))
		n, err := q.RecordIssuanceDocument(ctx, db.RecordIssuanceDocumentParams{IssuanceID: row.IssuanceID, AttemptID: &attempt, DocumentSha256: row.DocumentSha256, DocumentSize: row.DocumentSize})
		if err != nil || n != 1 {
			return fail("DOCUMENT_METADATA", errors.Join(ErrIssuanceConflict, err))
		}
		if err := s.Documents.Put(ctx, row.FileKey, data); err != nil {
			return fail("STORAGE_WRITE", err)
		}
		data, err = s.Documents.Read(ctx, row.FileKey)
		if err != nil {
			return fail("STORAGE_VERIFY", err)
		}
	}
	if !matchesDocument(data, row.DocumentSha256, row.DocumentSize) {
		return fail("DOCUMENT_INTEGRITY", ErrIssuanceFailed)
	}
	if err := s.publish(ctx, row, attempt); err != nil {
		return fail("PUBLICATION", err)
	}
	completed, err := q.GetCertificateIssuance(ctx, db.GetCertificateIssuanceParams{IssuanceID: row.IssuanceID, CertificateID: row.CertificateID})
	if err != nil {
		return fail("PUBLICATION_CONFIRMATION", err)
	}
	return PublicIssuance(completed)
}
func matchesDocument(data []byte, digest string, size int64) bool {
	actual := sha256.Sum256(data)
	return size > 0 && int64(len(data)) == size && hex.EncodeToString(actual[:]) == digest
}
func (s Issuances) publish(ctx context.Context, row db.CertificateIssuance, attempt uuid.UUID) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)
	manager := s.Previews.Management
	manager.Pool = tx
	role, err := manager.actorRole(ctx, row.ActorID, false)
	if err != nil {
		return err
	}
	var snapshot Snapshot
	if err := json.Unmarshal(row.Snapshot, &snapshot); err != nil {
		return err
	}
	if role == "ADMIN" && (snapshot.Signer.OwnerKind != "ACCOUNT" || snapshot.Signer.SignerID != row.ActorID) {
		return ErrIssuerForbidden
	}
	if _, err := q.LockProcessingIssuance(ctx, db.LockProcessingIssuanceParams{IssuanceID: row.IssuanceID, AttemptID: &attempt}); err != nil {
		return errors.Join(ErrIssuanceConflict, err)
	}
	issue := row.IssueDate.Time
	var expiry *time.Time
	status := "VALID"
	if row.ExpiryDate.Valid {
		expiry = &row.ExpiryDate.Time
		// Existing certificate status conventions use calendar-day expiry.
		today := time.Now().UTC().Truncate(24 * time.Hour)
		if expiry.Before(today) {
			status = "EXPIRED"
		} else if !expiry.After(today.AddDate(0, 0, 30)) {
			status = "EXPIRING_SOON"
		}
	}
	n, err := q.PublishIssuedCertificate(ctx, db.PublishIssuedCertificateParams{FileKey: row.FileKey, IssueDate: &issue, ExpiryDate: expiry, Status: status, CertificateID: row.CertificateID, BaseVersion: row.BaseVersion, ActorID: row.ActorID, OwnerKind: snapshot.Signer.OwnerKind, SignerID: snapshot.Signer.SignerID})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrIssuanceConflict
	}
	n, err = q.CompleteCertificateIssuance(ctx, db.CompleteCertificateIssuanceParams{IssuanceID: row.IssuanceID, AttemptID: &attempt})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrIssuanceConflict
	}
	return tx.Commit(ctx)
}
