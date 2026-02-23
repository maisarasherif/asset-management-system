package logger

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

var Log zerolog.Logger

func Init() {
	zerolog.TimeFieldFormat = time.RFC3339

	env := os.Getenv("APP_ENV")

	if env == "production" {
		// JSON output for production — easy to ingest into log aggregators
		Log = zerolog.New(os.Stdout).
			With().
			Timestamp().
			Str("service", "ams-server").
			Logger()
	} else {
		// Human-readable console output for development
		Log = zerolog.New(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: "15:04:05",
		}).
			With().
			Timestamp().
			Str("service", "ams-server").
			Logger()
	}
}
