package certificateissuance

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

type R2Signatures struct{ CompetentPerson bool }

func (s R2Signatures) PrepareKey(id, ownerID uuid.UUID) (string, error) {
	kind := "account"
	if s.CompetentPerson {
		kind = "competent-person"
	}
	return utils.PrepareObjectKey(fmt.Sprintf("signature-files/%s/%s/%s.png", kind, ownerID, id))
}

func (R2Signatures) Put(ctx context.Context, key string, data []byte) error {
	return utils.UploadPreparedBytes(ctx, key, "image/png", data)
}

func (R2Signatures) Read(ctx context.Context, key string) ([]byte, error) {
	return utils.ReadStorageObject(ctx, key, MaxStoredSignatureBytes)
}
