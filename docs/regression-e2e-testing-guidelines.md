# Regression And E2E Testing Guidelines

This guide captures the VPS-safe regression and E2E testing workflow for the AMS app.

The goal is to verify backend regressions and browser flows without touching the production database.

## Golden Rule

Never run destructive integration/regression tests directly against the production database.

Do not run this against production:

```bash
AMS_RUN_INTEGRATION=1 go test ./...
```

Use the isolated test runner instead:

```bash
bash tests/regression/run-vps-isolated-tests.sh
```

The runner creates a temporary database named `ams_e2e_*`, runs migrations, runs Newman API regression, recreates a fresh isolated database for browser E2E, and drops it at the end.

## What The Isolated Runner Verifies

The runner performs this sequence:

1. Creates an isolated PostgreSQL database named `ams_e2e_YYYYMMDDHHMMSS`.
2. Applies all migrations.
3. Optionally runs Go integration/regression tests if `RUN_GO_REGRESSION=1`.
4. Recreates the isolated DB after Go tests, if they ran.
5. Seeds a test-only super-admin user in the isolated DB.
6. Starts an isolated API on `127.0.0.1`.
7. Verifies admin login with `curl`.
8. Runs Newman API regression collections.
9. Recreates the isolated DB after Newman when Playwright is enabled.
10. Seeds a fresh test-only super-admin for Playwright.
11. Builds and starts a fresh isolated API binary with `go build -buildvcs=false`.
12. Builds the Cloudscape frontend against the isolated API.
13. Starts an isolated static frontend server on `127.0.0.1`.
14. Runs live API smoke and Playwright browser E2E specs.
15. Stops isolated processes and drops the isolated DB.

Successful final output should include passing Newman collections, passing Playwright specs, and:

```text
All isolated VPS tests passed.
Dropping isolated database: ams_e2e_...
```

## API Testing Layers

AMS uses these complementary test layers:

1. Newman/Postman API regression tests call the isolated running API over HTTP and exercise broad API workflows.
2. Playwright live API smoke tests call the isolated running API over HTTP and verify auth/cookie behavior.
3. Browser E2E tests run real user workflows in Playwright.
4. Optional Go integration tests call Gin routes in-process only if `RUN_GO_REGRESSION=1`; this lane includes scheduler notification idempotency, audit, and force re-notify reset coverage.

Newman/Postman is the normal API regression lane for this project. Go integration tests are not required for the VPS workflow unless they are intentionally configured and enabled later.

The primary API regression collections are in:

```text
tests/regression/api/
```

The isolated runner defaults to:

```text
tests/regression/api/system-api-smoke.postman_collection.json
tests/regression/api/admin-surface-regression.postman_collection.json
tests/regression/api/routine-maintenance.postman_collection.json
tests/regression/api/client-asset-certificates.postman_collection.json
tests/regression/api/single-asset-equipment.postman_collection.json
```

Only collections under `tests/regression/api/` are part of the automated VPS suite. Do not add legacy/manual collections until they have been checked against the current API contract and current required fields such as `sort_order`.

The default browser E2E suite covers auth, whole-app route health by role, routine maintenance, client certificate visibility, user permissions, single-asset equipment certificate slots, and scheduler management. The whole-app spec seeds current app data and opens every major Cloudscape route. The scheduler spec verifies that an admin/super admin can open `/scheduler`, see the Force re-notify controls plus notification/failure audit tables, select a certificate, and clear notification history through the real UI.

To run a specific Newman set:

```bash
NEWMAN_COLLECTIONS="tests/regression/api/system-api-smoke.postman_collection.json" \
bash tests/regression/run-vps-isolated-tests.sh
```

The live API smoke spec is:

```text
tests/regression/e2e/api-auth-smoke.spec.ts
```

It verifies:

- `GET /v1/health` returns `200`.
- `POST /v1/login` returns `200`.
- Login sets the HTTP-only `ams_access_token` cookie.
- `GET /v1/session` works with the cookie.
- `GET /v1/assets` works with the cookie.
- Temporary Bearer fallback still works.
- `POST /v1/logout` succeeds.
- `GET /v1/session` fails after logout.

## Fedora 44 Setup

The VPS is Fedora 44, so install dependencies with `dnf`, not `apt`.

```bash
sudo dnf install -y git nodejs npm golang postgresql curl python3 chromium \
  alsa-lib atk at-spi2-atk at-spi2-core cairo cups-libs dbus-libs expat \
  fontconfig freetype gdk-pixbuf2 glib2 gtk3 libX11 libXcomposite libXdamage \
  libXext libXfixes libXrandr libxcb libxkbcommon mesa-libgbm nspr nss pango \
  xorg-x11-server-Xvfb
```

