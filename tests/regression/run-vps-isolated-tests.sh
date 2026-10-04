#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/ams-frontend-cloudscape"
SERVER_DIR="$REPO_ROOT/ams-server"
SERVER_ENV="$SERVER_DIR/.env"
RUN_DIR="$REPO_ROOT/.vps-test-run"
API_BINARY="$RUN_DIR/ams-server-e2e"
FRONTEND_DIST_DIR=""
RUN_INITIALIZED=0
STORAGE_CLEANUP_BINARY=""
HASH_HELPER_PATH=""
DATABASE_CREATED=0
GO_STATUS=not-run
NEWMAN_STATUS=not-run
PLAYWRIGHT_STATUS=not-run

DATABASE_NAME="${DATABASE_NAME:-ams_e2e_$(date +%Y%m%d%H%M%S)}"
API_PORT="${API_PORT:-18082}"
FRONTEND_PORT="${FRONTEND_PORT:-14175}"
KEEP_DB="${KEEP_DB:-0}"
RECLAIM_TEST_PORTS="${RECLAIM_TEST_PORTS:-0}"
RUN_GO_REGRESSION="${RUN_GO_REGRESSION:-${RUN_REGRESSION:-0}}"
RUN_NEWMAN="${RUN_NEWMAN:-1}"
NEWMAN_COLLECTIONS="${NEWMAN_COLLECTIONS:-tests/regression/api/system-api-smoke.postman_collection.json tests/regression/api/admin-surface-regression.postman_collection.json tests/regression/api/routine-maintenance.postman_collection.json tests/regression/api/client-asset-certificates.postman_collection.json tests/regression/api/single-asset-equipment.postman_collection.json tests/regression/api/hr-admin-product.postman_collection.json tests/regression/api/generated-renewal-certificates.postman_collection.json}"
RUN_PLAYWRIGHT="${RUN_PLAYWRIGHT:-1}"
E2E_PROFILE="${E2E_PROFILE:-default}"
DEFAULT_E2E_SPECS="../tests/regression/e2e/whole-app-regression.spec.ts ../tests/regression/e2e/hr-admin-product.spec.ts ../tests/regression/e2e/generated-renewal-certificates.spec.ts"
case "$E2E_PROFILE" in
  default) ;;
  certificates-final)
    DEFAULT_E2E_SPECS+=" ../tests/regression/e2e/client-asset-certificates.spec.ts ../tests/regression/e2e/single-asset-equipment.spec.ts ../tests/regression/e2e/routine-maintenance.spec.ts ../tests/regression/e2e/template-catalog.spec.ts ../tests/regression/e2e/user-management-permissions.spec.ts ../tests/regression/e2e/scheduler-management.spec.ts ../tests/regression/e2e/auth-cookie-session.spec.ts ../tests/regression/e2e/api-auth-smoke.spec.ts"
    ;;
  *) echo "ERROR: unknown E2E_PROFILE: $E2E_PROFILE" >&2; exit 2 ;;
esac
E2E_SPECS="${E2E_SPECS:-$DEFAULT_E2E_SPECS}"

API_PID=""
FRONTEND_PID=""
API_STARTED=0
FRONTEND_STARTED=0

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
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

url = sys.argv[1]
name = sys.argv[2]
parts = urlsplit(url)
query = [(key, name if key in {"dbname", "database"} else value) for key, value in parse_qsl(parts.query, keep_blank_values=True)]
rebuilt = urlunsplit((parts.scheme, parts.netloc, "/" + name, urlencode(query), parts.fragment))
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
  HASH_HELPER_PATH="$helper_path"
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
  HASH_HELPER_PATH=""

  psql "$TEST_DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -v admin_email="$ADMIN_EMAIL" \
    -v password_hash="$password_hash" \
    -q <<'SQL'
