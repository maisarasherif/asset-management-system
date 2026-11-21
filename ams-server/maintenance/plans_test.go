package maintenance

import (
	"github.com/jackc/pgx/v5/pgtype"
	"testing"
	"time"
)

func TestMonthEndServiceDate(t *testing.T) {
	for _, tc := range []struct{ date, want string }{
		{"2026-01-31", "2026-02-28"},
		{"2028-01-31", "2028-02-29"},
		{"2026-12-31", "2027-01-31"},
	} {
		current, err := time.Parse(time.DateOnly, tc.date)
		if err != nil {
			t.Fatal(err)
		}
		got := addMonths(pgtype.Date{Time: current, Valid: true}, 1)
		if got.Time.Format(time.DateOnly) != tc.want {
			t.Errorf("one month after %s: got %s, want %s", tc.date, got.Time.Format(time.DateOnly), tc.want)
		}
	}
}
