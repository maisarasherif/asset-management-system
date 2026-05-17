package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func GetCompetencyCategories(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		categories, err := queries.GetAllCompetencyCategoriesPaginated(ctx, db.GetAllCompetencyCategoriesPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch competency categories"})
			return
		}

		total, err := queries.CountCompetencyCategories(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count competency categories"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: categories,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetActiveCompetencyCategories(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		categories, err := db.New(pool).GetActiveCompetencyCategories(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch competency categories"})
			return
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(categories))
	}
}

func AddCompetencyCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.CompetencyCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		category, err := db.New(pool).CreateCompetencyCategory(ctx, db.CreateCompetencyCategoryParams{
			CategoryCode: input.CategoryCode,
			CategoryName: input.CategoryName,
			Description:  input.Description,
			Active:       input.Active,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "competency category code is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add competency category"})
			return
		}

		c.JSON(http.StatusCreated, category)
	}
}

func UpdateCompetencyCategory(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID, ok := utils.ParseUUIDParam(c, "competency_category_id")
		if !ok {
			return
		}

		var input dto.CompetencyCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		rows, err := db.New(pool).UpdateCompetencyCategory(ctx, db.UpdateCompetencyCategoryParams{
			CategoryCode:         input.CategoryCode,
			CategoryName:         input.CategoryName,
			Description:          input.Description,
			Active:               input.Active,
			CompetencyCategoryID: categoryID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				c.JSON(http.StatusConflict, gin.H{"error": "competency category code is already in use"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update competency category"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "competency category not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "competency category updated successfully"})
	}
}

func GetCompetentPersons(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		people, err := queries.GetAllCompetentPersonsPaginated(ctx, db.GetAllCompetentPersonsPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch competent persons"})
			return
		}

		total, err := queries.CountCompetentPersons(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count competent persons"})
			return
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: people,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetActiveCompetentPersons(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		people, err := db.New(pool).GetActiveCompetentPersons(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch competent persons"})
			return
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(people))
	}
}

func AddCompetentPerson(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.CompetentPersonInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		categoryID, err := utils.ParseUUID(input.CompetencyCategoryID, "competency_category_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)
		if _, err := queries.GetCompetencyCategoryByID(ctx, categoryID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "competency category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate competency category"})
			return
		}

		person, err := queries.CreateCompetentPerson(ctx, db.CreateCompetentPersonParams{
			FullName:             input.FullName,
			PersonType:           input.PersonType,
			Organization:         input.Organization,
			CompetencyCategoryID: categoryID,
			Active:               input.Active,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add competent person"})
			return
		}

		c.JSON(http.StatusCreated, person)
	}
}

func UpdateCompetentPerson(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		personID, ok := utils.ParseUUIDParam(c, "competent_person_id")
		if !ok {
			return
		}

		var input dto.CompetentPersonInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		categoryID, err := utils.ParseUUID(input.CompetencyCategoryID, "competency_category_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)
		if _, err := queries.GetCompetencyCategoryByID(ctx, categoryID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "competency category not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate competency category"})
			return
		}

		rows, err := queries.UpdateCompetentPerson(ctx, db.UpdateCompetentPersonParams{
			FullName:             input.FullName,
			PersonType:           input.PersonType,
			Organization:         input.Organization,
			CompetencyCategoryID: categoryID,
			Active:               input.Active,
			CompetentPersonID:    personID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update competent person"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "competent person not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "competent person updated successfully"})
	}
}