INSERT INTO users (display_id, first_name, last_name, email, password, role, status, created_at, updated_at)
VALUES (
  allocate_display_id('users.display_id', 'users'::REGCLASS),
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

prepare_newman_fixtures() {
  local oversize_fixture="$REPO_ROOT/tests/regression/fixtures/oversize-certificate.pdf"

  python3 - "$oversize_fixture" <<'PY'
import os
import sys

path = sys.argv[1]
target_size = 11 * 1024 * 1024
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "wb") as handle:
    handle.write(b"%PDF-1.4\n")
    handle.seek(target_size - 1)
    handle.write(b"\n")
PY
}

prepare_database() {
  echo "Creating isolated PostgreSQL database: $DATABASE_NAME"
  run_sql "$MAINTENANCE_DATABASE_URL" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DATABASE_NAME';"
  run_sql "$MAINTENANCE_DATABASE_URL" "DROP DATABASE IF EXISTS $QUOTED_DATABASE_NAME;"
  run_sql "$MAINTENANCE_DATABASE_URL" "CREATE DATABASE $QUOTED_DATABASE_NAME;"
  DATABASE_CREATED=1

  echo "Applying migrations to isolated database"
  (cd "$SERVER_DIR" && migrate -path db/migrations -database "$TEST_DATABASE_URL" up)
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local log_path="$3"
  local last_curl_log="$RUN_DIR/${name,,}-ready.curl.log"

  for _ in $(seq 1 90); do
    if curl --noproxy "*" --fail --silent --show-error --max-time 2 "$url" >/dev/null 2>"$last_curl_log"; then
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

  echo "$name readiness probe failed for $url"
  if [[ -s "$last_curl_log" ]]; then
    echo "Last curl error:"
    cat "$last_curl_log" || true
  fi
  echo "Listeners on configured ports:"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$API_PORT or sport = :$FRONTEND_PORT" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN 2>/dev/null || true
    lsof -nP -iTCP:"$FRONTEND_PORT" -sTCP:LISTEN 2>/dev/null || true
  fi
  if [[ -f "$log_path" ]]; then
    echo "Recent $name stderr log:"
    tail -n 80 "$log_path" || true
  fi
  fail "$name did not become ready at $url. See $log_path"
}

stop_api() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" >/dev/null 2>&1 || true
    API_PID=""
  fi
}

kill_port_listeners() {
  local port="$1"
  local pid_list=""

  if command -v ss >/dev/null 2>&1; then
    pid_list="$(
      ss -ltnp "sport = :$port" 2>/dev/null \
        | sed -nE 's/.*pid=([0-9]+).*/\1/p' \
        | sort -u \
        | tr '\n' ' '
    )"
  elif command -v lsof >/dev/null 2>&1; then
    pid_list="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u | tr '\n' ' ')"
  elif command -v fuser >/dev/null 2>&1; then
    pid_list="$(fuser "$port"/tcp 2>/dev/null | tr '\n' ' ')"
  fi

  if [[ -n "$pid_list" ]]; then
    echo "Releasing listeners on port $port: $pid_list"
    kill $pid_list >/dev/null 2>&1 || true
    sleep 1
    kill -9 $pid_list >/dev/null 2>&1 || true
  fi
}

prepare_test_port() {
  local port="$1"
  local name="$2"

  if ensure_port_free "$port"; then
    return 0
  fi

  if [[ "$RECLAIM_TEST_PORTS" == "1" ]]; then
    echo "$name port $port is already in use; reclaiming configured test port"
    kill_port_listeners "$port"
    if ensure_port_free "$port"; then
      return 0
    fi
  fi

  fail "$name port $port is already in use. Stop the old process or rerun with ${name^^}_PORT=<free-port>."
}

start_api() {
  prepare_test_port "$API_PORT" "API"

  echo "Starting isolated API on $API_BASE_URL"
  (
    cd "$SERVER_DIR"
	    export APP_ENV=test
	    export DATABASE_URL="$TEST_DATABASE_URL"
	    export PORT="$API_PORT"
	    export ALLOWED_ORIGIN="$FRONTEND_BASE_URL"
	    export SEED_ADMIN_EMAIL="$ADMIN_EMAIL"
	    export SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD"
	    export LOGIN_RATE_LIMIT="${LOGIN_RATE_LIMIT:-200}"
	    export ALERT_RECIPIENT_EMAIL=""
    export CLICKUP_API_TOKEN=""
    export CLICKUP_LIST_ID=""
    exec "$API_BINARY" >"$RUN_DIR/api.out.log" 2>"$RUN_DIR/api.err.log"
  ) &
  API_PID="$!"
  API_STARTED=1
  wait_for_http "$API_BASE_URL/health" "API" "$RUN_DIR/api.err.log"
}

