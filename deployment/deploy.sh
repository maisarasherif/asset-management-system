#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Configuration is exported by the adjacent Makefile. Never source production
# secrets into this shell, and never invoke Git/npm/Go with sudo.
: "${DEPLOY_DIR:?Run through the deployment Makefile}"
: "${REPO_DIR:?}" "${BACKEND_DEST:?}" "${FRONTEND_DEST:?}"
: "${MIGRATION_DATABASE_URL:?}" "${DB_USER:?}" "${SERVICE_NAME:?}"
action=${1:-preflight}
migrations="$REPO_DIR/ams-server/db/migrations"
stage=''
backup=''
activation_started=0
success=0

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
migrate_db() {
  sudo -u "$DB_USER" migrate -path "$migrations" -database "$MIGRATION_DATABASE_URL" "$@"
}
read_version() {
  local output
  output=$(migrate_db version 2>&1) || fail "Cannot read database migration version: $output"
  # migrate prints a dirty marker while returning success for `version`.
  [[ "$output" =~ ^[0-9]+$ ]] || fail "Database version is not clean/numeric: $output"
  version=$((10#$output))
  printf 'Database version: %s\n' "$version"
}
require_target() {
  read_version
  [[ "$version" -eq "$TARGET_VERSION" ]] || fail "Database must be at $TARGET_VERSION; use ams deploy for the full upgrade."
}
cleanup() {
  local code=$?
  trap - EXIT
  if (( activation_started && ! success )); then
    sudo systemctl stop "$SERVICE_NAME" || true
    printf 'Deployment failed; backend left stopped. Backups: %s\nSee deployment/README.md recovery instructions.\n' "$backup" >&2
  fi
  if [[ -n "$stage" ]]; then
    case "$stage" in
      "$DEPLOY_DIR"/.build.*) rm -rf -- "$stage" ;;
      *) printf 'Unexpected staging path; preserved: %s\n' "$stage" >&2 ;;
    esac
  fi
  exit "$code"
}
trap cleanup EXIT

