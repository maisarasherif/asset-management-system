package certificateissuance

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

var ErrManagementForbidden = errors.New("only active SUPER_ADMIN accounts can manage other signing profiles")
var ErrIssuerForbidden = errors.New("only active admins can select a generated certificate signer")
var ErrSigningProfileNotFound = errors.New("signing profile or certificate not found")
var ErrSigningCategory = errors.New("choose an active competency category")
var ErrSigningAccount = errors.New("choose an ADMIN account")
var ErrSignerIneligible = errors.New("the selected signer is not eligible for this certificate; check their active category and saved signature")

type CompetentSigningProfile struct {
	PersonID       uuid.UUID         `json:"competent_person_id"`
	FullName       string            `json:"full_name"`
	Organization   string            `json:"organization"`
	Active         bool              `json:"active"`
	CategoryID     uuid.UUID         `json:"competency_category_id"`
	CategoryName   string            `json:"competency_category_name"`
	CategoryActive bool              `json:"competency_category_active"`
	Signature      *SignatureVersion `json:"signature"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

type EligibleSigner struct {
	OwnerKind    string           `json:"owner_kind"`
	SignerID     uuid.UUID        `json:"signer_id"`
	FullName     string           `json:"full_name"`
	Organization string           `json:"organization"`
	CategoryID   uuid.UUID        `json:"competency_category_id"`
	CategoryName string           `json:"competency_category_name"`
	Signature    SignatureVersion `json:"signature"`
}

type SignerManagement struct {
	Pool  *pgxpool.Pool
	Store SignatureStore
}

func (m SignerManagement) actorRole(ctx context.Context, actor uuid.UUID, superOnly bool) (string, error) {
	a, err := db.New(m.Pool).GetSigningActor(ctx, actor)
	forbidden := ErrIssuerForbidden
	if superOnly {
		forbidden = ErrManagementForbidden
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", forbidden
	}
	if err != nil {
		return "", err
	}
	if a.Status != "ACTIVE" || (a.Role != "SUPER_ADMIN" && (superOnly || a.Role != "ADMIN")) {
		return "", forbidden
	}
	return a.Role, nil
}

func (m SignerManagement) PersonProfile(ctx context.Context, actor, person uuid.UUID) (CompetentSigningProfile, error) {
	if _, err := m.actorRole(ctx, actor, true); err != nil {
		return CompetentSigningProfile{}, err
	}
	p, err := db.New(m.Pool).GetCompetentSigningProfile(ctx, person)
	if errors.Is(err, pgx.ErrNoRows) {
		return CompetentSigningProfile{}, ErrSigningProfileNotFound
	}
	if err != nil {
		return CompetentSigningProfile{}, err
	}
	result := CompetentSigningProfile{PersonID: p.CompetentPersonID, FullName: p.FullName, Organization: p.Organization, Active: p.Active, CategoryID: p.CompetencyCategoryID, CategoryName: p.CategoryName, CategoryActive: p.CategoryActive, UpdatedAt: p.UpdatedAt}
	if p.CurrentSignatureID != nil {
		v, err := (CompetentSignatureRepository{Pool: m.Pool, ActorID: actor}).StoredVersion(ctx, person, *p.CurrentSignatureID)
		if err != nil {
			return CompetentSigningProfile{}, err
		}
		result.Signature = &v
	}
	return result, nil
}

func (m SignerManagement) ReplacePersonSignature(ctx context.Context, actor, person uuid.UUID, input io.Reader) (CompetentSigningProfile, error) {
	if _, err := m.PersonProfile(ctx, actor, person); err != nil {
		return CompetentSigningProfile{}, err
	}
	repo := CompetentSignatureRepository{Pool: m.Pool, ActorID: actor}
	if err := replaceSignature(ctx, person, input, repo, m.Store); err != nil {
		return CompetentSigningProfile{}, err
	}
	return m.PersonProfile(ctx, actor, person)
}

func (m SignerManagement) PersonImage(ctx context.Context, actor, person, signature uuid.UUID) ([]byte, error) {
	if _, err := m.PersonProfile(ctx, actor, person); err != nil {
		return nil, err
	}
	return readSignature(ctx, person, signature, CompetentSignatureRepository{Pool: m.Pool, ActorID: actor}, m.Store)
}

func (m SignerManagement) AccountProfile(ctx context.Context, actor, account uuid.UUID) (SigningProfile, error) {
	if _, err := m.actorRole(ctx, actor, true); err != nil {
		return SigningProfile{}, err
	}
	p, err := (PostgresSignatures{Pool: m.Pool}).Profile(ctx, account)
	if errors.Is(err, ErrForbidden) {
		return SigningProfile{}, ErrSigningProfileNotFound
	}
	if err != nil {
		return SigningProfile{}, err
	}
	if p.Role != "ADMIN" {
		return SigningProfile{}, ErrSigningAccount
	}
	return p, nil
}

func (m SignerManagement) AssignCategory(ctx context.Context, actor, account uuid.UUID, category *uuid.UUID) (SigningProfile, error) {
	if _, err := m.AccountProfile(ctx, actor, account); err != nil {
		return SigningProfile{}, err
	}
	q := db.New(m.Pool)
	if category != nil {
		c, err := q.GetCompetencyCategoryByID(ctx, *category)
		if errors.Is(err, pgx.ErrNoRows) {
			return SigningProfile{}, ErrSigningCategory
		}
		if err != nil {
			return SigningProfile{}, err
		}
		if !c.Active {
			return SigningProfile{}, ErrSigningCategory
		}
	}
	n, err := q.AssignAccountSigningCategory(ctx, db.AssignAccountSigningCategoryParams{ActorID: actor, UserID: account, CategoryID: category})
	if err != nil {
		return SigningProfile{}, err
	}
	if n != 1 {
		return SigningProfile{}, ErrConflict
	}
	return m.AccountProfile(ctx, actor, account)
}

func (m SignerManagement) Eligible(ctx context.Context, actor, certificate uuid.UUID) ([]EligibleSigner, error) {
	role, err := m.actorRole(ctx, actor, false)
	if err != nil {
		return nil, err
	}
	return m.eligible(ctx, actor, certificate, role)
}

func (m SignerManagement) eligible(ctx context.Context, actor, certificate uuid.UUID, role string) ([]EligibleSigner, error) {
	q := db.New(m.Pool)
	if _, err := q.GetCertificateByID(ctx, certificate); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSigningProfileNotFound
		}
		return nil, err
	}
	result := []EligibleSigner{}
	if role == "ADMIN" {
		p, err := (PostgresSignatures{Pool: m.Pool}).Profile(ctx, actor)
		if err != nil {
			return nil, err
		}
		if p.Role != "ADMIN" || p.Status != "ACTIVE" {
			return nil, ErrIssuerForbidden
		}
		if p.Signature == nil || p.CategoryID == nil || !p.CategoryActive || strings.TrimSpace(p.FullName) == "" || strings.TrimSpace(p.Organization) == "" {
			return result, nil
		}
		allowed, err := q.IsAccountSigningCategoryAllowed(ctx, db.IsAccountSigningCategoryAllowedParams{UserID: actor, CertificateID: certificate})
		if err != nil {
			return nil, err
		}
		if allowed {
			result = append(result, EligibleSigner{OwnerKind: "ACCOUNT", SignerID: actor, FullName: p.FullName, Organization: p.Organization, CategoryID: *p.CategoryID, CategoryName: p.CategoryName, Signature: *p.Signature})
		}
		return result, nil
	}
	rows, err := q.ListEligibleCompetentSigners(ctx, certificate)
	if err != nil {
		return nil, err
	}
	for _, p := range rows {
		if strings.TrimSpace(p.FullName) == "" || strings.TrimSpace(p.Organization) == "" {
			continue
		}
		result = append(result, EligibleSigner{OwnerKind: "COMPETENT_PERSON", SignerID: p.SignerID, FullName: p.FullName, Organization: p.Organization, CategoryID: p.CompetencyCategoryID, CategoryName: p.CategoryName, Signature: SignatureVersion{ID: p.SignatureID, OwnerID: p.SignerID, SHA256: p.Sha256, Width: p.Width, Height: p.Height, ByteSize: p.ByteSize, CreatedAt: p.CreatedAt}})
	}
	return result, nil
}

func (m SignerManagement) Resolve(ctx context.Context, actor, certificate uuid.UUID, selected *uuid.UUID) (EligibleSigner, error) {
	role, err := m.actorRole(ctx, actor, false)
	if err != nil {
		return EligibleSigner{}, err
	}
	if role == "ADMIN" && selected != nil && *selected != actor {
		return EligibleSigner{}, ErrIssuerForbidden
	}
	if role == "ADMIN" {
		selected = &actor
	}
	if selected == nil {
		return EligibleSigner{}, ErrSignerIneligible
	}
	choices, err := m.eligible(ctx, actor, certificate, role)
	if err != nil {
		return EligibleSigner{}, err
	}
	for _, p := range choices {
		if p.SignerID == *selected {
			return p, nil
		}
	}
	return EligibleSigner{}, ErrSignerIneligible
}
