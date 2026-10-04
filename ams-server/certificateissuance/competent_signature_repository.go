package certificateissuance

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

type CompetentSignatureRepository struct {
	Pool    SigningDatabase
	ActorID uuid.UUID
}

func (r CompetentSignatureRepository) Prepare(ctx context.Context, v SignatureVersion) (*uuid.UUID, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)
	previous, err := q.EnsureCompetentSigningProfile(ctx, db.EnsureCompetentSigningProfileParams{PersonID: v.OwnerID, ActorID: r.ActorID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrManagementForbidden
	}
	if err != nil {
		return nil, err
	}
	err = q.CreateCompetentSignatureVersion(ctx, db.CreateCompetentSignatureVersionParams{SignatureID: v.ID, PersonID: v.OwnerID, FileKey: v.Key, Sha256: v.SHA256, Width: v.Width, Height: v.Height, ByteSize: v.ByteSize, ActorID: &r.ActorID})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return previous, nil
}

func (r CompetentSignatureRepository) Publish(ctx context.Context, personID, signatureID uuid.UUID, previous *uuid.UUID) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)
	n, err := q.MarkCompetentSignatureStored(ctx, db.MarkCompetentSignatureStoredParams{SignatureID: signatureID, OwnerID: personID})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrConflict
	}
	n, err = q.PublishCompetentSignature(ctx, db.PublishCompetentSignatureParams{PersonID: personID, SignatureID: &signatureID, PreviousSignatureID: previous, ActorID: r.ActorID})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrConflict
	}
	return tx.Commit(ctx)
}

func (r CompetentSignatureRepository) MarkFailed(ctx context.Context, id uuid.UUID) error {
	return db.New(r.Pool).MarkSignatureFailed(ctx, id)
}

func (r CompetentSignatureRepository) StoredVersion(ctx context.Context, owner, id uuid.UUID) (SignatureVersion, error) {
	v, err := db.New(r.Pool).GetStoredCompetentSignature(ctx, db.GetStoredCompetentSignatureParams{SignatureID: id, OwnerID: owner})
	if errors.Is(err, pgx.ErrNoRows) {
		return SignatureVersion{}, ErrNotFound
	}
	if err != nil {
		return SignatureVersion{}, err
	}
	return SignatureVersion{ID: v.SignatureID, OwnerID: v.OwnerID, Key: v.FileKey, SHA256: v.Sha256, Width: v.Width, Height: v.Height, ByteSize: v.ByteSize, CreatedAt: v.CreatedAt}, nil
}
