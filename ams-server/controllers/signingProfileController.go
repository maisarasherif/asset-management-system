package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	issuance "github.com/maisarasherif/asset-management-system/ams-server/certificateissuance"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func signingService(pool *pgxpool.Pool) issuance.Signatures {
	return issuance.Signatures{Repository: issuance.PostgresSignatures{Pool: pool}, Store: issuance.R2Signatures{}}
}

func signingUser(c *gin.Context) (uuid.UUID, bool) {
	id, err := utils.GetUserIdFromContext(c)
	if err == nil {
		if parsed, parseErr := uuid.Parse(id); parseErr == nil {
			return parsed, true
		}
	}
	c.JSON(http.StatusUnauthorized, gin.H{"error": "could not identify your account"})
	return uuid.Nil, false
}

func signingError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	message := "could not update your signing profile; try again"
	switch {
	case errors.Is(err, issuance.ErrForbidden):
		status, message = http.StatusForbidden, issuance.ErrForbidden.Error()
	case errors.Is(err, issuance.ErrManagementForbidden), errors.Is(err, issuance.ErrIssuerForbidden):
		status, message = http.StatusForbidden, err.Error()
	case errors.Is(err, issuance.ErrSigningProfileNotFound):
		status, message = http.StatusNotFound, issuance.ErrSigningProfileNotFound.Error()
	case errors.Is(err, issuance.ErrSigningCategory), errors.Is(err, issuance.ErrSigningAccount), errors.Is(err, issuance.ErrSignerIneligible):
		status, message = http.StatusBadRequest, err.Error()
	case errors.Is(err, issuance.ErrNotFound):
		status, message = http.StatusNotFound, issuance.ErrNotFound.Error()
	case errors.Is(err, issuance.ErrConflict):
		status, message = http.StatusConflict, issuance.ErrConflict.Error()
	case errors.Is(err, issuance.ErrOrganization):
		status, message = http.StatusBadRequest, issuance.ErrOrganization.Error()
	case errors.Is(err, issuance.ErrImageSize):
		status, message = http.StatusRequestEntityTooLarge, issuance.ErrImageSize.Error()
	case errors.Is(err, issuance.ErrImageDimensions):
		status, message = http.StatusBadRequest, issuance.ErrImageDimensions.Error()
	case errors.Is(err, issuance.ErrImage):
		status, message = http.StatusBadRequest, issuance.ErrImage.Error()
	case errors.Is(err, issuance.ErrStorage):
		status, message = http.StatusServiceUnavailable, issuance.ErrStorage.Error()
	}
	if status >= 500 {
		logger.Log.Error().Err(err).Msg("certificate signing profile operation failed")
	}
	c.JSON(status, gin.H{"error": message})
}

func GetOwnSigningProfile(pool *pgxpool.Pool) gin.HandlerFunc {
	service := signingService(pool)
	return func(c *gin.Context) {
		id, ok := signingUser(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		profile, err := service.OwnProfile(ctx, id)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, profile)
	}
}

func UpdateOwnSigningProfile(pool *pgxpool.Pool) gin.HandlerFunc {
	service := signingService(pool)
	return func(c *gin.Context) {
		id, ok := signingUser(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		if _, err := service.OwnProfile(ctx, id); err != nil {
			signingError(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
		var input struct {
			Organization string `json:"organization"`
		}
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "only organization may be updated"})
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			c.JSON(http.StatusBadRequest, gin.H{"error": "provide one signing profile update"})
			return
		}
		profile, err := service.UpdateOwnOrganization(ctx, id, input.Organization)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, profile)
	}
}

func UploadOwnSignature(pool *pgxpool.Pool) gin.HandlerFunc {
	service := signingService(pool)
	return func(c *gin.Context) {
		id, ok := signingUser(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		if _, err := service.OwnProfile(ctx, id); err != nil {
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
		profile, err := service.ReplaceOwnSignature(ctx, id, file)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, profile)
	}
}

func signingUpload(c *gin.Context) (multipart.File, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, issuance.MaxSignatureBytes+64*1024)
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		var limit *http.MaxBytesError
		if errors.As(err, &limit) {
			signingError(c, issuance.ErrImageSize)
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "choose one PNG or JPEG signature image"})
		}
		return nil, false
	}
	if header.Size > issuance.MaxSignatureBytes {
		file.Close()
		signingError(c, issuance.ErrImageSize)
		return nil, false
	}
	if len(c.Request.MultipartForm.Value) != 0 || len(c.Request.MultipartForm.File) != 1 || len(c.Request.MultipartForm.File["file"]) != 1 {
		file.Close()
		c.JSON(http.StatusBadRequest, gin.H{"error": "upload only the signature image; ownership and category cannot be supplied"})
		return nil, false
	}
	return file, true
}

func GetOwnSignatureImage(pool *pgxpool.Pool) gin.HandlerFunc {
	service := signingService(pool)
	return func(c *gin.Context) {
		id, ok := signingUser(c)
		if !ok {
			return
		}
		signatureID, ok := utils.ParseUUIDParam(c, "signature_id")
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		data, err := service.OwnImage(ctx, id, signatureID)
		if err != nil {
			signingError(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Disposition", `inline; filename="signature.png"`)
		c.Data(http.StatusOK, "image/png", data)
	}
}
