package utils

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	jwt "github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/maisarasherif/asset-management-system/ams-server/db/generated"
)

const AccessTokenCookieName = "ams_access_token"
const accessTokenTTL = 6 * time.Hour

type SignedDetails struct {
	Email     string
	FirstName string
	LastName  string
	Role      string
	UserId    string
	jwt.RegisteredClaims
}

func getSecretKey() []byte {
	return []byte(os.Getenv("SECRET_KEY"))
}

func AccessTokenTTL() time.Duration {
	return accessTokenTTL
}

func isSecureCookie() bool {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	return appEnv != "dev" && appEnv != "development" && appEnv != "local" && appEnv != "test"
}

func SetAccessTokenCookie(c *gin.Context, token string, expiresAt time.Time) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     AccessTokenCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearAccessTokenCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     AccessTokenCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})
}

func GenerateAccessToken(email, firstName, lastName, role, userId string) (string, time.Time, error) {
	now := time.Now()
	expiresAt := now.Add(AccessTokenTTL())
	claims := &SignedDetails{
		Email:     email,
		FirstName: firstName,
		LastName:  lastName,
		Role:      role,
		UserId:    userId,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "AMS",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString(getSecretKey())
	if err != nil {
		return "", time.Time{}, err
	}

	return signedToken, expiresAt, nil
}

func UpdateAccessToken(pool *pgxpool.Pool, userId, token string) error {
	queries := db.New(pool)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	parsedUserID, err := ParseUUID(userId, "user_id")
	if err != nil {
		return err
	}

	err = queries.UpdateUserToken(ctx, db.UpdateUserTokenParams{
		Token:  token,
		UserID: parsedUserID,
	})
	if err != nil {
		return err
	}

	return nil
}

func ValidateToken(tokenString string) (*SignedDetails, error) {
	claims := &SignedDetails{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return getSecretKey(), nil
	})
	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	if claims.ExpiresAt == nil {
		return nil, errors.New("token expiry is required")
	}

	if claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, errors.New("token has expired")
	}

	return claims, nil
}

func GetAccessToken(c *gin.Context) (string, error) {
	authHeader := c.Request.Header.Get("Authorization")
	if strings.TrimSpace(authHeader) != "" {
		if len(authHeader) < 8 || authHeader[:7] != "Bearer " {
			return "", errors.New("invalid authorization header format")
		}

		token := authHeader[7:]
		if token == "" {
			return "", errors.New("bearer token is required")
		}

		return token, nil
	}

	if token, err := c.Cookie(AccessTokenCookieName); err == nil && strings.TrimSpace(token) != "" {
		return token, nil
	}

	return "", errors.New("authorization header or access token cookie is required")
}

func GetUserIdFromContext(c *gin.Context) (string, error) {
	userId, exists := c.Get("userId")
	if !exists {
		return "", errors.New("userId does not exist in this context")
	}

	id, ok := userId.(string)
	if !ok {
		return "", errors.New("unable to retrieve userId")
	}

	return id, nil
}

func GetRoleFromContext(c *gin.Context) (string, error) {
	role, exists := c.Get("role")
	if !exists {
		return "", errors.New("role does not exist in this context")
	}

	memberRole, ok := role.(string)
	if !ok {
		return "", errors.New("unable to retrieve role")
	}

	return memberRole, nil
}
