package utils

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func ParseUUID(value string, fieldName string) (uuid.UUID, error) {
	parsed, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, fmt.Errorf("%s must be a valid UUID", fieldName)
	}

	return parsed, nil
}

func ParseOptionalUUID(value *string, fieldName string) (*uuid.UUID, error) {
	if value == nil || *value == "" {
		return nil, nil
	}

	parsed, err := ParseUUID(*value, fieldName)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}

func ParseUUIDParam(c *gin.Context, paramName string) (uuid.UUID, bool) {
	parsed, err := ParseUUID(c.Param(paramName), paramName)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return uuid.Nil, false
	}

	return parsed, true
}

func ParseUUIDSlice(values []string, fieldName string) ([]uuid.UUID, error) {
	parsed := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := ParseUUID(value, fieldName)
		if err != nil {
			return nil, err
		}
		parsed = append(parsed, id)
	}

	return parsed, nil
}

func UUIDStrings(values []uuid.UUID) []string {
	ids := make([]string, 0, len(values))
	for _, value := range values {
		ids = append(ids, value.String())
	}

	return ids
}
