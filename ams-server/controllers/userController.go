package controllers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	database "github.com/maisarasherif/asset-management-system/ams-server/database"
	"github.com/maisarasherif/asset-management-system/ams-server/models"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/crypto/bcrypt"
)

func HashPassword(password string) (string, error) {
	hashPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	return string(hashPassword), nil
}

func RegisterUser(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var user models.User

		if err := c.ShouldBindJSON(&user); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input data"})
			return
		}

		validate := validator.New()
		if err := validate.Struct(user); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "validation failed", "details": err.Error()})
			return
		}

		hashedPassword, err := HashPassword(user.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "hashing password failed"})
			return
		}

		var ctx, cancel = context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var userCollection *mongo.Collection = database.OpenCollection("Users", client)

		count, err := userCollection.CountDocuments(ctx, bson.M{"email": user.Email})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check existing users"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "email address already exists"})
			return
		}
		user.UserID = bson.NewObjectID().Hex()
		user.Password = hashedPassword
		user.CreatedAt = time.Now()
		user.UpdatedAt = time.Now()

		result, err := userCollection.InsertOne(ctx, user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}

		c.JSON(http.StatusCreated, result)

	}
}

func LoginUser(client *mongo.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var userLogin models.UserLogin

		if err := c.ShouldBindJSON(&userLogin); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input data"})
			return
		}

		var ctx, cancel = context.WithTimeout(c.Request.Context(), 100*time.Second)
		defer cancel()

		var foundUser models.User

		var userCollection *mongo.Collection = database.OpenCollection("Users", client)

		err := userCollection.FindOne(ctx, bson.M{"email": userLogin.Email}).Decode(&foundUser)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
			return
		}
		err = bcrypt.CompareHashAndPassword([]byte(foundUser.Password), []byte(userLogin.Password))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
			return
		}

		token, refreshToken, err := utils.GenerateAllTokens(foundUser.Email, foundUser.FirstName, foundUser.LastName, foundUser.Role, foundUser.UserID)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate tokens"})
			return
		}

		err = utils.UpdateAllTokens(client, foundUser.UserID, token, refreshToken)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tokens"})
			return
		}

		c.JSON(http.StatusOK, models.UserResponse{
			UserId:       foundUser.UserID,
			FirstName:    foundUser.FirstName,
			LastName:     foundUser.LastName,
			Email:        foundUser.Email,
			Role:         foundUser.Role,
			Token:        token,
			RefreshToken: refreshToken,
		})
	}
}

func SeedAdminUser(client *mongo.Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	collection := database.OpenCollection("Users", client) // Use your DB helper

	// 1. Check if ANY user exists (or specifically an admin email)
	count, err := collection.CountDocuments(ctx, bson.M{})
	if err != nil {
		log.Fatal("Could not check for existing users:", err)
	}

	// 2. If database is not empty, do nothing
	if count > 0 {
		return
	}

	fmt.Println("No users found. Creating default admin...")

	// 3. Create the Admin User object
	// Note: Use your exact hash function from your helpers
	hashedPassword, _ := HashPassword("Admin@123")

	adminUser := models.User{
		UserID:    bson.NewObjectID().Hex(),
		FirstName: "Super",
		LastName:  "Admin",
		Email:     "maisara.sherif.ms@gmail.com",
		Password:  hashedPassword, // Crucial: Store the hashed version!
		Role:      "ADMIN",        // Assuming you have a role field
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// 4. Insert
	_, err = collection.InsertOne(ctx, adminUser)
	if err != nil {
		log.Fatal("Failed to seed admin user:", err)
	}

	fmt.Println("Default Admin Created")
}
