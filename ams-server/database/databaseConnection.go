package databases

import (
	"context"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/maisarasherif/asset-management-system/ams-server/logger"
)

// OpenPool decodes PostgreSQL instants in UTC regardless of the API host's timezone.
func OpenPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	config.AfterConnect = func(_ context.Context, conn *pgx.Conn) error {
		conn.TypeMap().RegisterType(&pgtype.Type{Name: "timestamptz", OID: pgtype.TimestamptzOID, Codec: &pgtype.TimestamptzCodec{ScanLocation: time.UTC}})
		return nil
	}
	return pgxpool.NewWithConfig(ctx, config)
}

func Connect() *pgxpool.Pool {
	err := godotenv.Load(".env")
	if err != nil {
		logger.Log.Warn().Msg("no .env file found, using environment variables")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		logger.Log.Fatal().Msg("DATABASE_URL is not set")
	}

	pool, err := OpenPool(context.Background(), dsn)
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("failed to connect to PostgreSQL")
	}

	logger.Log.Info().Msg("connected to PostgreSQL")
	return pool
}
