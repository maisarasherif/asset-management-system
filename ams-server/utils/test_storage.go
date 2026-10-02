package utils

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// A run journals upload intentions before PutObject, so even uncertain uploads
// and objects whose database rows were reset can be safely cleaned up.
func testStorageScope() (string, string, error) {
	prefix := os.Getenv("AMS_TEST_STORAGE_PREFIX")
	manifest := os.Getenv("AMS_TEST_STORAGE_MANIFEST")
	if prefix == "" && manifest == "" {
		return "", "", nil
	}
	if os.Getenv("APP_ENV") != "test" {
		return "", "", errors.New("test storage requires APP_ENV=test")
	}
	if os.Getenv("DATABASE_URL") == "" {
		return "", "", errors.New("test storage requires an explicit database URL")
	}
	databaseConfig, err := pgx.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil || !regexp.MustCompile(`^ams_e2e_[A-Za-z0-9_]+$`).MatchString(databaseConfig.Database) {
		return "", "", errors.New("test storage requires an ams_e2e_ database")
	}
	runID := strings.TrimSuffix(strings.TrimPrefix(prefix, "ams-e2e/"), "/")
	parsed, err := uuid.Parse(runID)
	if err != nil || prefix != "ams-e2e/"+parsed.String()+"/" {
		return "", "", errors.New("test storage prefix must be ams-e2e/<canonical UUID>/")
	}
	if !filepath.IsAbs(manifest) {
		return "", "", errors.New("test storage manifest must be an absolute file path")
	}
	return prefix, manifest, nil
}

func journalTestStorageObject(key string) (string, error) {
	prefix, manifest, err := testStorageScope()
	if err != nil || prefix == "" {
		return key, err
	}
	key = prefix + key
	file, err := os.OpenFile(manifest, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0600)
	if err != nil {
		return "", fmt.Errorf("open test storage manifest: %w", err)
	}
	// One append per entry allows the Go suite and API to share the journal on
	// Fedora. Persist it before making a request with an uncertain outcome.
	_, writeErr := file.WriteString(key + "\n")
	syncErr := file.Sync()
	closeErr := file.Close()
	if err := errors.Join(writeErr, syncErr, closeErr); err != nil {
		return "", fmt.Errorf("persist test storage intent: %w", err)
	}
	return key, nil
}

func readTestStorageKeys(prefix, manifest string) ([]string, error) {
	file, err := os.Open(manifest)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var keys []string
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		key := scanner.Text()
		if !strings.HasPrefix(key, prefix) || key == prefix ||
			strings.ContainsAny(key, "\\\r\t ") || strings.Contains(key, "//") {
			return nil, errors.New("manifest contains an object outside the test run scope")
		}
		for _, segment := range strings.Split(key, "/") {
			if segment == "." || segment == ".." {
				return nil, errors.New("manifest contains an invalid object key")
			}
		}
		if !seen[key] {
			seen[key] = true
			keys = append(keys, key)
		}
	}
	return keys, scanner.Err()
}

// CleanupTestStorageObjects never lists the bucket. It validates the entire
// journal before deleting only this run's recorded keys. Keep the journal for
// idempotent retries after any partial failure.
func CleanupTestStorageObjects(ctx context.Context) (int, error) {
	prefix, manifest, err := testStorageScope()
	if err != nil {
		return 0, err
	}
	if prefix == "" {
		return 0, errors.New("test storage scope is required for cleanup")
	}
	keys, err := readTestStorageKeys(prefix, manifest)
	if err != nil || len(keys) == 0 {
		return 0, err
	}
	config, err := loadStorageConfig()
	if err != nil {
		return 0, err
	}
	client := newS3Client(config)
	deleted := 0
	var failures []error
	for _, key := range keys {
		_, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(config.bucket), Key: aws.String(key),
		})
		if err != nil {
			failures = append(failures, fmt.Errorf("delete %s: %w", key, err))
			continue
		}
		deleted++
	}
	return deleted, errors.Join(failures...)
}
