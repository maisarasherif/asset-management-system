package controllers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func signerManagement(pool *pgxpool.Pool) issuance.SignerManagement {
	return issuance.SignerManagement{Pool: pool, Store: issuance.R2Signatures{CompetentPerson: true}}
}

func GetCompetentSigningProfile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		person, ok := utils.ParseUUIDParam(c, "competent_person_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		profile, err := signerManagement(pool).PersonProfile(ctx, actor, person)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, profile)
	}
}

func UploadCompetentSignature(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		person, ok := utils.ParseUUIDParam(c, "competent_person_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		management := signerManagement(pool)
		if _, err := management.PersonProfile(ctx, actor, person); err != nil {
			signingError(c, err)
			return
		}
		file, ok := signingUpload(c)
		if c.Request.MultipartForm != nil {
			defer c.Request.MultipartForm.RemoveAll()
		}
		if !ok {
			return
		}
		defer file.Close()
		profile, err := management.ReplacePersonSignature(ctx, actor, person, file)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, profile)
	}
}

func GetCompetentSignatureImage(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		person, ok := utils.ParseUUIDParam(c, "competent_person_id")
		if !ok {
			return
		}
		signature, ok := utils.ParseUUIDParam(c, "signature_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		data, err := signerManagement(pool).PersonImage(ctx, actor, person, signature)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(http.StatusOK, "image/png", data)
	}
}

func GetAdminSigningProfile(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		target, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		profile, err := signerManagement(pool).AccountProfile(ctx, actor, target)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, profile)
	}
}

func decodeSigningInput(c *gin.Context, input any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid signing request fields"})
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provide one signing request"})
		return false
	}
	return true
}

func AssignAdminSigningCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		target, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		management := signerManagement(pool)
		if _, err := management.AccountProfile(ctx, actor, target); err != nil {
			signingError(c, err)
			return
		}
		var input struct {
			Category json.RawMessage `json:"competency_category_id"`
		}
		if !decodeSigningInput(c, &input) {
			return
		}
		var category *uuid.UUID
		if len(input.Category) == 0 || json.Unmarshal(input.Category, &category) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "provide competency_category_id as a UUID or null"})
			return
		}
		profile, err := management.AssignCategory(ctx, actor, target, category)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, profile)
	}
}

func ListGeneratedSigners(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		choices, err := signerManagement(pool).Eligible(ctx, actor, certificate)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, choices)
	}
}

func ResolveGeneratedSigner(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := signingUser(c)
		if !ok {
			return
		}
		certificate, ok := utils.ParseUUIDParam(c, "certificate_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		management := signerManagement(pool)
		var input struct {
			SignerID *uuid.UUID `json:"signer_id"`
		}
		if !decodeSigningInput(c, &input) {
			return
		}
		signer, err := management.Resolve(ctx, actor, certificate, input.SignerID)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, signer)
	}
}
