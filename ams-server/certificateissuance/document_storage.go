package certificateissuance

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/smithy-go"
	"github.com/google/uuid"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

type R2Documents struct{}

type R2ExternalDocuments struct{ ContentType string }

func (s R2ExternalDocuments) PrepareKey(id, certificate uuid.UUID) (string, error) {
	extension := map[string]string{"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[s.ContentType]
	if extension == "" {
		return "", ErrExternalInput
	}
	return utils.PrepareObjectKey(fmt.Sprintf("external-certificates/%s/%s%s", certificate, id, extension))
}
func (s R2ExternalDocuments) Put(ctx context.Context, key string, data []byte) error {
	return utils.UploadImmutablePreparedBytes(ctx, key, s.ContentType, data)
}
func (s R2ExternalDocuments) Read(ctx context.Context, key string) ([]byte, error) {
	return (R2Documents{}).Read(ctx, key)
}

func (R2Documents) PrepareKey(id, certificate uuid.UUID) (string, error) {
	return utils.PrepareObjectKey(fmt.Sprintf("issued-certificates/%s/%s.pdf", certificate, id))
}
func (R2Documents) Put(ctx context.Context, key string, data []byte) error {
	return utils.UploadImmutablePreparedBytes(ctx, key, "application/pdf", data)
}
func (R2Documents) Read(ctx context.Context, key string) ([]byte, error) {
	data, err := utils.ReadStorageObject(ctx, key, MaxDocumentBytes)
	var apiError smithy.APIError
	if errors.As(err, &apiError) && apiError.ErrorCode() == "NoSuchKey" {
		return nil, ErrDocumentMissing
	}
	return data, err
}
