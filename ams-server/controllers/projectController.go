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

func GetProjects(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		projects, err := db.New(pool).GetAllProjects(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch projects"})
			return
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(projects))
	}
}

func AddProject(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.ProjectInput
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

		project, err := db.New(pool).CreateProject(ctx, db.CreateProjectParams{
			ProjectName: input.ProjectName,
			Description: input.Description,
			Status:      input.Status,
		})
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "failed to create project"})
			return
		}

		c.JSON(http.StatusCreated, project)
	}
}

func UpdateProject(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID, ok := utils.ParseUUIDParam(c, "project_id")
		if !ok {
			return
		}

		var input dto.ProjectInput
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

		rows, err := db.New(pool).UpdateProject(ctx, db.UpdateProjectParams{
			ProjectName: input.ProjectName,
			Description: input.Description,
			Status:      input.Status,
			ProjectID:   projectID,
		})
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "failed to update project"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "project updated successfully"})
	}
}

func GetUserProjectAccess(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		access, err := db.New(pool).ListAllUserProjectAccess(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch project access"})
			return
		}

		c.JSON(http.StatusOK, dto.NormalizeListData(access))
	}
}

func UpsertUserProjectAccess(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}

		var input dto.UserProjectAccessInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
			return
		}
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		projectID, err := utils.ParseUUID(input.ProjectID, "project_id")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)
		if _, err := queries.GetUserByID(ctx, userID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate user"})
			return
		}
		if _, err := queries.GetProjectByID(ctx, projectID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate project"})
			return
		}

		access, err := queries.UpsertUserProjectAccess(ctx, db.UpsertUserProjectAccessParams{
			UserID:    userID,
			ProjectID: projectID,
			Status:    input.Status,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save project access"})
			return
		}

		c.JSON(http.StatusOK, access)
	}
}

func UpdateUserProjectAccess(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		accessID, ok := utils.ParseUUIDParam(c, "access_id")
		if !ok {
			return
		}

		var input dto.UserProjectAccessInput
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

		rows, err := db.New(pool).UpdateUserProjectAccessStatus(ctx, db.UpdateUserProjectAccessStatusParams{
			Status:   input.Status,
			AccessID: accessID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project access"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "project access not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "project access updated successfully"})
	}
}

func DeleteUserProjectAccess(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		accessID, ok := utils.ParseUUIDParam(c, "access_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		rows, err := db.New(pool).DeleteUserProjectAccess(ctx, accessID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete project access"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "project access not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "project access deleted successfully"})
	}
}
