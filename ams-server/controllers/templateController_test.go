package controllers

import (
	"encoding/json"
	"testing"

	"github.com/maisarasherif/asset-management-system/ams-server/dto"
)

func TestTemplateComponentTestsOrEmptySerializesAsArray(t *testing.T) {
	response := dto.TemplateConfigurationComponentResponse{
		Tests: templateComponentTestsOrEmpty(nil),
	}

	raw, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal template configuration response: %v", err)
	}

	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("failed to unmarshal template configuration response: %v", err)
	}

	tests, ok := body["tests"].([]any)
	if !ok {
		t.Fatalf("expected tests to serialize as an array, got %T in %s", body["tests"], string(raw))
	}
	if len(tests) != 0 {
		t.Fatalf("expected no tests, got %d", len(tests))
	}
}
