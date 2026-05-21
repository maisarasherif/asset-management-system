package controllers

import (
	"context"
	"net/http"
	"os"
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

func isSuperAdminRole(role string) bool {
	return role == "SUPER_ADMIN"
}

func isAdminRole(role string) bool {
	return role == "ADMIN" || role == "SUPER_ADMIN"
}

func canManageRole(requestingRole, targetRole string) bool {
	return isSuperAdminRole(requestingRole) || !isAdminRole(targetRole)
}

func stringFromContext(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func normalizedUserStatus(status string) string {
	if status == "" {
		return "ACTIVE"
	}
	return status
}

func userLabel(firstName, lastName, email string) string {
	if firstName != "" || lastName != "" {
		return firstName + " " + lastName
	}
	return email
}

func actorEmailFromContext(c *gin.Context) string {
	email, exists := c.Get("email")
	if !exists {
		return ""
	}
	if value, ok := email.(string); ok {
		return value
	}
	return ""
}

func auditUserManagement(ctx context.Context, queries *db.Queries, c *gin.Context, action string, targetUserID *uuid.UUID, targetEmail, targetRoleBefore, targetRoleAfter, details string) {
	actorID, _ := utils.GetUserIdFromContext(c)
	var actorUUID *uuid.UUID
	if actorID != "" {
		if parsedActorID, err := utils.ParseUUID(actorID, "user_id"); err == nil {
			actorUUID = &parsedActorID
		}
	}

	if _, err := queries.CreateUserManagementAuditLog(ctx, db.CreateUserManagementAuditLogParams{
		ActorUserID:      actorUUID,
		ActorEmail:       actorEmailFromContext(c),
		Action:           action,
		TargetUserID:     targetUserID,
		TargetEmail:      targetEmail,
		TargetRoleBefore: targetRoleBefore,
		TargetRoleAfter:  targetRoleAfter,
		Details:          details,
		IpAddress:        c.ClientIP(),
	}); err != nil {
		logger.Log.Error().Err(err).Str("action", action).Msg("failed to write user management audit log")
	}
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
				UserID:    u.UserID.String(),
				FirstName: u.FirstName,
				LastName:  u.LastName,
				Email:     u.Email,
				Role:      u.Role,
				Status:    u.Status,
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
		userID, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		queries := db.New(pool)

		user, err := queries.GetUserByID(ctx, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		c.JSON(http.StatusOK, dto.UserResponse{
			UserID:    user.UserID.String(),
			FirstName: user.FirstName,
			LastName:  user.LastName,
			Email:     user.Email,
			Role:      user.Role,
			Status:    user.Status,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		})
	}
}

func GetUserManagementAuditLogs(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		limit, offset, query := utils.ParsePagination(c)
		queries := db.New(pool)

		logs, err := queries.GetUserManagementAuditLogsPaginated(ctx, db.GetUserManagementAuditLogsPaginatedParams{
			Limit:  limit,
			Offset: offset,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch user management audit logs"})
			return
		}

		total, err := queries.CountUserManagementAuditLogs(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count user management audit logs"})
			return
		}

		response := make([]dto.UserManagementAuditLogResponse, len(logs))
		for i, log := range logs {
			actorUserID := ""
			if log.ActorUserID != nil {
				actorUserID = log.ActorUserID.String()
			}
			targetUserID := ""
			if log.TargetUserID != nil {
				targetUserID = log.TargetUserID.String()
			}
			response[i] = dto.UserManagementAuditLogResponse{
				AuditID:          log.AuditID.String(),
				ActorUserID:      actorUserID,
				ActorEmail:       log.ActorEmail,
				Action:           log.Action,
				TargetUserID:     targetUserID,
				TargetEmail:      log.TargetEmail,
				TargetRoleBefore: log.TargetRoleBefore,
				TargetRoleAfter:  log.TargetRoleAfter,
				Details:          log.Details,
				IPAddress:        log.IpAddress,
				CreatedAt:        log.CreatedAt.Time,
			}
		}

		c.JSON(http.StatusOK, dto.PaginatedResponse{
			Data: response,
			Meta: utils.BuildMeta(query, total),
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

		requestingRole, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		if !canManageRole(requestingRole, input.Role) {
			c.JSON(http.StatusForbidden, gin.H{"error": "only SUPER ADMIN can create admin users"})
			return
		}

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
			FirstName: input.FirstName,
			LastName:  input.LastName,
			Email:     input.Email,
			Password:  hashedPassword,
			Role:      input.Role,
			Status:    normalizedUserStatus(input.Status),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}

		adminID, _ := utils.GetUserIdFromContext(c)
		logger.Log.Info().
			Str("new_user_id", user.UserID.String()).
			Str("email", user.Email).
			Str("role", user.Role).
			Str("created_by", adminID).
			Msg("new user registered")
		auditUserManagement(ctx, queries, c, "CREATE_USER", &user.UserID, user.Email, "", user.Role, "Created user "+userLabel(user.FirstName, user.LastName, user.Email))

		c.JSON(http.StatusCreated, dto.UserResponse{
			UserID:    user.UserID.String(),
			FirstName: user.FirstName,
			LastName:  user.LastName,
			Email:     user.Email,
			Role:      user.Role,
			Status:    user.Status,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		})
	}
}

func UpdateUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}

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

		requestingRole, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		if (!canManageRole(requestingRole, existingUser.Role)) || (!canManageRole(requestingRole, input.Role)) {
			c.JSON(http.StatusForbidden, gin.H{"error": "only SUPER ADMIN can manage admin users"})
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
			Status:    input.Status,
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
				Str("user_id", userID.String()).
				Str("old_role", existingUser.Role).
				Str("new_role", input.Role).
				Str("changed_by", adminID).
				Msg("user role changed")
		}
		auditUserManagement(ctx, queries, c, "UPDATE_USER", &userID, input.Email, existingUser.Role, input.Role, "Updated user "+userLabel(input.FirstName, input.LastName, input.Email))

		c.JSON(http.StatusOK, gin.H{"message": "user updated successfully"})
	}
}

