package certificateissuance

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

type PostgresSignatures struct{ Pool *pgxpool.Pool }

func (r PostgresSignatures) Profile(ctx context.Context, id uuid.UUID) (SigningProfile, error) {
	row, err := db.New(r.Pool).GetAccountSigningProfile(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return SigningProfile{}, ErrForbidden
	}
	if err != nil {
		return SigningProfile{}, err
	}
	profile := SigningProfile{UserID: row.UserID, FullName: strings.TrimSpace(row.FirstName + " " + row.LastName),
		Organization: row.Organization, CategoryID: row.CompetencyCategoryID,
		CategoryName: row.CompetencyCategoryName.String, CategoryActive: row.CompetencyCategoryActive.Bool,
		UpdatedAt: row.UpdatedAt, Role: row.Role, Status: row.Status}
	if row.CurrentSignatureID != nil {
		version, err := r.StoredVersion(ctx, id, *row.CurrentSignatureID)
		if err != nil {
			return SigningProfile{}, err
		}
		profile.Signature = &version
	}
	return profile, nil
}

func (r PostgresSignatures) UpdateOrganization(ctx context.Context, id uuid.UUID, organization string) error {
	_, err := db.New(r.Pool).UpdateOwnSigningOrganization(ctx, db.UpdateOwnSigningOrganizationParams{UserID: id, Organization: organization})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrForbidden
	}
	return err
}

func (r PostgresSignatures) Prepare(ctx context.Context, version SignatureVersion) (*uuid.UUID, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	profile, err := queries.EnsureOwnSigningProfile(ctx, version.OwnerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrForbidden
	}
	if err != nil {
		return nil, err
	}
	err = queries.CreateAccountSignatureVersion(ctx, db.CreateAccountSignatureVersionParams{
		SignatureID: version.ID, UserID: version.OwnerID, FileKey: version.Key, Sha256: version.SHA256,
		Width: version.Width, Height: version.Height, ByteSize: version.ByteSize,
	})
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return profile.CurrentSignatureID, nil
}

func (r PostgresSignatures) Publish(ctx context.Context, userID, signatureID uuid.UUID, previous *uuid.UUID) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	rows, err := queries.MarkSignatureStored(ctx, db.MarkSignatureStoredParams{SignatureID: signatureID, OwnerID: userID})
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrConflict
	}
	rows, err = queries.PublishOwnSignature(ctx, db.PublishOwnSignatureParams{UserID: userID, SignatureID: &signatureID, PreviousSignatureID: previous})
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrConflict
	}
	return tx.Commit(ctx)
}

func (r PostgresSignatures) MarkFailed(ctx context.Context, id uuid.UUID) error {
	return db.New(r.Pool).MarkSignatureFailed(ctx, id)
}

func (r PostgresSignatures) StoredVersion(ctx context.Context, ownerID, id uuid.UUID) (SignatureVersion, error) {
	row, err := db.New(r.Pool).GetStoredAccountSignature(ctx, db.GetStoredAccountSignatureParams{SignatureID: id, OwnerID: ownerID})
	if errors.Is(err, pgx.ErrNoRows) {
		return SignatureVersion{}, ErrNotFound
	}
	if err != nil {
		return SignatureVersion{}, err
	}
	return SignatureVersion{ID: row.SignatureID, OwnerID: row.OwnerID, Key: row.FileKey,
		SHA256: row.Sha256, Width: row.Width, Height: row.Height, ByteSize: row.ByteSize, CreatedAt: row.CreatedAt}, nil
}
