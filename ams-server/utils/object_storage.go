package utils

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// PrepareObjectKey records a test upload intent and supplies the scoped key
// before a caller persists its metadata. Production keys remain unchanged.
func PrepareObjectKey(key string) (string, error) {
	if !validPreparedObjectKey(key) {
		return "", errors.New("invalid object key")
	}
	return journalTestStorageObject(key)
}

func UploadPreparedBytes(ctx context.Context, key, contentType string, data []byte) error {
	if !validPreparedObjectKey(key) {
		return errors.New("invalid object key")
	}
	prefix, _, err := testStorageScope()
	if err != nil {
		return err
	}
	if prefix != "" {
		if !strings.HasPrefix(key, prefix) || key == prefix {
			return errors.New("object key is outside the test storage scope")
		}
		// Journal again at the actual write boundary; duplicate intents are safe.
		if _, err = journalTestStorageObject(strings.TrimPrefix(key, prefix)); err != nil {
			return err
		}
	}
	config, err := loadStorageConfig()
	if err != nil {
		return err
	}
	_, err = newS3Client(config).PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(config.bucket), Key: aws.String(key), Body: bytes.NewReader(data),
		ContentType: aws.String(contentType), ContentLength: aws.Int64(int64(len(data))),
	})
	if err != nil {
		return fmt.Errorf("store object: %w", err)
	}
	return nil
}

func validPreparedObjectKey(key string) bool {
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "//") || strings.Contains(key, "\\") ||
		strings.ContainsFunc(key, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) {
		return false
	}
	for _, segment := range strings.Split(key, "/") {
		if segment == "." || segment == ".." || segment == "" {
			return false
		}
	}
	return true
}

func ReadStorageObject(ctx context.Context, key string, maxBytes int64) ([]byte, error) {
	if maxBytes <= 0 {
		return nil, errors.New("a positive object read limit is required")
	}
	config, err := loadStorageConfig()
	if err != nil {
		return nil, err
	}
	result, err := newS3Client(config).GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(config.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, fmt.Errorf("read object: %w", err)
	}
	defer result.Body.Close()
	data, err := io.ReadAll(io.LimitReader(result.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, errors.New("stored object exceeds its read limit")
	}
	return data, nil
}