verify_admin_login() {
  echo "Verifying isolated admin login"
  LOGIN_STATUS="$(
    curl --noproxy "*" --silent --output "$RUN_DIR/login-check.json" --write-out "%{http_code}" \
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
  rm -f "$RUN_DIR/login-check.json"
}

cleanup() {
  local exit_status=$?
  local storage_status=not-run
  local database_status=not-created
  set +e
  if [[ -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1
    wait "$FRONTEND_PID" >/dev/null 2>&1
    FRONTEND_PID=""
  fi
  stop_api
  if [[ -n "$STORAGE_CLEANUP_BINARY" && -x "$STORAGE_CLEANUP_BINARY" ]]; then
    if (cd "$SERVER_DIR" && "$STORAGE_CLEANUP_BINARY") >"$RUN_DIR/storage-cleanup.log" 2>&1; then
      storage_status=passed
    else
      storage_status=failed
      exit_status=1
    fi
    cat "$RUN_DIR/storage-cleanup.log"
  fi
  if [[ "${KEEP_DB}" != "1" && "$DATABASE_CREATED" == "1" ]]; then
    echo "Dropping isolated database: $DATABASE_NAME"
    if run_sql "$MAINTENANCE_DATABASE_URL" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DATABASE_NAME';" &&
      run_sql "$MAINTENANCE_DATABASE_URL" "DROP DATABASE IF EXISTS $QUOTED_DATABASE_NAME;"; then
      database_status=dropped
    else
      database_status=failed
      exit_status=1
    fi
  elif [[ "${KEEP_DB}" == "1" && "$DATABASE_CREATED" == "1" ]]; then
    echo "Keeping isolated database for inspection: $DATABASE_NAME"
    database_status=kept
  fi
  if [[ -n "$FRONTEND_DIST_DIR" && "$FRONTEND_DIST_DIR" == "$RUN_DIR"/frontend-dist.* ]]; then
    rm -rf "$FRONTEND_DIST_DIR"
  fi
  if [[ -n "$HASH_HELPER_PATH" ]]; then
    rm -f "$HASH_HELPER_PATH"
  fi
  if [[ "$RUN_INITIALIZED" == "1" ]]; then
    rm -f "$RUN_DIR/login-check.json"
    if [[ -f "$RUN_DIR/go-results.jsonl" ]]; then
      python3 "$SCRIPT_DIR/support/summarize-go-results.py" "$RUN_DIR/go-results.jsonl" | tee "$RUN_DIR/go-summary.txt"
    fi
    printf 'Go: %s\nNewman: %s\nPlaywright: %s\nStorage cleanup: %s\nDatabase cleanup: %s\nExit status: %s\n' \
      "$GO_STATUS" "$NEWMAN_STATUS" "$PLAYWRIGHT_STATUS" "$storage_status" "$database_status" "$exit_status" \
      | tee "$RUN_DIR/summary.txt"
    echo "Run evidence: $RUN_DIR"
  fi
  if [[ "$exit_status" == "0" ]]; then
    echo "All selected isolated VPS tests and cleanup passed."
  fi
  trap - EXIT
  exit "$exit_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
for storage_setting in R2_S3_ENDPOINT R2_S3_REGION R2_S3_ACCESS_KEY_ID R2_S3_SECRET_ACCESS_KEY R2_S3_BUCKET; do
  storage_value="${!storage_setting:-}"
  [[ -n "$storage_value" ]] || storage_value="$(dotenv_value "$storage_setting")"
  [[ -n "$storage_value" ]] || fail "$storage_setting is required for the certificate storage baseline"
  export "$storage_setting=$storage_value"
done
unset storage_value

MAINTENANCE_DATABASE_URL="$(database_url_for_name "$SOURCE_DATABASE_URL" postgres)"
TEST_DATABASE_URL="$(database_url_for_name "$SOURCE_DATABASE_URL" "$DATABASE_NAME")"
QUOTED_DATABASE_NAME="$(quote_identifier "$DATABASE_NAME")"
API_ORIGIN="http://127.0.0.1:$API_PORT"
API_BASE_URL="$API_ORIGIN/v1"
FRONTEND_BASE_URL="http://127.0.0.1:$FRONTEND_PORT"
export NO_PROXY="127.0.0.1,localhost,::1${NO_PROXY:+,$NO_PROXY}"
export no_proxy="127.0.0.1,localhost,::1${no_proxy:+,$no_proxy}"

mkdir -p "$RUN_DIR"
RUN_DIR="$(mktemp -d "$RUN_DIR/run.XXXXXX")"
RUN_INITIALIZED=1
API_BINARY="$RUN_DIR/ams-server-e2e"
STORAGE_CLEANUP_BINARY="$RUN_DIR/test-storage-cleanup"
export APP_ENV=test
export DATABASE_URL="$TEST_DATABASE_URL"
export AMS_TEST_STORAGE_PREFIX="ams-e2e/$(python3 -c 'import uuid; print(uuid.uuid4())')/"
export AMS_TEST_STORAGE_MANIFEST="$RUN_DIR/storage-objects.txt"
export AMS_ISSUANCE_TEST_FAULT_TOKEN="$(python3 -c 'import uuid; print(uuid.uuid4())')"
: >"$AMS_TEST_STORAGE_MANIFEST"
printf 'APP_ENV=test\nDATABASE_URL=%q\nAMS_TEST_STORAGE_PREFIX=%q\nAMS_TEST_STORAGE_MANIFEST=%q\n' \
  "$TEST_DATABASE_URL" "$AMS_TEST_STORAGE_PREFIX" "$AMS_TEST_STORAGE_MANIFEST" >"$RUN_DIR/cleanup.env"
# Build before backgrounding so traps own the service process, not a build shell.
(cd "$SERVER_DIR" && go build -buildvcs=false -o "$API_BINARY" .)
(cd "$SERVER_DIR" && go build -buildvcs=false -o "$STORAGE_CLEANUP_BINARY" ./cmd/test-storage-cleanup)
echo "Run evidence: $RUN_DIR"
echo "Test storage prefix: $AMS_TEST_STORAGE_PREFIX"

prepare_database

if [[ "$RUN_GO_REGRESSION" == "1" ]]; then
  echo "Running Go regression tests against isolated database"
  GO_STATUS=failed
  (
    cd "$SERVER_DIR"
    APP_ENV=test \
      DATABASE_URL="$TEST_DATABASE_URL" \
      AMS_RUN_INTEGRATION=1 \
      AMS_CERTIFICATE_PREVIEW_EVIDENCE_DIR="$RUN_DIR/pdf-previews" \
      ALERT_RECIPIENT_EMAIL="" \
      CLICKUP_API_TOKEN="" \
      CLICKUP_LIST_ID="" \
      go test -count=1 -json ./...
  ) | tee "$RUN_DIR/go-results.jsonl"
  GO_STATUS=passed
  echo "Recreating isolated database for browser E2E"
  prepare_database
fi

echo "Seeding isolated test admin"
seed_e2e_admin

prepare_test_port "$FRONTEND_PORT" "Frontend"

start_api
verify_admin_login

if [[ "$RUN_NEWMAN" == "1" ]]; then
  prepare_newman_fixtures
  echo "Running Newman API regression collections"
  NEWMAN_STATUS=failed
  for collection in $NEWMAN_COLLECTIONS; do
    echo "Running Newman collection: $collection"
    (
      cd "$REPO_ROOT"
      newman run "$collection" \
        --bail failure \
        --working-dir "$REPO_ROOT" \
        --env-var "baseUrl=$API_BASE_URL" \
        --env-var "adminEmail=$ADMIN_EMAIL" \
        --env-var "adminPassword=$ADMIN_PASSWORD" \
        --env-var "testStoragePrefix=$AMS_TEST_STORAGE_PREFIX" \
        --env-var "issuanceFaultToken=$AMS_ISSUANCE_TEST_FAULT_TOKEN"
    ) | tee "$RUN_DIR/$(basename "$collection").log"
  done
  NEWMAN_STATUS=passed

  if [[ "$RUN_PLAYWRIGHT" == "1" && -n "$E2E_SPECS" ]]; then
    echo "Recreating isolated database for Playwright E2E"
    stop_api
    prepare_database
    echo "Seeding isolated test admin"
    seed_e2e_admin
    start_api
    verify_admin_login
  fi
fi

if [[ "$RUN_PLAYWRIGHT" == "1" && -n "$E2E_SPECS" ]]; then
  FRONTEND_DIST_DIR="$(mktemp -d "$RUN_DIR/frontend-dist.XXXXXX")"
  echo "Building frontend for isolated API"
  (
    cd "$FRONTEND_DIR"
    npx tsc -p tsconfig.app.json --noEmit --incremental false
    npx tsc vite.config.ts --noEmit --skipLibCheck --module ESNext --moduleResolution Bundler --allowSyntheticDefaultImports --strict --ignoreConfig
    VITE_API_BASE_URL="$API_ORIGIN" npx vite build --outDir "$FRONTEND_DIST_DIR" --emptyOutDir
  )

  echo "Starting isolated frontend on $FRONTEND_BASE_URL"
  (
    cd "$FRONTEND_DIR"
    exec env PORT="$FRONTEND_PORT" STATIC_ROOT="$FRONTEND_DIST_DIR" node ../tests/regression/support/static-server.cjs >"$RUN_DIR/frontend.out.log" 2>"$RUN_DIR/frontend.err.log"
  ) &
  FRONTEND_PID="$!"
  FRONTEND_STARTED=1
  wait_for_http "$FRONTEND_BASE_URL" "frontend" "$RUN_DIR/frontend.err.log"

  echo "Running Playwright E2E specs against isolated stack"
  PLAYWRIGHT_STATUS=failed
  (
    cd "$FRONTEND_DIR"
    PLAYWRIGHT_BASE_URL="$FRONTEND_BASE_URL" \
      PLAYWRIGHT_API_BASE_URL="$API_BASE_URL" \
      PLAYWRIGHT_ISSUANCE_FAULT_TOKEN="$AMS_ISSUANCE_TEST_FAULT_TOKEN" \
      PLAYWRIGHT_CERTIFICATE_TIMING_DIR="$RUN_DIR/certificate-timings" \
      PLAYWRIGHT_ADMIN_EMAIL="$ADMIN_EMAIL" \
      PLAYWRIGHT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      PLAYWRIGHT_RUN_ROUTINE_MAINTENANCE_TRIGGER=1 \
      PLAYWRIGHT_RUN_CLIENT_PORTAL_TRIGGER=1 \
      PLAYWRIGHT_HTML_OPEN=on-failure \
      PLAYWRIGHT_HTML_OUTPUT_DIR="$RUN_DIR/playwright-report" \
      PLAYWRIGHT_JSON_OUTPUT_NAME="$RUN_DIR/playwright-results.json" \
      npx playwright test $E2E_SPECS --reporter=list,html,json
  ) | tee "$RUN_DIR/playwright.log"
  PLAYWRIGHT_STATUS=passed
else
  echo "Skipping Playwright E2E specs"
fi

if [[ -f "$RUN_DIR/generated-renewal-certificates.postman_collection.json.log" || -d "$RUN_DIR/certificate-timings" ]]; then
  python3 "$REPO_ROOT/tests/regression/support/certificate-latency-summary.py" \
    --newman-log "$RUN_DIR/generated-renewal-certificates.postman_collection.json.log" \
    --playwright-dir "$RUN_DIR/certificate-timings" \
    --output "$RUN_DIR/certificate-latency-summary.json"
fi

# The EXIT trap reports success only after object/database cleanup succeeds.
