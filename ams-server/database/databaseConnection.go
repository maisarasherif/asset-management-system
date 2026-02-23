package databases

import (
	"context"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
)

func Connect() *pgxpool.Pool {
	err := godotenv.Load(".env")
	if err != nil {
		logger.Log.Warn().Msg("no .env file found, using environment variables")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		logger.Log.Fatal().Msg("DATABASE_URL is not set")
	}

	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("failed to connect to PostgreSQL")
	}

	logger.Log.Info().Msg("connected to PostgreSQL")
	return pool
}