check_environment() {
  local port
  sudo -u "$SERVICE_USER" test -r "$SERVICE_ENV" || fail "Service cannot read $SERVICE_ENV"
  # Check names/nonempty values only. Do not print secrets or execute .env.
  port=$(sudo python3 - "$SERVICE_ENV" <<'PY'
import sys
from pathlib import Path
values = {}
for line in Path(sys.argv[1]).read_text().splitlines():
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    values[key.strip()] = value.strip().strip('"\'')
required = ('DATABASE_URL', 'SECRET_KEY', 'R2_S3_ENDPOINT', 'R2_S3_REGION',
            'R2_S3_ACCESS_KEY_ID', 'R2_S3_SECRET_ACCESS_KEY', 'R2_S3_BUCKET')
missing = [key for key in required if not values.get(key)]
if missing:
    sys.exit('Missing production settings: ' + ', '.join(missing))
if values.get('APP_ENV', '').lower() == 'test' or any(values.get(key) for key in
        ('AMS_TEST_STORAGE_PREFIX', 'AMS_TEST_STORAGE_MANIFEST', 'AMS_ISSUANCE_TEST_FAULT_TOKEN')):
    sys.exit('Production environment contains isolated-test configuration')
port = values.get('PORT') or '8080'
if not port.isdigit() or not 1 <= int(port) <= 65535:
    sys.exit('Production PORT must be a valid numeric TCP port')
print(port)
PY
  )
  if [[ -z "$HEALTH_URL" ]]; then HEALTH_URL="http://127.0.0.1:$port/v1/health"; fi
  printf 'Production database, signing secret and R2 settings are present (values not displayed).\n'
}
preflight() {
  [[ $EUID -ne 0 ]] || fail 'Run as pms, without sudo around make/ams.'
  [[ "$BASE_VERSION" =~ ^[0-9]+$ && "$TARGET_VERSION" =~ ^[0-9]+$ ]] || fail 'Migration bounds must be numeric.'
  [[ "$BASE_VERSION" -eq 49 && "$TARGET_VERSION" -eq 54 ]] || fail 'This release is scoped to schema versions 49 through 54.'
  # Publication paths were supplied by the production operator. Refuse broad
  # destinations before rsync --delete or replacement of the service binary.
  [[ "$BACKEND_DEST" == /opt/ams-server/ams-server && "$FRONTEND_DEST" == /var/www/ams ]] || fail 'Review this script before changing production publication paths.'
  for tool in git go npm sudo curl rsync tar flock python3; do
    command -v "$tool" >/dev/null || fail "Missing tool: $tool"
  done
  sudo -v
  sudo -u "$DB_USER" sh -c 'command -v migrate >/dev/null && command -v pg_dump >/dev/null && command -v pg_restore >/dev/null'
  [[ $(sudo systemctl show "$SERVICE_NAME" --value -p User) == "$SERVICE_USER" ]] || fail 'Unexpected systemd service user.'
  [[ $(sudo systemctl show "$SERVICE_NAME" --value -p WorkingDirectory) == "$SERVICE_WORKDIR" ]] || fail 'Unexpected systemd working directory.'
  sudo systemctl show "$SERVICE_NAME" --value -p ExecStart | grep -Fq "path=$BACKEND_DEST ;" || fail 'Unexpected service executable.'
  sudo systemctl show "$SERVICE_NAME" --value -p EnvironmentFiles | grep -Fq "$SERVICE_ENV" || fail 'Unexpected systemd environment file.'
  check_environment
  [[ -d "$REPO_DIR/.git" && -f "$REPO_DIR/ams-server/go.mod" ]] || fail 'Production checkout is missing.'
  sudo test -f "$BACKEND_DEST" || fail 'Existing production binary is missing.'
  sudo test -f "$FRONTEND_DEST/index.html" || fail 'Existing production frontend is missing.'
  read_version
  (( version >= BASE_VERSION && version <= TARGET_VERSION )) || fail "Expected a clean schema between $BASE_VERSION and $TARGET_VERSION."
}
pull() {
  git -C "$REPO_DIR" diff --quiet && git -C "$REPO_DIR" diff --cached --quiet || fail 'Production checkout has tracked local edits; review them first.'
  git check-ref-format "refs/heads/$BRANCH"
  git -C "$REPO_DIR" fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  local commit
  commit=$(git -C "$REPO_DIR" rev-parse "refs/remotes/origin/$BRANCH^{commit}")
  if [[ -n "$EXPECTED_COMMIT" ]]; then
    [[ "$commit" == "$EXPECTED_COMMIT" ]] || fail "Fetched commit $commit differs from reviewed EXPECTED_COMMIT."
  fi
  git -C "$REPO_DIR" checkout --detach "$commit"
  printf 'Selected release: %s (%s)\n' "$BRANCH" "$commit"
}
build() {
  local mode=$1
  stage=$(mktemp -d "$DEPLOY_DIR/.build.XXXXXX")
  if [[ "$mode" != frontend ]]; then
    (cd "$REPO_DIR/ams-server" && go build -mod=readonly -trimpath -o "$stage/ams-server" .)
  fi
  if [[ "$mode" != backend ]]; then
    (cd "$REPO_DIR/ams-frontend-cloudscape" && npm ci && VITE_API_BASE_URL="$VITE_API_URL" npm run build)
    [[ -s "$REPO_DIR/ams-frontend-cloudscape/dist/index.html" ]] || fail 'Frontend build has no index.html.'
    mkdir "$stage/frontend"
    cp -a "$REPO_DIR/ams-frontend-cloudscape/dist/." "$stage/frontend/"
  fi
}
back_up() {
  mkdir -p "$BACKUP_ROOT"
  backup=$(mktemp -d "$BACKUP_ROOT/release-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
  printf 'Backup directory: %s\n' "$backup"
  printf '%s\n' "$previous_commit" > "$backup/checkout-before"
  git -C "$REPO_DIR" rev-parse HEAD > "$backup/new-commit"
  printf '%s\n' "$version" > "$backup/database-version"
  sudo cp -p "$BACKEND_DEST" "$backup/ams-server"
  sudo cp -p "$SERVICE_ENV" "$backup/service.env"
  sudo tar -C "$FRONTEND_DEST" -cpf - . > "$backup/frontend.tar"
  sudo -u "$DB_USER" pg_dump --format=custom --dbname="$MIGRATION_DATABASE_URL" > "$backup/database.dump"
  [[ -s "$backup/database.dump" ]] || fail 'Database backup is empty.'
  sudo -u "$DB_USER" pg_restore --list < "$backup/database.dump" > "$backup/database-contents"
}
verify() {
  require_target
  sudo systemctl is-active --quiet "$SERVICE_NAME"
  local response=''
  for attempt in {1..15}; do
    if response=$(curl --fail --silent --show-error --max-time 5 "$HEALTH_URL") &&
      printf '%s' "$response" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("status") == "ok"'; then
      printf 'Backend health passed: %s\n' "$HEALTH_URL"
      return
    fi
    sleep 2
  done
  fail 'Backend did not become healthy; inspect ams logs.'
}
deploy() {
  local mode=$1
  preflight
  previous_commit=$(git -C "$REPO_DIR" rev-parse HEAD)
  if [[ "$mode" == full ]]; then pull; else require_target; fi
  for number in 50 51 52 53 54; do
    compgen -G "$migrations/$(printf '%06d' "$number")_*.up.sql" >/dev/null || fail "Missing migration $number."
  done
  build "$mode"
  # Validate again after builds; another process must not change the schema
  # between the initial check and the maintenance window.
  read_version
  (( version >= BASE_VERSION && version <= TARGET_VERSION )) || fail 'Schema changed outside this release.'
  [[ "$mode" == full || "$version" -eq "$TARGET_VERSION" ]] || fail 'Partial deploy requires version 54.'
  sudo systemctl stop "$SERVICE_NAME"
  activation_started=1
  back_up
  if [[ "$mode" == full && "$version" -lt "$TARGET_VERSION" ]]; then
    migrate_db goto "$TARGET_VERSION"
  fi
  require_target
  if [[ "$mode" != frontend ]]; then
    sudo install -o root -g root -m 0755 "$stage/ams-server" "$BACKEND_DEST.next"
    sudo mv -f "$BACKEND_DEST.next" "$BACKEND_DEST"
    if command -v restorecon >/dev/null; then sudo restorecon "$BACKEND_DEST"; fi
  fi
  if [[ "$mode" != backend ]]; then
    sudo rsync -a --delete --chown="$NGINX_USER:$NGINX_USER" --chmod=D755,F644 "$stage/frontend/" "$FRONTEND_DEST/"
    if command -v restorecon >/dev/null; then sudo restorecon -R "$FRONTEND_DEST"; fi
  fi
  sudo systemctl start "$SERVICE_NAME"
  verify
  success=1
  printf 'Deployment complete. Release: %s\nBackup/evidence: %s\n' "$(git -C "$REPO_DIR" rev-parse HEAD)" "$backup"
}

case "$action" in
  status) sudo systemctl status "$SERVICE_NAME" --no-pager -l; exit ;;
  logs) sudo journalctl -u "$SERVICE_NAME" -f; exit ;;
  migration-status) migrate_db version; exit ;;
esac
mkdir -p "$DEPLOY_DIR"
exec 9> "$DEPLOY_DIR/deploy.lock"
flock -n 9 || fail 'Another deployment command is running.'
case "$action" in
  preflight) preflight ;;
  pull) preflight; pull ;;
  build) preflight; build full; printf 'Builds passed; production was not changed.\n' ;;
  deploy) deploy full ;;
  deploy-backend) deploy backend ;;
  deploy-frontend) deploy frontend ;;
  verify) preflight; verify ;;
  *) fail "Unknown target: $action" ;;
esac
