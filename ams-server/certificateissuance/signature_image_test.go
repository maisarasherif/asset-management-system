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
	if normalized.PNG[24] != 8 {
		t.Fatal("JPEG normalization must produce an 8-bit PNG for PDF embedding")
	}
}

func signature16BitFixture(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA64(image.Rect(0, 0, 16, 8))
	img.SetNRGBA64(5, 4, color.NRGBA64{R: 32 * 257, G: 64 * 257, B: 128 * 257, A: 128 * 257})
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatal(err)
	}
	if buffer.Bytes()[24] != 16 {
		t.Fatal("fixture must exercise 16-bit PNG input")
	}
	return buffer.Bytes()
}

func TestSignatureNormalizationConverts16BitPNGWithTransparency(t *testing.T) {
	normalized, err := NormalizeSignature(bytes.NewReader(signature16BitFixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	if normalized.PNG[24] != 8 || normalized.Width != 16 || normalized.Height != 8 {
		t.Fatal("16-bit input must become a proportional 8-bit PNG")
	}
	decoded, err := png.Decode(bytes.NewReader(normalized.PNG))
	if err != nil {
		t.Fatal(err)
	}
	if got := color.NRGBAModel.Convert(decoded.At(5, 4)).(color.NRGBA); got != (color.NRGBA{R: 32, G: 64, B: 128, A: 128}) {
		t.Fatalf("partial transparency/color changed: %v", got)
	}
	if _, _, _, alpha := decoded.At(0, 0).RGBA(); alpha != 0 {
		t.Fatal("transparent background was lost")
	}
	digest := sha256.Sum256(normalized.PNG)
	if normalized.SHA256 != hex.EncodeToString(digest[:]) {
		t.Fatal("digest must identify the saved 8-bit bytes")
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

func TestStoredSignaturePDFConversionKeepsBoundsAndBytes(t *testing.T) {
	current := signatureImageFixture(t, "png")
	converted, config, err := signatureForPDF(current)
	if err != nil || config.Width != 16 || config.Height != 8 || !bytes.Equal(current, converted) {
		t.Fatal("current PNG must retain its bytes and proportions", err)
	}
	legacy := signature16BitFixture(t)
	original := append([]byte(nil), legacy...)
	converted, config, err = signatureForPDF(legacy)
	if err != nil || config.Width != 16 || config.Height != 8 || converted[24] != 8 || !bytes.Equal(legacy, original) {
		t.Fatal("legacy PNG must convert without mutating stored bytes", err)
	}
	for _, dimensions := range [][2]uint32{{4097, 8}, {3000, 2000}, {16, 4097}} {
		data := append([]byte(nil), legacy...)
		binary.BigEndian.PutUint32(data[16:20], dimensions[0])
		binary.BigEndian.PutUint32(data[20:24], dimensions[1])
		binary.BigEndian.PutUint32(data[29:33], crc32.ChecksumIEEE(data[12:29]))
		if _, _, err := signatureForPDF(data); !errors.Is(err, ErrImageDimensions) {
			t.Fatalf("stored dimensions %v must be bounded before decoding: %v", dimensions, err)
		}
	}
	for _, invalid := range [][]byte{nil, []byte("%PDF-not-a-signature"), legacy[:40], bytes.Repeat([]byte{'x'}, MaxStoredSignatureBytes+1)} {
		if _, _, err := signatureForPDF(invalid); !errors.Is(err, ErrImage) {
			t.Fatal("invalid stored signature accepted", err)
		}
	}
}