func UpdatePassword(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
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

		userID, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		parsedUserID, err := utils.ParseUUID(userID, "user_id")
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		existingPassword, err := queries.GetUserPasswordByID(ctx, parsedUserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch user password"})
			return
		}

		if err = bcrypt.CompareHashAndPassword([]byte(existingPassword), []byte(input.CurrentPassword)); err != nil {
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
			UserID:   parsedUserID,
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

func AdminUpdateUserPassword(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}

		var input dto.AdminUpdateUserPasswordInput
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

		requestingUserID, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		requestingUserUUID, err := utils.ParseUUID(requestingUserID, "user_id")
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		requestingUser, err := queries.GetUserByID(ctx, requestingUserUUID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		if !isSuperAdminRole(requestingUser.Role) {
			logger.Log.Warn().
				Str("target_user_id", userID.String()).
				Str("requested_by", requestingUserID).
				Msg("blocked non-super-admin password change")
			c.JSON(http.StatusForbidden, gin.H{"error": "only SUPER ADMIN can change user passwords"})
			return
		}

		targetUser, err := queries.GetUserByID(ctx, userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
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

		if err = queries.UpdateUserTokens(ctx, db.UpdateUserTokensParams{
			Token:        "",
			RefreshToken: "",
			UserID:       userID,
		}); err != nil {
			logger.Log.Error().Err(err).Str("target_user_id", userID.String()).Msg("failed to clear tokens after password reset")
		}

		logger.Log.Warn().
			Str("target_user_id", userID.String()).
			Str("target_email", targetUser.Email).
			Str("changed_by", requestingUserID).
			Msg("user password changed by super admin")
		auditUserManagement(ctx, queries, c, "RESET_PASSWORD", &userID, targetUser.Email, targetUser.Role, targetUser.Role, "Password reset by SUPER ADMIN")

		c.JSON(http.StatusOK, gin.H{"message": "password updated successfully"})
	}
}

func DeleteUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}

		requestingUserID, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "could not identify requesting user"})
			return
		}
		requestingUserUUID, err := uuid.Parse(requestingUserID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "could not identify requesting user"})
			return
		}
		if requestingUserUUID == userID {
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

		requestingRole, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		if !canManageRole(requestingRole, targetUser.Role) {
			c.JSON(http.StatusForbidden, gin.H{"error": "only SUPER ADMIN can delete admin users"})
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
			Str("deleted_user_id", userID.String()).
			Str("deleted_email", targetUser.Email).
			Str("deleted_by", requestingUserID).
			Msg("user deleted")
		auditUserManagement(ctx, queries, c, "DELETE_USER", &userID, targetUser.Email, targetUser.Role, "", "Deleted user "+userLabel(targetUser.FirstName, targetUser.LastName, targetUser.Email))

		c.JSON(http.StatusOK, gin.H{"message": "user deleted successfully"})
	}
}