Install `golang-migrate` if needed:

```bash
go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
export PATH="$PATH:$HOME/go/bin"
migrate -version
```

Install frontend and Playwright dependencies:

```bash
cd ams-frontend-cloudscape
npm ci
npx playwright install chromium
```

Install Newman if it is not already available:

```bash
sudo npm install -g newman
newman --version
```

Do not use this on Fedora:

```bash
npx playwright install --with-deps chromium
```

Playwright tries Ubuntu `apt-get` for unsupported distros, which fails on Fedora.

## User And Browser Cache

Install Playwright browsers as the same Linux user that runs the test script.

If tests run as `ams_test_runner`, then run:

```bash
cd /home/pms/ams-testing/asset-management-system/ams-frontend-cloudscape
npx playwright install chromium
```

as `ams_test_runner`.

If Playwright says the executable is missing under:

```text
/home/ams_test_runner/.cache/ms-playwright
```

then Chromium was installed for the wrong Linux user.

## PostgreSQL Socket And Peer Auth

The VPS uses Unix-socket PostgreSQL, not TCP.

Use a libpq socket URL in the testing `.env`:

```env
DATABASE_URL=postgresql:///postgres?host=/var/run/postgresql&user=ams_test_runner
```

Run the script as the matching Linux user for peer auth:

```bash
cd /home/pms/ams-testing/asset-management-system
bash tests/regression/run-vps-isolated-tests.sh
```

The Postgres role needs `CREATEDB` so the runner can create/drop `ams_e2e_*` databases:

```bash
sudo -iu postgres psql
```

```sql
CREATE ROLE ams_test_runner LOGIN CREATEDB;
```

If the role already exists:

```sql
ALTER ROLE ams_test_runner CREATEDB;
```

## Required Env File

The runner expects:

```text
ams-server/.env
```

Required keys:

```env
DATABASE_URL=postgresql:///postgres?host=/var/run/postgresql&user=ams_test_runner
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
SECRET_KEY=...
SECRET_REFRESH_KEY=...
```

The runner reads `DATABASE_URL` only as a template and replaces the DB name with the temporary `ams_e2e_*` name.

## Running The Full Suite

From repo root:

```bash
bash tests/regression/run-vps-isolated-tests.sh
```

If default ports are busy, choose fresh ports:

```bash
API_PORT=18085 FRONTEND_PORT=14178 \
bash tests/regression/run-vps-isolated-tests.sh
```

The runner checks port availability before starting isolated servers.

The runner builds the API into `.vps-test-run/ams-server-e2e` and runs that binary directly. This avoids `go run` leaving a compiled child process in `.cache/go-build` that can keep the API port busy after the parent process exits. It uses `-buildvcs=false` because VCS stamping is not needed for the temporary E2E binary and can fail when the test user has limited Git metadata access.

The Linux user running the script must be able to write:

```text
.vps-test-run/
ams-frontend-cloudscape/dist/
ams-frontend-cloudscape/test-results/
ams-frontend-cloudscape/playwright-report/
ams-frontend-cloudscape/tsconfig.app.tsbuildinfo
```

For the VPS test checkout, the simplest fix is usually:

```bash
sudo chown -R ams_test_runner:ams_test_runner \
  /home/pms/ams-testing/asset-management-system/ams-frontend-cloudscape \
  /home/pms/ams-testing/asset-management-system/.vps-test-run
```

## Running Only Newman API Regression

Useful when you only want API regression without browser E2E:

```bash
RUN_PLAYWRIGHT=0 \
RUN_NEWMAN=1 \
bash tests/regression/run-vps-isolated-tests.sh
```

Run one Postman collection:

```bash
NEWMAN_COLLECTIONS="tests/regression/api/system-api-smoke.postman_collection.json" \
RUN_PLAYWRIGHT=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

Skip Newman and run only browser/API Playwright specs:

```bash
RUN_NEWMAN=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

Run optional Go integration tests before Newman only if they are configured and you intentionally want that extra lane:

```bash
RUN_GO_REGRESSION=1 \
bash tests/regression/run-vps-isolated-tests.sh
```

## Running Only Auth Cookie E2E

Useful after auth/session changes:

