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
RUN_GO_REGRESSION="${RUN_GO_REGRESSION:-${RUN_REGRESSION:-0}}"
RUN_NEWMAN="${RUN_NEWMAN:-1}"
NEWMAN_COLLECTIONS="${NEWMAN_COLLECTIONS:-tests/api/postman/system-api-smoke.postman_collection.json tests/api/postman/routine-maintenance.postman_collection.json tests/api/postman/client-asset-certificates.postman_collection.json}"
RUN_PLAYWRIGHT="${RUN_PLAYWRIGHT:-1}"
E2E_SPECS="${E2E_SPECS:-tests/e2e/api-auth-smoke.spec.ts tests/e2e/auth-cookie-session.spec.ts tests/e2e/routine-maintenance.spec.ts tests/e2e/client-asset-certificates.spec.ts}"

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
rebuilt = urlunsplit((parts.scheme, parts.netloc, "/" + name, parts.query, parts.fragment))
if parts.scheme in {"postgres", "postgresql"} and not parts.netloc and rebuilt.startswith(f"{parts.scheme}:/"):
    rebuilt = rebuilt.replace(f"{parts.scheme}:/", f"{parts.scheme}:///", 1)
print(rebuilt)
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

ensure_port_free() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("127.0.0.1", port))
    except OSError:
        raise SystemExit(1)
PY
}

seed_e2e_admin() {
  local helper_path
  local password_hash

  helper_path="$(mktemp "$SERVER_DIR/hash-password-XXXXXX.go")"
  cat >"$helper_path" <<'GO'
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) != 2 {
		panic("password argument is required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(os.Args[1]), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	fmt.Print(string(hash))
}
GO
  password_hash="$(cd "$SERVER_DIR" && go run "$helper_path" "$ADMIN_PASSWORD")"
  rm -f "$helper_path"

  psql "$TEST_DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -v admin_email="$ADMIN_EMAIL" \
    -v password_hash="$password_hash" \
    -q <<'SQL'
INSERT INTO users (display_id, first_name, last_name, email, password, role, status, created_at, updated_at)
VALUES (
  next_display_id('user_display_id_seq'),
  'E2E',
  'Admin',
  :'admin_email',
  :'password_hash',
  'SUPER_ADMIN',
  'ACTIVE',
  NOW(),
  NOW()
)
ON CONFLICT (email)
DO UPDATE SET
  password = EXCLUDED.password,
  role = 'SUPER_ADMIN',
  status = 'ACTIVE',
  updated_at = NOW();
SQL
}

prepare_database() {
  echo "Creating isolated PostgreSQL database: $DATABASE_NAME"
  run_sql "$MAINTENANCE_DATABASE_URL" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DATABASE_NAME';"
  run_sql "$MAINTENANCE_DATABASE_URL" "DROP DATABASE IF EXISTS $QUOTED_DATABASE_NAME;"
  run_sql "$MAINTENANCE_DATABASE_URL" "CREATE DATABASE $QUOTED_DATABASE_NAME;"

  echo "Applying migrations to isolated database"
  (cd "$SERVER_DIR" && migrate -path db/migrations -database "$TEST_DATABASE_URL" up)
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
require_command sed
require_command mktemp
if [[ "$RUN_NEWMAN" == "1" ]]; then
  require_command newman
fi

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

prepare_database

if [[ "$RUN_GO_REGRESSION" == "1" ]]; then
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
  echo "Recreating isolated database for browser E2E"
  prepare_database
fi

echo "Seeding isolated test admin"
seed_e2e_admin

ensure_port_free "$API_PORT" || fail "API port $API_PORT is already in use. Stop the old process or rerun with API_PORT=<free-port>."
ensure_port_free "$FRONTEND_PORT" || fail "Frontend port $FRONTEND_PORT is already in use. Stop the old process or rerun with FRONTEND_PORT=<free-port>."

echo "Starting isolated API on $API_BASE_URL"
(
  cd "$SERVER_DIR"
  APP_ENV=test \
    DATABASE_URL="$TEST_DATABASE_URL" \
    PORT="$API_PORT" \
    ALLOWED_ORIGIN="$FRONTEND_BASE_URL" \
    SEED_ADMIN_EMAIL="$ADMIN_EMAIL" \
    SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    ALERT_RECIPIENT_EMAIL="" \
    CLICKUP_API_TOKEN="" \
    CLICKUP_LIST_ID="" \
    go run . >"$RUN_DIR/api.out.log" 2>"$RUN_DIR/api.err.log"
) &
API_PID="$!"
wait_for_http "$API_BASE_URL/health" "API" "$RUN_DIR/api.err.log"

echo "Verifying isolated admin login"
LOGIN_STATUS="$(
  curl --silent --output "$RUN_DIR/login-check.json" --write-out "%{http_code}" \
    --request POST "$API_BASE_URL/login" \
    --header "Content-Type: application/json" \
    --data "$(python3 - "$ADMIN_EMAIL" "$ADMIN_PASSWORD" <<'PY'
import json
import sys

print(json.dumps({"email": sys.argv[1], "password": sys.argv[2]}))
PY
)"
)"
if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "Login check failed with HTTP $LOGIN_STATUS"
  echo "Response body:"
  cat "$RUN_DIR/login-check.json"
  echo
  echo "Seed admin row in isolated database:"
  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "SELECT email, role, status, length(password) AS password_hash_length FROM users WHERE email = '$ADMIN_EMAIL';" || true
  echo "Recent API stdout:"
  tail -n 50 "$RUN_DIR/api.out.log" | sed -E 's/(password=)[^ ]+/\1[redacted]/g' || true
  echo "Recent API stderr:"
  tail -n 50 "$RUN_DIR/api.err.log" | sed -E 's/(password=)[^ ]+/\1[redacted]/g' || true
  fail "Isolated API did not accept SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD from $SERVER_ENV"
fi

if [[ "$RUN_NEWMAN" == "1" ]]; then
  echo "Running Newman API regression collections"
  for collection in $NEWMAN_COLLECTIONS; do
    echo "Running Newman collection: $collection"
    (
      cd "$REPO_ROOT"
      newman run "$collection" \
        --working-dir "$REPO_ROOT" \
        --env-var "baseUrl=$API_BASE_URL" \
        --env-var "adminEmail=$ADMIN_EMAIL" \
        --env-var "adminPassword=$ADMIN_PASSWORD"
    )
  done
fi

if [[ "$RUN_PLAYWRIGHT" == "1" && -n "$E2E_SPECS" ]]; then
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
else
  echo "Skipping Playwright E2E specs"
fi

echo "All isolated VPS tests passed."
