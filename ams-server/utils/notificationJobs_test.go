package utils

import (
	"testing"

	"github.com/google/uuid"
)

func TestNotificationJobContracts(t *testing.T) {
	if (NotificationEmailArgs{}).Kind() != "notification_email" {
		t.Fatalf("expected generic email River kind, got %q", (NotificationEmailArgs{}).Kind())
	}
	if (NotificationClickUpArgs{}).Kind() != "notification_clickup" {
		t.Fatalf("expected generic ClickUp River kind, got %q", (NotificationClickUpArgs{}).Kind())
	}
}

func TestValidateNotificationDeliveryRejectsWrongChannel(t *testing.T) {
	params := NotificationDeliveryParams{
		SourceType:     NotificationSourceRoutineMaintenance,
		SourceID:       uuid.New(),
		Channel:        NotificationChannelClickUp,
		IdempotencyKey: "routine-maintenance:test:CLICKUP",
	}
	if err := validateNotificationDelivery(params, NotificationChannelEmail); err == nil {
		t.Fatal("expected wrong channel to be rejected")
	}
}