```bash
API_PORT=18085 FRONTEND_PORT=14178 \
E2E_SPECS="../tests/regression/e2e/api-auth-smoke.spec.ts ../tests/regression/e2e/auth-cookie-session.spec.ts" \
RUN_GO_REGRESSION=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

This verifies:

- Live API auth, cookie, session, logout, and Bearer fallback behavior.
- Login works.
- HTTP-only cookie is set.
- A fresh tab can open `/assets`.
- The fresh tab does not redirect to `/login`.
- Logout redirects the other tab to `/login`.

## Keeping The Test DB Temporarily

For debugging:

```bash
KEEP_DB=1 bash tests/regression/run-vps-isolated-tests.sh
```

Drop it manually after inspection:

```bash
psql "postgresql:///postgres?host=/var/run/postgresql&user=ams_test_runner" \
  -c 'DROP DATABASE "ams_e2e_YYYYMMDDHHMMSS";'
```

## Common Failures

### Peer Authentication Failed

Example:

```text
FATAL: Peer authentication failed for user "ams"
```

Cause: Unix-socket peer auth expects the Linux user to match the Postgres role.

Fix: run as the matching Linux user, or create a matching `ams_test_runner` Linux/Postgres role pair.

### Invalid Connection Option `postgresql:/postgres?host`

Cause: socket URI lost its triple slash.

Correct format:

```env
DATABASE_URL=postgresql:///postgres?host=/var/run/postgresql&user=ams_test_runner
```

### Playwright Uses `apt-get` On Fedora

Do not run:

```bash
npx playwright install --with-deps chromium
```

Install OS packages with `dnf`, then run:

```bash
npx playwright install chromium
```

### Playwright Browser Executable Missing

Cause: browser installed under a different Linux user.

Fix: run `npx playwright install chromium` as the same user that runs tests.

### Login Check Fails With 401

The runner now seeds the E2E admin directly into the isolated DB before browser tests.

If login still fails, check the diagnostic output:

```text
Seed admin row in isolated database:
Recent API stdout:
Recent API stderr:
```

If the row exists but API says email not found, an old API process is probably still bound to the port.

Check:

```bash
ss -ltnp | grep ':18085'
```

Then stop it or rerun with a fresh `API_PORT`.

### Every API Port Looks Busy

Check the port:

```bash
ss -ltnp | grep ':18086'
```

Older versions of the runner used `go run .`, which can leave a compiled child process running under `.cache/go-build`. If you see one, inspect and kill only stale isolated test API processes:

```bash
ps -u ams_test_runner -f | grep '.cache/go-build' | grep -v grep
kill <PID>
```

The current runner builds and executes `.vps-test-run/ams-server-e2e` directly, so this should not recur after stale old processes are cleaned once.

### TypeScript Build Info Permission Denied

Example:

```text
Could not write file '.../ams-frontend-cloudscape/tsconfig.app.tsbuildinfo': EACCES
```

Cause: the frontend folder or build artifacts are owned by a different Linux user.

Fix:

```bash
sudo chown -R ams_test_runner:ams_test_runner \
  /home/pms/ams-testing/asset-management-system/ams-frontend-cloudscape
```

Then rerun the isolated test script as `ams_test_runner`.

## Production Deployment Checks

Production backend env should not use:

```env
APP_ENV=test
APP_ENV=dev
APP_ENV=development
APP_ENV=local
```

Use:

```env
APP_ENV=production
ALLOWED_ORIGIN=https://maysara.work
```

Build frontend for production with either:

```bash
VITE_API_BASE_URL=/api npm run build
```

or:

```bash
VITE_API_BASE_URL=https://maysara.work/api npm run build
```

The relative `/api` form is preferred because it avoids hardcoding the domain in the JS bundle.

## Nginx SPA And 403 Notes

For React SPA routing, Nginx needs to serve `index.html` for browser routes:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

If opening a route in a new tab causes Nginx `403 Forbidden`, this can be a permissions issue:

1. Nginx cannot read the deployed frontend files.
2. Nginx cannot traverse one of the parent directories.

Fix deployed frontend ownership/permissions:

```bash
sudo chown -R nginx:nginx /var/www/ams
sudo chmod -R 755 /var/www/ams
sudo chmod o+x /var/www
```

Then validate and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Manual Production Smoke Test

After deploying:

1. Visit `https://maysara.work/login`.
2. Login.
3. Right-click `Assets directory` in the left navigation.
4. Open it in a new tab.
5. Confirm the new tab opens `/assets` and does not redirect to `/login`.
6. Logout in one tab.
7. Confirm the other tab redirects to `/login`.

This smoke test verifies the HTTP-only cookie session and the original new-tab bug.
