package certificateissuance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

const MaxExternalBytes = 10 * 1024 * 1024

var ErrExternalInput = errors.New("provide a supported file up to 10MB, an approval ID, eligible competent person and valid renewal dates")
var ErrApprovalMismatch = errors.New("this approval belongs to different renewal details; restore the original input or start a new renewal")

type ExternalInput struct {
	ApprovalID  uuid.UUID
	PersonID    uuid.UUID
	IssueDate   string
	ExpiryDate  string
	FileName    string
	ContentType string
	Data        []byte
}
type ExternalSigner struct {
	OwnerKind    string    `json:"owner_kind"`
	SignerID     uuid.UUID `json:"signer_id"`
	FullName     string    `json:"full_name"`
	Organization string    `json:"organization"`
	CategoryID   uuid.UUID `json:"competency_category_id"`
	CategoryName string    `json:"competency_category_name"`
}

// The uploaded document is preserved as received; no saved signature or PDF template is applied.
type ExternalSnapshot struct {
	Snapshot
	Signer ExternalSigner `json:"signer"`
}

func ExternalTypeAllowed(value string) bool {
	return value == "application/pdf" || value == "image/jpeg" || value == "image/png" || value == "image/webp"
}
func (s Issuances) ApproveExternal(ctx context.Context, actor, certificate uuid.UUID, input ExternalInput) (Issuance, error) {
	if input.ApprovalID == uuid.Nil || input.PersonID == uuid.Nil || len(input.Data) == 0 || len(input.Data) > MaxExternalBytes || !ExternalTypeAllowed(input.ContentType) || strings.TrimSpace(input.FileName) == "" || !validFreeText(input.FileName, 255) {
		return Issuance{}, ErrExternalInput
	}
	digest := sha256.Sum256(input.Data)
	hash := hex.EncodeToString(digest[:])
	var row db.CertificateIssuance
	var err error
	for retry := 0; retry < 5; retry++ {
		row, err = s.approveExternalTransaction(ctx, actor, certificate, input, hash)
		var conflict *pgconn.PgError
		approvalCollision := errors.As(err, &conflict) && conflict.Code == "23505" && conflict.ConstraintName == "certificate_issuances_approval_id_key"
		if !serializationFailure(err) && !approvalCollision {
			break
		}
	}
	if err != nil {
		return Issuance{}, err
	}
	return s.processDocument(ctx, row, input.Data)
}
func (s Issuances) approveExternalTransaction(ctx context.Context, actor, certificate uuid.UUID, input ExternalInput, hash string) (db.CertificateIssuance, error) {
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return db.CertificateIssuance{}, err
	}
	defer tx.Rollback(context.Background())
	manager := s.Previews.Management
	manager.Pool = tx
	if _, err := manager.actorRole(ctx, actor, false); err != nil {
		return db.CertificateIssuance{}, err
	}
	q := db.New(tx)
	version, err := q.LockCertificateForApproval(ctx, certificate)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.CertificateIssuance{}, ErrSigningProfileNotFound
	}
	if err != nil {
		return db.CertificateIssuance{}, err
	}
	existing, err := q.GetCertificateIssuanceByApproval(ctx, input.ApprovalID)
	if err == nil {
		var saved ExternalSnapshot
		if json.Unmarshal(existing.Snapshot, &saved) != nil || existing.Source != "EXTERNAL" || existing.ActorID != actor || existing.CertificateID != certificate || existing.DocumentSha256 != hash || existing.DocumentSize != int64(len(input.Data)) || existing.FileName != input.FileName || existing.ContentType != input.ContentType || saved.Signer.SignerID != input.PersonID || saved.IssueDate != input.IssueDate || saved.ExpiryDate != input.ExpiryDate {
			return existing, ErrApprovalMismatch
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return existing, err
	}
	source, err := q.GetCertificatePreviewSource(ctx, certificate)
	if err != nil {
		return existing, err
	}
	person, err := q.GetCompetentPersonByID(ctx, input.PersonID)
	if errors.Is(err, pgx.ErrNoRows) {
		return existing, ErrExternalInput
	}
	if err != nil {
		return existing, err
	}
	category, err := q.GetCompetencyCategoryByID(ctx, person.CompetencyCategoryID)
	if err != nil {
		return existing, err
	}
	restricted, err := q.CountCertificateCompetencyCategories(ctx, certificate)
	if err != nil {
		return existing, err
	}
	allowed, err := q.CountCertificateCompetencyCategoryByIDs(ctx, db.CountCertificateCompetencyCategoryByIDsParams{CertificateID: certificate, CompetencyCategoryID: person.CompetencyCategoryID})
	if err != nil {
		return existing, err
	}
	if !person.Active || !category.Active || (restricted > 0 && allowed == 0) {
		return existing, ErrExternalInput
	}
	issue, expiry := dateValue(input.IssueDate), dateValue(input.ExpiryDate)
	if !issue.Valid || issue.Time.Year() < 1900 || (source.RequiresRenewal && (!expiry.Valid || !expiry.Time.After(issue.Time))) || (!source.RequiresRenewal && input.ExpiryDate != "") {
		return existing, ErrExternalInput
	}
	period := "No expiry"
	if expiry.Valid {
		period = validityPeriod(issue.Time, expiry.Time)
	}
	snapshot := ExternalSnapshot{Snapshot: Snapshot{SchemaVersion: SnapshotVersion, CertificateID: certificate, ComponentID: source.ComponentID, EquipmentID: source.AssetID, TestID: source.TestID, EquipmentName: source.EquipmentName, ComponentName: source.ComponentName, ComponentDisplayID: source.ComponentDisplayID, SerialNumber: source.SerialNumber, Location: source.Location, CertificateName: source.CertificateName, TestName: source.TestName, TestDescription: source.TestDescription, IMCARef: source.ImcaRef, IMCAD018: source.ImcaD018, IssueDate: input.IssueDate, ExpiryDate: input.ExpiryDate, ValidityPeriod: period}, Signer: ExternalSigner{OwnerKind: "COMPETENT_PERSON", SignerID: input.PersonID, FullName: person.FullName, Organization: person.Organization, CategoryID: person.CompetencyCategoryID, CategoryName: category.CategoryName}}
	data, err := json.Marshal(snapshot)
	if err != nil {
		return existing, err
	}
	id := uuid.New()
	key, err := s.Documents.PrepareKey(id, certificate)
	if err != nil {
		return existing, errors.Join(ErrIssuanceFailed, err)
	}
	row, err := q.InsertExternalIssuance(ctx, db.InsertExternalIssuanceParams{IssuanceID: id, ApprovalID: input.ApprovalID, CertificateID: certificate, ComponentID: source.ComponentID, ActorID: actor, IssueDate: issue, ExpiryDate: expiry, Snapshot: data, BaseVersion: version, FileKey: key, FileName: input.FileName, ContentType: input.ContentType, DocumentSha256: hash, DocumentSize: int64(len(input.Data))})
	if err != nil {
		return row, err
	}
	return row, tx.Commit(ctx)
}
