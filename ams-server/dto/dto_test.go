package dto

import (
	"encoding/json"
	"testing"
)

func TestPaginatedResponseMarshalJSONNormalizesNilSliceToEmptyArray(t *testing.T) {
	var items []string

	payload, err := json.Marshal(PaginatedResponse{
		Data: items,
		Meta: PaginationMeta{
			Page:       1,
			Limit:      10,
			Total:      0,
			TotalPages: 0,
		},
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	expected := `{"data":[],"meta":{"page":1,"limit":10,"total":0,"total_pages":0}}`
	if string(payload) != expected {
		t.Fatalf("expected %s, got %s", expected, string(payload))
	}
}

func TestPaginatedResponseMarshalJSONPreservesPopulatedSlice(t *testing.T) {
	payload, err := json.Marshal(PaginatedResponse{
		Data: []string{"one", "two"},
		Meta: PaginationMeta{
			Page:       1,
			Limit:      10,
			Total:      2,
			TotalPages: 1,
		},
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	expected := `{"data":["one","two"],"meta":{"page":1,"limit":10,"total":2,"total_pages":1}}`
	if string(payload) != expected {
		t.Fatalf("expected %s, got %s", expected, string(payload))
	}
}

func TestPaginatedResponseMarshalJSONNormalizesNilInterfaceToEmptyArray(t *testing.T) {
	payload, err := json.Marshal(PaginatedResponse{
		Data: nil,
		Meta: PaginationMeta{
			Page:       2,
			Limit:      25,
			Total:      0,
			TotalPages: 0,
		},
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	expected := `{"data":[],"meta":{"page":2,"limit":25,"total":0,"total_pages":0}}`
	if string(payload) != expected {
		t.Fatalf("expected %s, got %s", expected, string(payload))
	}
}
