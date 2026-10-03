package certificateissuance

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/draw"
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
	if !validSignatureDimensions(config) {
		return SignatureImage{}, ErrImageDimensions
	}
	decoded, actualFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || actualFormat != format || decoded.Bounds().Dx() != config.Width || decoded.Bounds().Dy() != config.Height {
		return SignatureImage{}, ErrImage
	}
	normalized, err := encodeSignaturePNG(decoded)
	if err != nil {
		return SignatureImage{}, err
	}
	digest := sha256.Sum256(normalized)
	return SignatureImage{PNG: normalized, SHA256: hex.EncodeToString(digest[:]), Width: int32(config.Width), Height: int32(config.Height)}, nil
}

func validSignatureDimensions(config image.Config) bool {
	return config.Width > 0 && config.Height > 0 && config.Width <= MaxSignatureDimension &&
		config.Height <= MaxSignatureDimension && int64(config.Width)*int64(config.Height) <= MaxSignaturePixels
}

func encodeSignaturePNG(decoded image.Image) ([]byte, error) {
	// Go's PNG encoder defaults to 16-bit output for JPEG's YCbCr model and
	// 16-bit source images. gopdf requires an explicit 8-bit color model.
	bounded := image.NewNRGBA(image.Rect(0, 0, decoded.Bounds().Dx(), decoded.Bounds().Dy()))
	draw.Draw(bounded, bounded.Bounds(), decoded, decoded.Bounds().Min, draw.Src)
	var normalized bytes.Buffer
	if err := png.Encode(&normalized, bounded); err != nil || normalized.Len() > MaxStoredSignatureBytes {
		return nil, ErrImage
	}
	return normalized.Bytes(), nil
}

func signatureForPDF(data []byte) ([]byte, image.Config, error) {
	if len(data) > MaxStoredSignatureBytes {
		return nil, image.Config{}, ErrImage
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, image.Config{}, ErrImage
	}
	if !validSignatureDimensions(config) {
		return nil, image.Config{}, ErrImageDimensions
	}
	// Keep current 8-bit PNGs on the fast path. DecodeConfig has validated the
	// PNG header; byte 24 is its IHDR bit depth. Only legacy 16-bit versions
	// need conversion. Their stored bytes/hash remain untouched.
	if data[24] != 16 {
		return data, config, nil
	}
	decoded, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, image.Config{}, ErrImage
	}
	converted, err := encodeSignaturePNG(decoded)
	return converted, config, err
}
