package controllers

import (
	"testing"
	"time"
)

func TestComputeCertificateStatusAtUsesCalendarDates(t *testing.T) {
	today := time.Date(2026, time.May, 13, 15, 30, 0, 0, time.UTC)

	cases := []struct {
		name       string
		expiryDate time.Time
		expected   string
	}{
		{
			name:       "past calendar date is expired",
			expiryDate: time.Date(2026, time.April, 30, 0, 0, 0, 0, time.UTC),
			expected:   "EXPIRED",
		},
		{
			name:       "same calendar date is expiring soon",
			expiryDate: time.Date(2026, time.May, 13, 0, 0, 0, 0, time.UTC),
			expected:   "EXPIRING_SOON",
		},
		{
			name:       "within thirty calendar days is expiring soon",
			expiryDate: time.Date(2026, time.June, 12, 0, 0, 0, 0, time.UTC),
			expected:   "EXPIRING_SOON",
		},
		{
			name:       "after thirty calendar days is valid",
			expiryDate: time.Date(2026, time.June, 13, 0, 0, 0, 0, time.UTC),
			expected:   "VALID",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if actual := computeCertificateStatusAt(tc.expiryDate, today); actual != tc.expected {
				t.Fatalf("expected %s, got %s", tc.expected, actual)
			}
		})
	}
}
