package controllers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"golang.org/x/crypto/bcrypt"
)

type RegisterInput struct {
	FirstName string `json:"first_name" validate:"required,min=2,max=100"`
	LastName  string `json:"last_name" validate:"required,min=2,max=100"`
	Email     string `json:"email" validate:"required,email"`
	Password  string `json:"password" validate:"required,min=6"`
	Role      string `json:"role" validate:"required,oneof=ADMIN USER"`
}

type LoginInput struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

type UserResponse struct {
	UserID       string `json:"user_id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	Token        string `json:"token"`
	RefreshToken string `json:"refresh_token"`
}

func HashPassword(password string) (string, error) {
	hashPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashPassword), nil
}

func RegisterUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input RegisterInput

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input data"})
			return
		}

		validate := validator.New()
		if err := validate.Struct(input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		count, err := queries.CountUsersByEmail(ctx, input.Email)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check existing users"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
			return
		}

		hashedPassword, err := HashPassword(input.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "hashing password failed"})
			return
		}

		user, err := queries.CreateUser(ctx, db.CreateUserParams{
			UserID:    uuid.New().String(),
			FirstName: input.FirstName,
			LastName:  input.LastName,
			Email:     input.Email,
			Password:  hashedPassword,
			Role:      input.Role,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"user_id": user.UserID})
	}
}

func LoginUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input LoginInput

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input data"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		foundUser, err := queries.GetUserByEmail(ctx, input.Email)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
			return
		}

		if err = bcrypt.CompareHashAndPassword([]byte(foundUser.Password), []byte(input.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
			return
		}

		token, refreshToken, err := utils.GenerateAllTokens(
			foundUser.Email,
			foundUser.FirstName,
			foundUser.LastName,
			foundUser.Role,
			foundUser.UserID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate tokens"})
			return
		}

		if err = utils.UpdateAllTokens(pool, foundUser.UserID, token, refreshToken); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tokens"})
			return
		}

		c.JSON(http.StatusOK, UserResponse{
			UserID:       foundUser.UserID,
			FirstName:    foundUser.FirstName,
			LastName:     foundUser.LastName,
			Email:        foundUser.Email,
			Role:         foundUser.Role,
			Token:        token,
			RefreshToken: refreshToken,
		})
	}
}

func SeedAdminUser(pool *pgxpool.Pool) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	queries := db.New(pool)

	count, err := queries.CountUsers(ctx)
	if err != nil {
		log.Fatal("Could not check for existing users:", err)
	}

	if count > 0 {
		return
	}

	fmt.Println("No users found. Creating default admin...")

	hashedPassword, err := HashPassword("Admin@123")
	if err != nil {
		log.Fatal("Failed to hash admin password:", err)
	}

	_, err = queries.CreateUser(ctx, db.CreateUserParams{
		UserID:    uuid.New().String(),
		FirstName: "Super",
		LastName:  "Admin",
		Email:     "maisara.sherif.ms@gmail.com",
		Password:  hashedPassword,
		Role:      "ADMIN",
	})
	if err != nil {
		log.Fatal("Failed to seed admin user:", err)
	}

	fmt.Println("Default admin created")
}
