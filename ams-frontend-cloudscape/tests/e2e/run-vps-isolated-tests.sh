#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/ams-server"
SERVER_ENV="$SERVER_DIR/.env"
RUN_DIR="$REPO_ROOT/.vps-test-run"

DATABASE_NAME="${DATABASE_NAME:-ams_e2e_$(date +%Y%m%d%H%M%S)}"
API_PORT="${API_PORT:-18082}"
FRONTEND_PORT="${FRONTEND_PORT:-14175}"
KEEP_DB="${KEEP_DB:-0}"
RUN_REGRESSION="${RUN_REGRESSION:-1}"
E2E_SPECS="${E2E_SPECS:-tests/e2e/auth-cookie-session.spec.ts tests/e2e/routine-maintenance.spec.ts tests/e2e/client-asset-certificates.spec.ts}"

API_PID=""
FRONTEND_PID=""

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

dotenv_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$SERVER_ENV" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

database_url_for_name() {
  local database_url="$1"
  local database_name="$2"
  python3 - "$database_url" "$database_name" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

url = sys.argv[1]
name = sys.argv[2]
parts = urlsplit(url)
print(urlunsplit((parts.scheme, parts.netloc, "/" + name, parts.query, parts.fragment)))
PY
}

quote_identifier() {
  local identifier="$1"
  printf '"%s"' "${identifier//\"/\"\"}"
}

run_sql() {
  local database_url="$1"
  local sql="$2"
  PGOPTIONS="-c client_min_messages=warning" psql "$database_url" -v ON_ERROR_STOP=1 -q -c "$sql" >/dev/null
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local log_path="$3"

  for _ in $(seq 1 90); do
    if curl --fail --silent --show-error --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi

    if [[ -n "$API_PID" ]] && ! kill -0 "$API_PID" >/dev/null 2>&1 && [[ "$name" == "API" ]]; then
      fail "$name exited early. See $log_path"
    fi
    if [[ -n "$FRONTEND_PID" ]] && ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1 && [[ "$name" == "frontend" ]]; then
      fail "$name exited early. See $log_path"
    fi

    sleep 1
  done

  fail "$name did not become ready at $url. See $log_path"
}

