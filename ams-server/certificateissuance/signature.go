package certificateissuance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
)

var ErrForbidden = errors.New("only active ADMIN accounts can manage their own signing profile")
var ErrNotFound = errors.New("signature image not found")
var ErrConflict = errors.New("your signature changed during this upload; review the current signature and try again")
var ErrOrganization = errors.New("enter an organization between 1 and 200 characters")
var ErrStorage = errors.New("signature storage is unavailable; your current signature was not replaced")

type SignatureVersion struct {
	ID        uuid.UUID `json:"signature_id"`
	OwnerID   uuid.UUID `json:"-"`
	Key       string    `json:"-"`
	SHA256    string    `json:"sha256"`
	Width     int32     `json:"width"`
	Height    int32     `json:"height"`
	ByteSize  int64     `json:"byte_size"`
	CreatedAt time.Time `json:"created_at"`
}

type SigningProfile struct {
	UserID         uuid.UUID         `json:"user_id"`
	FullName       string            `json:"full_name"`
	Organization   string            `json:"organization"`
	CategoryID     *uuid.UUID        `json:"competency_category_id"`
	CategoryName   string            `json:"competency_category_name"`
	CategoryActive bool              `json:"competency_category_active"`
	Signature      *SignatureVersion `json:"signature"`
	UpdatedAt      time.Time         `json:"updated_at"`
	Role           string            `json:"-"`
	Status         string            `json:"-"`
}

type SignatureRepository interface {
	Profile(context.Context, uuid.UUID) (SigningProfile, error)
	UpdateOrganization(context.Context, uuid.UUID, string) error
	Prepare(context.Context, SignatureVersion) (*uuid.UUID, error)
	Publish(context.Context, uuid.UUID, uuid.UUID, *uuid.UUID) error
	MarkFailed(context.Context, uuid.UUID) error
	StoredVersion(context.Context, uuid.UUID, uuid.UUID) (SignatureVersion, error)
}

type SignatureStore interface {
	PrepareKey(uuid.UUID, uuid.UUID) (string, error)
	Put(context.Context, string, []byte) error
	Read(context.Context, string) ([]byte, error)
}

type Signatures struct {
	Repository SignatureRepository
	Store      SignatureStore
}

func (s Signatures) OwnProfile(ctx context.Context, userID uuid.UUID) (SigningProfile, error) {
	profile, err := s.Repository.Profile(ctx, userID)
	if err != nil {
		return SigningProfile{}, err
	}
	if profile.Role != "ADMIN" || profile.Status != "ACTIVE" {
		return SigningProfile{}, ErrForbidden
	}
	return profile, nil
}

func (s Signatures) UpdateOwnOrganization(ctx context.Context, userID uuid.UUID, organization string) (SigningProfile, error) {
	if _, err := s.OwnProfile(ctx, userID); err != nil {
		return SigningProfile{}, err
	}
	organization = strings.TrimSpace(organization)
	if !utf8.ValidString(organization) || utf8.RuneCountInString(organization) < 1 || utf8.RuneCountInString(organization) > 200 || strings.ContainsFunc(organization, unicode.IsControl) {
		return SigningProfile{}, ErrOrganization
	}
	if err := s.Repository.UpdateOrganization(ctx, userID, organization); err != nil {
		return SigningProfile{}, err
	}
	return s.OwnProfile(ctx, userID)
}

func (s Signatures) ReplaceOwnSignature(ctx context.Context, userID uuid.UUID, reader io.Reader) (SigningProfile, error) {
	if _, err := s.OwnProfile(ctx, userID); err != nil {
		return SigningProfile{}, err
	}
	image, err := NormalizeSignature(reader)
	if err != nil {
		return SigningProfile{}, err
	}
	version := SignatureVersion{ID: uuid.New(), OwnerID: userID, SHA256: image.SHA256,
		Width: image.Width, Height: image.Height, ByteSize: int64(len(image.PNG))}
	version.Key, err = s.Store.PrepareKey(version.ID, userID)
	if err != nil {
		return SigningProfile{}, errors.Join(ErrStorage, err)
	}
	// Persist the key before PUT. Failed/uncertain writes remain identifiable;
	// only the publication transaction makes an image current or readable.
	previous, err := s.Repository.Prepare(ctx, version)
	if err != nil {
		return SigningProfile{}, err
	}
	if err = s.Store.Put(ctx, version.Key, image.PNG); err != nil {
		s.markFailed(version.ID)
		return SigningProfile{}, errors.Join(ErrStorage, err)
	}
	if err = s.Repository.Publish(ctx, userID, version.ID, previous); err != nil {
		s.markFailed(version.ID)
		return SigningProfile{}, err
	}
	return s.OwnProfile(ctx, userID)
}

func (s Signatures) markFailed(id uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = s.Repository.MarkFailed(ctx, id)
}

func (s Signatures) OwnImage(ctx context.Context, userID, signatureID uuid.UUID) ([]byte, error) {
	if _, err := s.OwnProfile(ctx, userID); err != nil {
		return nil, err
	}
	version, err := s.Repository.StoredVersion(ctx, userID, signatureID)
	if err != nil {
		return nil, err
	}
	data, err := s.Store.Read(ctx, version.Key)
	if err != nil {
		return nil, errors.Join(ErrStorage, err)
	}
	digest := sha256.Sum256(data)
	if int64(len(data)) != version.ByteSize || hex.EncodeToString(digest[:]) != version.SHA256 {
		return nil, ErrStorage
	}
	return data, nil
}
