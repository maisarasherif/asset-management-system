package utils

import (
	"fmt"
	"net/http"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ListFilters parses optional filters. Handlers define the fields and values
// that make sense for each collection.
type ListFilters struct {
	request *gin.Context
	invalid string
}

func ReadListFilters(c *gin.Context) *ListFilters {
	return &ListFilters{request: c}
}

func (f *ListFilters) Text(key string) string {
	value := strings.TrimSpace(f.request.Query(key))
	if utf8.RuneCountInString(value) > 200 {
		f.invalid = key
	}
	return value
}

func (f *ListFilters) Enum(key string, values ...string) string {
	value, present := f.request.Request.URL.Query()[key]
	if !present {
		return ""
	}
	if len(value) != 1 || !slices.Contains(values, value[0]) {
		f.invalid = key
		return ""
	}
	return value[0]
}

func (f *ListFilters) UUID(key string) uuid.UUID {
	value, present := f.request.Request.URL.Query()[key]
	if !present {
		return uuid.Nil
	}
	if len(value) == 1 {
		id, err := uuid.Parse(value[0])
		if err == nil && id != uuid.Nil {
			return id
		}
	}
	f.invalid = key
	return uuid.Nil
}

func (f *ListFilters) UUIDs(key string) []uuid.UUID {
	value, present := f.request.Request.URL.Query()[key]
	if !present {
		return []uuid.UUID{}
	}
	if len(value) == 1 {
		parts := strings.Split(value[0], ",")
		if len(parts) <= maxLimit {
			ids, err := ParseUUIDSlice(parts, key)
			if err == nil && !slices.Contains(ids, uuid.Nil) {
				return ids
			}
		}
	}
	f.invalid = key
	return []uuid.UUID{}
}

func (f *ListFilters) Valid() bool {
	if f.invalid == "" {
		return true
	}
	f.request.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid %s filter.", f.invalid)})
	return false
}