cleanup() {
  set +e
  if [[ -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1
    wait "$FRONTEND_PID" >/dev/null 2>&1
  fi
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" >/dev/null 2>&1
    wait "$API_PID" >/dev/null 2>&1
  fi
  if [[ "${KEEP_DB}" != "1" && -n "${MAINTENANCE_DATABASE_URL:-}" && -n "${QUOTED_DATABASE_NAME:-}" ]]; then
    echo "Dropping isolated database: $DATABASE_NAME"
    run_sql "$MAINTENANCE_DATABASE_URL" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DATABASE_NAME';" || true
    run_sql "$MAINTENANCE_DATABASE_URL" "DROP DATABASE IF EXISTS $QUOTED_DATABASE_NAME;" || true
  elif [[ "${KEEP_DB}" == "1" ]]; then
    echo "Keeping isolated database for inspection: $DATABASE_NAME"
  fi
}
trap cleanup EXIT

[[ -f "$SERVER_ENV" ]] || fail "Expected server env file at $SERVER_ENV"
[[ "$DATABASE_NAME" =~ ^ams_e2e_[A-Za-z0-9_]+$ ]] || fail "Refusing database name '$DATABASE_NAME'. It must start with ams_e2e_"

require_command psql
require_command migrate
require_command go
require_command npm
require_command npx
require_command curl
require_command python3

SOURCE_DATABASE_URL="$(dotenv_value DATABASE_URL)"
ADMIN_EMAIL="$(dotenv_value SEED_ADMIN_EMAIL)"
ADMIN_PASSWORD="$(dotenv_value SEED_ADMIN_PASSWORD)"

[[ -n "$SOURCE_DATABASE_URL" ]] || fail "DATABASE_URL is missing from $SERVER_ENV"
[[ -n "$ADMIN_EMAIL" && -n "$ADMIN_PASSWORD" ]] || fail "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required in $SERVER_ENV"

MAINTENANCE_DATABASE_URL="$(database_url_for_name "$SOURCE_DATABASE_URL" postgres)"
TEST_DATABASE_URL="$(database_url_for_name "$SOURCE_DATABASE_URL" "$DATABASE_NAME")"
QUOTED_DATABASE_NAME="$(quote_identifier "$DATABASE_NAME")"
API_ORIGIN="http://127.0.0.1:$API_PORT"
API_BASE_URL="$API_ORIGIN/v1"
FRONTEND_BASE_URL="http://127.0.0.1:$FRONTEND_PORT"

mkdir -p "$RUN_DIR"

echo "Creating isolated PostgreSQL database: $DATABASE_NAME"
run_sql "$MAINTENANCE_DATABASE_URL" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DATABASE_NAME';"
run_sql "$MAINTENANCE_DATABASE_URL" "DROP DATABASE IF EXISTS $QUOTED_DATABASE_NAME;"
run_sql "$MAINTENANCE_DATABASE_URL" "CREATE DATABASE $QUOTED_DATABASE_NAME;"

echo "Applying migrations to isolated database"
(cd "$SERVER_DIR" && migrate -path db/migrations -database "$TEST_DATABASE_URL" up)

if [[ "$RUN_REGRESSION" == "1" ]]; then
  echo "Running Go regression tests against isolated database"
  (
    cd "$SERVER_DIR"
    APP_ENV=test \
      DATABASE_URL="$TEST_DATABASE_URL" \
      AMS_RUN_INTEGRATION=1 \
      ALERT_RECIPIENT_EMAIL="" \
      CLICKUP_API_TOKEN="" \
      CLICKUP_LIST_ID="" \
      go test ./...
  )
fi

echo "Starting isolated API on $API_BASE_URL"
(
  cd "$SERVER_DIR"
  APP_ENV=test \
    DATABASE_URL="$TEST_DATABASE_URL" \
    PORT="$API_PORT" \
    ALLOWED_ORIGIN="$FRONTEND_BASE_URL" \
    ALERT_RECIPIENT_EMAIL="" \
    CLICKUP_API_TOKEN="" \
    CLICKUP_LIST_ID="" \
    go run . >"$RUN_DIR/api.out.log" 2>"$RUN_DIR/api.err.log"
) &
API_PID="$!"
wait_for_http "$API_BASE_URL/health" "API" "$RUN_DIR/api.err.log"

echo "Building frontend for isolated API"
(cd "$FRONTEND_DIR" && VITE_API_BASE_URL="$API_ORIGIN" npm run build)

echo "Starting isolated frontend on $FRONTEND_BASE_URL"
(
  cd "$FRONTEND_DIR"
  PORT="$FRONTEND_PORT" node tests/e2e/static-server.cjs >"$RUN_DIR/frontend.out.log" 2>"$RUN_DIR/frontend.err.log"
) &
FRONTEND_PID="$!"
wait_for_http "$FRONTEND_BASE_URL" "frontend" "$RUN_DIR/frontend.err.log"

echo "Running Playwright E2E specs against isolated stack"
(
  cd "$FRONTEND_DIR"
  PLAYWRIGHT_BASE_URL="$FRONTEND_BASE_URL" \
    PLAYWRIGHT_API_BASE_URL="$API_BASE_URL" \
    PLAYWRIGHT_ADMIN_EMAIL="$ADMIN_EMAIL" \
    PLAYWRIGHT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    PLAYWRIGHT_RUN_ROUTINE_MAINTENANCE_TRIGGER=1 \
    PLAYWRIGHT_RUN_CLIENT_PORTAL_TRIGGER=1 \
    npx playwright test $E2E_SPECS
)

echo "All isolated VPS tests passed."