func PatchUser(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := utils.ParseUUIDParam(c, "user_id")
		if !ok {
			return
		}

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
		status := existingUser.Status

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
		if input.Status != nil {
			status = *input.Status
		}

		requestingRole, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		if (!canManageRole(requestingRole, existingUser.Role)) || (!canManageRole(requestingRole, role)) {
			c.JSON(http.StatusForbidden, gin.H{"error": "only SUPER ADMIN can manage admin users"})
			return
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
			Status:    status,
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
				Str("user_id", userID.String()).
				Str("old_role", existingUser.Role).
				Str("new_role", role).
				Str("changed_by", adminID).
				Msg("user role changed")
		}
		auditUserManagement(ctx, queries, c, "UPDATE_USER", &userID, email, existingUser.Role, role, "Patched user "+userLabel(firstName, lastName, email))

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
		if foundUser.Status != "ACTIVE" {
			logger.Log.Warn().
				Str("user_id", foundUser.UserID.String()).
				Str("email", foundUser.Email).
				Str("ip", c.ClientIP()).
				Msg("blocked login attempt for suspended user")
			c.JSON(http.StatusForbidden, gin.H{"error": "user account is suspended"})
			return
		}

		token, refreshToken, err := utils.GenerateAllTokens(
			foundUser.Email,
			foundUser.FirstName,
			foundUser.LastName,
			foundUser.Role,
			foundUser.UserID.String(),
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate tokens"})
			return
		}

		if err = utils.UpdateAllTokens(pool, foundUser.UserID.String(), token, refreshToken); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tokens"})
			return
		}
		utils.SetAccessTokenCookie(c, token)

		logger.Log.Info().
			Str("user_id", foundUser.UserID.String()).
			Str("email", foundUser.Email).
			Str("role", foundUser.Role).
			Str("ip", c.ClientIP()).
			Msg("user logged in")

		c.JSON(http.StatusOK, dto.LoginResponse{
			UserID:                 foundUser.UserID.String(),
			FirstName:              foundUser.FirstName,
			LastName:               foundUser.LastName,
			Email:                  foundUser.Email,
			Role:                   foundUser.Role,
			Status:                 foundUser.Status,
			Token:                  token,
			CanManageUserPasswords: isSuperAdminRole(foundUser.Role),
		})

	}
}

func GetSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := utils.GetUserIdFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "could not identify requesting user"})
			return
		}

		email, _ := c.Get("email")
		firstName, _ := c.Get("firstName")
		lastName, _ := c.Get("lastName")
		role, err := utils.GetRoleFromContext(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "could not identify requesting user role"})
			return
		}

		c.JSON(http.StatusOK, dto.LoginResponse{
			UserID:                 userID,
			FirstName:              stringFromContext(firstName),
			LastName:               stringFromContext(lastName),
			Email:                  stringFromContext(email),
			Role:                   role,
			Status:                 "ACTIVE",
			CanManageUserPasswords: isSuperAdminRole(role),
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

		utils.ClearAccessTokenCookie(c)
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

	email := os.Getenv("SEED_ADMIN_EMAIL")
	password := os.Getenv("SEED_ADMIN_PASSWORD")

	if count > 0 {
		if email != "" {
			if rows, err := queries.UpdateUserRoleByEmail(ctx, db.UpdateUserRoleByEmailParams{
				Email: email,
				Role:  "SUPER_ADMIN",
			}); err != nil {
				logger.Log.Fatal().Err(err).Msg("failed to promote seeded super admin")
			} else if rows > 0 {
				logger.Log.Info().Str("email", email).Msg("seeded admin promoted to SUPER_ADMIN")
			}
		}
		return
	}

	if email == "" || password == "" {
		logger.Log.Fatal().Msg("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set")
	}

	logger.Log.Info().Msg("no users found, creating default admin")

	hashedPassword, err := HashPassword(password)
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("failed to hash admin password")
	}

	_, err = queries.CreateUser(ctx, db.CreateUserParams{
		FirstName: "Super",
		LastName:  "Admin",
		Email:     email,
		Password:  hashedPassword,
		Role:      "SUPER_ADMIN",
		Status:    "ACTIVE",
	})
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("failed to seed admin user")
	}

	logger.Log.Info().Str("email", email).Msg("default admin created")
}
