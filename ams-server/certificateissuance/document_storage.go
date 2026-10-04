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
