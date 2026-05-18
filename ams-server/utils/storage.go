package utils

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type storageConfig struct {
	endpoint  string
	region    string
	accessKey string
	secretKey string
	bucket    string
}

func loadStorageConfig() (storageConfig, error) {
	config := storageConfig{
		endpoint:  strings.TrimRight(os.Getenv("R2_S3_ENDPOINT"), "/"),
		region:    os.Getenv("R2_S3_REGION"),
		accessKey: os.Getenv("R2_S3_ACCESS_KEY_ID"),
		secretKey: os.Getenv("R2_S3_SECRET_ACCESS_KEY"),
		bucket:    os.Getenv("R2_S3_BUCKET"),
	}

	var missing []string
	required := map[string]string{
		"R2_S3_ENDPOINT":          config.endpoint,
		"R2_S3_REGION":            config.region,
		"R2_S3_ACCESS_KEY_ID":     config.accessKey,
		"R2_S3_SECRET_ACCESS_KEY": config.secretKey,
		"R2_S3_BUCKET":            config.bucket,
	}
	for key, value := range required {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return storageConfig{}, fmt.Errorf("missing R2 storage configuration: %s", strings.Join(missing, ", "))
	}

	return config, nil
}

func newS3Client(config storageConfig) *s3.Client {
	return s3.New(s3.Options{
		BaseEndpoint: aws.String(config.endpoint),
		Region:       config.region,
		Credentials:  aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(config.accessKey, config.secretKey, "")),
		UsePathStyle: true,
	})
}

func safeFileName(fileName string) string {
	baseName := filepath.Base(strings.TrimSpace(fileName))
	if baseName == "." || baseName == string(filepath.Separator) || baseName == "" {
		baseName = "certificate-file"
	}

	var builder strings.Builder
	lastWasDash := false
	for _, r := range baseName {
		isUpperASCII := r >= 'A' && r <= 'Z'
		isSafe := isUpperASCII || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-'
		if isSafe {
			if isUpperASCII {
				r += 'a' - 'A'
			}
			builder.WriteRune(r)
			lastWasDash = false
			continue
		}
		if !lastWasDash {
			builder.WriteRune('-')
			lastWasDash = true
		}
	}

	safeName := strings.Trim(builder.String(), ".-_")
	if safeName == "" {
		return "certificate-file"
	}
	return safeName
}

func storageExtension(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "application/pdf":
		return ".pdf"
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	default:
		return ".bin"
	}
}

func certificateObjectKey(contentType string) string {
	now := time.Now().UTC()
	objectID := strings.ReplaceAll(uuid.NewString(), "-", "")
	return fmt.Sprintf(
		"certificate-files/%04d/%02d/%02d/cert_%s%s",
		now.Year(),
		now.Month(),
		now.Day(),
		objectID,
		storageExtension(contentType),
	)
}

func UploadFile(ctx context.Context, file multipart.File, header *multipart.FileHeader) (string, error) {
	if header == nil {
		return "", errors.New("file header is required")
	}

	config, err := loadStorageConfig()
	if err != nil {
		return "", err
	}
	client := newS3Client(config)
	contentType := header.Header.Get("Content-Type")
	key := certificateObjectKey(contentType)

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(config.bucket),
		Key:           aws.String(key),
		Body:          file,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(header.Size),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload file: %w", err)
	}

	return key, nil
}

func SignedURLFileName(fileName string, key string) string {
	safeName := safeFileName(fileName)
	if safeName != "certificate-file" {
		return safeName
	}

	ext := strings.ToLower(filepath.Ext(key))
	switch ext {
	case ".pdf", ".jpg", ".jpeg", ".png", ".webp":
		return "certificate-file" + ext
	default:
		return "certificate-file"
	}
}

func GenerateSignedURL(ctx context.Context, key string, fileName string) (string, error) {
	config, err := loadStorageConfig()
	if err != nil {
		return "", err
	}
	client := newS3Client(config)

	presignClient := s3.NewPresignClient(client)

	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket:                     aws.String(config.bucket),
		Key:                        aws.String(key),
		ResponseContentDisposition: aws.String(fmt.Sprintf(`inline; filename="%s"`, SignedURLFileName(fileName, key))),
	}, s3.WithPresignExpires(5*time.Minute))
	if err != nil {
		return "", fmt.Errorf("failed to generate signed URL: %w", err)
	}

	return req.URL, nil
}
