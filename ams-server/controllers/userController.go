package controllers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
	"github.com/maisarasherif/asset-management-system/ams-server/dto"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"golang.org/x/crypto/bcrypt"
)

func HashPassword(password string) (string, error) {
	hashPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashPassword), nil
}

func GetUsers(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)

		queries := db.New(pool)

		users, err := queries.GetAllUsersPaginated(ctx, db.GetAllUsersPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch users"})
			return
		}

		total, err := queries.CountUsers(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count users"})
			return
		}

		response := make([]dto.UserResponse, len(users))
		for i, u := range users {
			response[i] = dto.UserResponse{
				UserID:    u.UserID,
				FirstName: u.FirstName,
				LastName:  u.LastName,
				Email:     u.Email,
				Role:      u.Role,
				CreatedAt: u.CreatedAt,
				UpdatedAt: u.UpdatedAt,
			}
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: response,
			Meta: utils.BuildMeta(query, total),
		})
	}
}

func GetUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		user, err := queries.GetUserByID(ctx, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		c.JSON(http.StatusOK, dto.UserResponse{
			UserID:    user.UserID,
			FirstName: user.FirstName,
			LastName:  user.LastName,
			Email:     user.Email,
			Role:      user.Role,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		})
	}
}

func RegisterUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.RegisterInput

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input data"})
			return
		}
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

		adminID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("new_user_id", user.UserID).
			Str("email", user.Email).
			Str("role", user.Role).
			Str("created_by", adminID).
			Msg("new user registered")

		c.JSON(http.StatusCreated, dto.UserResponse{
			UserID:    user.UserID,
			FirstName: user.FirstName,
			LastName:  user.LastName,
			Email:     user.Email,
			Role:      user.Role,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		})
	}
}

func UpdateUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")

		var input dto.UpdateUserInput
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

		queries := db.New(pool)

		existingUser, err := queries.GetUserByID(ctx, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		count, err := queries.CountUsersByEmailExcluding(ctx, db.CountUsersByEmailExcludingParams{
			Email:  input.Email,
			UserID: userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate email"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "email already in use by another user"})
			return
		}

		rows, err := queries.UpdateUser(ctx, db.UpdateUserParams{
			FirstName: input.FirstName,
			LastName:  input.LastName,
			Email:     input.Email,
			Role:      input.Role,
			UserID:    userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		if existingUser.Role != input.Role {
			adminID, _ := utils.GetUserIdFromContext(c)
			logger.Log.Warn().
				Str("user_id", userID).
				Str("old_role", existingUser.Role).
				Str("new_role", input.Role).
				Str("changed_by", adminID).
				Msg("user role changed")
		}

		c.JSON(http.StatusOK, gin.H{"message": "user updated successfully"})
	}
}

func UpdatePassword(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")

		var input dto.UpdatePasswordInput
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

		queries := db.New(pool)

		email := c.GetString("email")
		existingUser, err := queries.GetUserByEmail(ctx, email)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		if err = bcrypt.CompareHashAndPassword([]byte(existingUser.Password), []byte(input.CurrentPassword)); err != nil {
			logger.Log.Warn().
				Str("user_id", userID).
				Msg("failed password update attempt: incorrect current password")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "current password is incorrect"})
			return
		}

		hashedPassword, err := HashPassword(input.NewPassword)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "hashing password failed"})
			return
		}

		rows, err := queries.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
			Password: hashedPassword,
			UserID:   userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		logger.Log.Info().
			Str("user_id", userID).
			Msg("password updated successfully")

		c.JSON(http.StatusOK, gin.H{"message": "password updated successfully"})
	}
}

func DeleteUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")

		requestingUserID, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "could not identify requesting user"})
			return
		}
		if requestingUserID == userID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete your own account"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		targetUser, err := queries.GetUserByID(ctx, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		rows, err := queries.DeleteUser(ctx, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		logger.Log.Warn().
			Str("deleted_user_id", userID).
			Str("deleted_email", targetUser.Email).
			Str("deleted_by", requestingUserID).
			Msg("user deleted")

		c.JSON(http.StatusOK, gin.H{"message": "user deleted successfully"})
	}
}

func PatchUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("user_id")

		var input dto.PatchUserInput
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

		queries := db.New(pool)

		existingUser, err := queries.GetUserByID(ctx, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		firstName := existingUser.FirstName
		lastName := existingUser.LastName
		email := existingUser.Email
		role := existingUser.Role

		if input.FirstName != nil {
			firstName = *input.FirstName
		}
		if input.LastName != nil {
			lastName = *input.LastName
		}
		if input.Email != nil {
			email = *input.Email
		}
		if input.Role != nil {
			role = *input.Role
		}

		count, err := queries.CountUsersByEmailExcluding(ctx, db.CountUsersByEmailExcludingParams{
			Email:  email,
			UserID: userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate email"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "email already in use by another user"})
			return
		}

		rows, err := queries.UpdateUser(ctx, db.UpdateUserParams{
			FirstName: firstName,
			LastName:  lastName,
			Email:     email,
			Role:      role,
			UserID:    userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
			return
		}
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		if existingUser.Role != role {
			adminID, _ := utils.GetUserIdFromContext(c)
			logger.Log.Warn().
				Str("user_id", userID).
				Str("old_role", existingUser.Role).
				Str("new_role", role).
				Str("changed_by", adminID).
				Msg("user role changed")
		}

		c.JSON(http.StatusOK, gin.H{"message": "user updated successfully"})
	}
}

func LoginUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input dto.LoginInput

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input data"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		foundUser, err := queries.GetUserByEmail(ctx, input.Email)
		if err != nil {
			logger.Log.Warn().
				Str("email", input.Email).
				Str("ip", c.ClientIP()).
				Msg("failed login attempt: email not found")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
			return
		}

		if err = bcrypt.CompareHashAndPassword([]byte(foundUser.Password), []byte(input.Password)); err != nil {
			logger.Log.Warn().
				Str("email", input.Email).
				Str("ip", c.ClientIP()).
				Msg("failed login attempt: incorrect password")
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

		c.JSON(http.StatusOK, dto.LoginResponse{
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

func LogoutUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "could not identify requesting user"})
			return
		}

		if err = utils.UpdateAllTokens(pool, userID, "", ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to logout user"})
			return
		}

		logger.Log.Info().Str("user_id", userID).Msg("user logged out successfully")
		c.JSON(http.StatusOK, gin.H{"message": "user logged out successfully"})
	}
}

func SeedAdminUser(pool *pgxpool.Pool) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	queries := db.New(pool)

	count, err := queries.CountUsers(ctx)
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("could not check for existing users")
	}

	if count > 0 {
		return
	}

	logger.Log.Info().Msg("no users found, creating default admin")

	hashedPassword, err := HashPassword("Admin@123")
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("failed to hash admin password")
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
		logger.Log.Fatal().Err(err).Msg("failed to seed admin user")
	}

	fmt.Println("Default admin created")
}
