package utils

import "github.com/jackc/pgx/v5/pgtype"

func TextPtr(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func PtrText(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}
