package certificateissuance

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	"image/png"
	"io"
)

const MaxSignatureBytes = 2 * 1024 * 1024
const MaxStoredSignatureBytes = 16 * 1024 * 1024
const MaxSignatureDimension = 4096
const MaxSignaturePixels = 4_000_000

var ErrImage = errors.New("choose a valid PNG or JPEG signature image")
var ErrImageSize = errors.New("signature images must be 2 MB or smaller")
var ErrImageDimensions = errors.New("signature images must be at most 4096 pixels per side and 4 million pixels")

type SignatureImage struct {
	PNG    []byte
	SHA256 string
	Width  int32
	Height int32
}

func NormalizeSignature(reader io.Reader) (SignatureImage, error) {
	data, err := io.ReadAll(io.LimitReader(reader, MaxSignatureBytes+1))
	if err != nil {
		return SignatureImage{}, ErrImage
	}
	if len(data) > MaxSignatureBytes {
		return SignatureImage{}, ErrImageSize
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "png" && format != "jpeg") {
		return SignatureImage{}, ErrImage
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > MaxSignatureDimension ||
		config.Height > MaxSignatureDimension || int64(config.Width)*int64(config.Height) > MaxSignaturePixels {
		return SignatureImage{}, ErrImageDimensions
	}
	decoded, actualFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || actualFormat != format || decoded.Bounds().Dx() != config.Width || decoded.Bounds().Dy() != config.Height {
		return SignatureImage{}, ErrImage
	}
	var normalized bytes.Buffer
	if err := png.Encode(&normalized, decoded); err != nil || normalized.Len() > MaxStoredSignatureBytes {
		return SignatureImage{}, ErrImage
	}
	digest := sha256.Sum256(normalized.Bytes())
	return SignatureImage{PNG: normalized.Bytes(), SHA256: hex.EncodeToString(digest[:]), Width: int32(config.Width), Height: int32(config.Height)}, nil
}
