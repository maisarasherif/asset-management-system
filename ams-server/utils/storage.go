package utils

import (
	"context"
	"fmt"
	"mime/multipart"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func newS3Client() *s3.Client {
	endpoint := os.Getenv("SUPABASE_S3_ENDPOINT")
	region := os.Getenv("SUPABASE_S3_REGION")
	accessKey := os.Getenv("SUPABASE_S3_ACCESS_KEY")
	secretKey := os.Getenv("SUPABASE_S3_SECRET_KEY")

	return s3.New(s3.Options{
		BaseEndpoint: aws.String(endpoint),
		Region:       region,
		Credentials:  aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		UsePathStyle: true,
	})
}

func UploadFile(ctx context.Context, file multipart.File, header *multipart.FileHeader, certificateID string) (string, error) {
	client := newS3Client()
	bucket := os.Getenv("SUPABASE_S3_BUCKET")

	key := fmt.Sprintf("certificates/%s/%s", certificateID, header.Filename)

	_, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          file,
		ContentType:   aws.String(header.Header.Get("Content-Type")),
		ContentLength: aws.Int64(header.Size),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload file: %w", err)
	}

	return key, nil
}

func GenerateSignedURL(ctx context.Context, key string) (string, error) {
	client := newS3Client()
	bucket := os.Getenv("SUPABASE_S3_BUCKET")

	presignClient := s3.NewPresignClient(client)

	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", fmt.Errorf("failed to generate signed URL: %w", err)
	}

	return req.URL, nil
}
