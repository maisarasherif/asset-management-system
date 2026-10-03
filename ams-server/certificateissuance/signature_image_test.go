package certificateissuance

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func signatureImageFixture(t *testing.T, format string) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 16, 8))
	img.Set(5, 4, color.NRGBA{R: 32, G: 64, B: 128, A: 128})
	var buffer bytes.Buffer
	var err error
	if format == "jpeg" {
		err = jpeg.Encode(&buffer, img, &jpeg.Options{Quality: 90})
	} else {
		err = png.Encode(&buffer, img)
	}
	if err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestSignatureNormalizationPreservesDimensionsAndTransparency(t *testing.T) {
	data := signatureImageFixture(t, "png")
	normalized, err := NormalizeSignature(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(normalized.PNG))
	if err != nil {
		t.Fatal(err)
	}
	if normalized.Width != 16 || normalized.Height != 8 {
		t.Fatal("signature proportions changed")
	}
	_, _, _, alpha := decoded.At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatal("transparent background was lost")
	}
	_, _, _, alpha = decoded.At(5, 4).RGBA()
	if alpha != 128*257 {
		t.Fatal("partial transparency was lost")
	}
	digest := sha256.Sum256(normalized.PNG)
	if normalized.SHA256 != hex.EncodeToString(digest[:]) {
		t.Fatal("digest does not identify normalized bytes")
	}
}

func TestSignatureNormalizationAcceptsJPEGAndProducesPNG(t *testing.T) {
	normalized, err := NormalizeSignature(bytes.NewReader(signatureImageFixture(t, "jpeg")))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(normalized.PNG))
	if err != nil || decoded.Bounds().Dx() != 16 || decoded.Bounds().Dy() != 8 {
		t.Fatal("JPEG was not normalized to a proportional PNG")
	}
}

func TestSignatureNormalizationRejectsInvalidAndOversizedImages(t *testing.T) {
	cases := []struct {
		name     string
		data     []byte
		expected error
	}{
		{"empty", nil, ErrImage},
		{"PDF disguised as image", []byte("%PDF-1.4 fake signature"), ErrImage},
		{"too many uploaded bytes", bytes.Repeat([]byte{'x'}, MaxSignatureBytes+1), ErrImageSize},
		{"truncated PNG", signatureImageFixture(t, "png")[:40], ErrImage},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NormalizeSignature(bytes.NewReader(tc.data)); !errors.Is(err, tc.expected) {
				t.Fatalf("got %v; expected %v", err, tc.expected)
			}
		})
	}
}

func TestSignatureDimensionsAreBoundedBeforeDecodingPixels(t *testing.T) {
	for _, dimensions := range [][2]uint32{{4097, 8}, {3000, 2000}, {16, 4097}} {
		data := signatureImageFixture(t, "png")
		binary.BigEndian.PutUint32(data[16:20], dimensions[0])
		binary.BigEndian.PutUint32(data[20:24], dimensions[1])
		binary.BigEndian.PutUint32(data[29:33], crc32.ChecksumIEEE(data[12:29]))
		if _, err := NormalizeSignature(bytes.NewReader(data)); !errors.Is(err, ErrImageDimensions) {
			t.Fatalf("dimensions %v: %v", dimensions, err)
		}
	}
}
