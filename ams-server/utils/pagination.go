package utils

import (
	"math"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
)

const (
	defaultPage  = 1
	defaultLimit = 20
	maxLimit     = 100
)

func ParsePagination(c *gin.Context) (limit int32, offset int32, meta dto.PaginationQuery) {
	page := defaultPage
	limit64 := int64(defaultLimit)

	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}

	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.ParseInt(l, 10, 64); err == nil && parsed > 0 {
			if parsed > maxLimit {
				parsed = maxLimit
			}
			limit64 = parsed
		}
	}

	offset64 := int64((page - 1) * int(limit64))

	return int32(limit64), int32(offset64), dto.PaginationQuery{
		Page:  page,
		Limit: int(limit64),
	}
}

func BuildMeta(query dto.PaginationQuery, total int64) dto.PaginationMeta {
	totalPages := int(math.Ceil(float64(total) / float64(query.Limit)))
	if totalPages == 0 {
		totalPages = 1
	}
	return dto.PaginationMeta{
		Page:       query.Page,
		Limit:      query.Limit,
		Total:      total,
		TotalPages: totalPages,
	}
}
