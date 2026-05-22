# VPS Isolated Regression And E2E Testing

Use this workflow on the VPS to verify auth/session changes without touching the production database.

The runner creates a temporary PostgreSQL database whose name must start with `ams_e2e_`, applies migrations, runs Newman/Postman API regression, recreates a fresh isolated database for Playwright API/browser checks, and then drops the database.

## One-Time VPS Setup

From the repo root on the VPS:

```bash
cd /path/to/asset-management-system
cd ams-frontend-cloudscape
npm ci
npx playwright install chromium
cd ../ams-server
go mod download
```

Make sure these commands exist on the VPS:

```bash
psql --version
migrate -version
go version
npm --version
newman --version
```

If `migrate` is missing, install `golang-migrate` for your VPS OS before running the tests.

Fedora note: do not use `npx playwright install --with-deps chromium`. On Fedora, Playwright falls back to Ubuntu dependency installation and tries `apt-get`. Install OS packages with `dnf`, then run `npx playwright install chromium` as the same Linux user that will run the test script.

If Newman is missing:

```bash
sudo npm install -g newman
```

The test user must own the frontend build workspace and `.vps-test-run`:

```bash
sudo chown -R ams_test_runner:ams_test_runner \
  /home/pms/ams-testing/asset-management-system/ams-frontend-cloudscape \
  /home/pms/ams-testing/asset-management-system/.vps-test-run
```

## Required Env

The runner reads these values from:

```text
ams-server/.env
```

Required:

```text
DATABASE_URL=postgres://...
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
SECRET_KEY=...
SECRET_REFRESH_KEY=...
```

It uses `DATABASE_URL` only as a connection template. It replaces the database name with a temporary `ams_e2e_*` database before running anything destructive.

For Unix-socket PostgreSQL with peer auth, use a libpq URI like:

```text
DATABASE_URL=postgresql:///postgres?host=/var/run/postgresql&user=ams_test_runner
```

Run the test script as the matching Linux user for peer auth, for example:

```bash
sudo -iu ams_test_runner
cd /home/pms/ams-testing/asset-management-system
bash tests/regression/run-vps-isolated-tests.sh
```

## Run Everything

From the repo root:

```bash
bash tests/regression/run-vps-isolated-tests.sh
```

This runs the current Newman API regression collections, then recreates the isolated DB and runs Playwright browser/API smoke tests on a fresh isolated state:

```bash
newman run tests/regression/api/system-api-smoke.postman_collection.json
newman run tests/regression/api/admin-surface-regression.postman_collection.json
newman run tests/regression/api/routine-maintenance.postman_collection.json
newman run tests/regression/api/client-asset-certificates.postman_collection.json
newman run tests/regression/api/single-asset-equipment.postman_collection.json
npx playwright test ../tests/regression/e2e/api-auth-smoke.spec.ts ../tests/regression/e2e/auth-cookie-session.spec.ts ../tests/regression/e2e/whole-app-regression.spec.ts ../tests/regression/e2e/routine-maintenance.spec.ts ../tests/regression/e2e/client-asset-certificates.spec.ts ../tests/regression/e2e/user-management-permissions.spec.ts ../tests/regression/e2e/single-asset-equipment.spec.ts ../tests/regression/e2e/scheduler-management.spec.ts
```

Go integration tests are optional:

```bash
RUN_GO_REGRESSION=1 bash tests/regression/run-vps-isolated-tests.sh
```

Use that only if Go integration tests are configured and you intentionally want to run them. The normal API regression path is Newman/Postman under `tests/regression/api/`.

Everything runs against an isolated DB and local-only ports.

The runner builds the API as `.vps-test-run/ams-server-e2e` using `go build -buildvcs=false`, then executes that binary directly. This avoids stale `go run` child processes keeping `180xx` API ports busy.

If an old port is stuck from a previous runner version:

```bash
ps -u ams_test_runner -f | grep '.cache/go-build' | grep -v grep
kill <PID>
```

Do not kill the production API on `:8080`.

## Run Only Newman API Regression

```bash
RUN_PLAYWRIGHT=0 bash tests/regression/run-vps-isolated-tests.sh
```

Run one Postman collection:

```bash
RUN_PLAYWRIGHT=0 \
NEWMAN_COLLECTIONS="tests/regression/api/system-api-smoke.postman_collection.json" \
bash tests/regression/run-vps-isolated-tests.sh
```

## Run Only The Auth Cookie E2E

```bash
E2E_SPECS="../tests/regression/e2e/api-auth-smoke.spec.ts ../tests/regression/e2e/auth-cookie-session.spec.ts" \
bash tests/regression/run-vps-isolated-tests.sh
```

## Keep The Test DB For Inspection

```bash
KEEP_DB=1 bash tests/regression/run-vps-isolated-tests.sh
```

The database name is printed in the output. Drop it manually after inspection:

```bash
psql postgres -c 'DROP DATABASE "ams_e2e_YYYYMMDDHHMMSS";'
```

## Safety Notes

Do not run integration regression tests directly against production:

```bash
AMS_RUN_INTEGRATION=1 go test ./...
```

Those tests intentionally reset tables. The safe path is the script above, because it points `DATABASE_URL` to a temporary `ams_e2e_*` database first.

The isolated API uses:

```text
APP_ENV=test
```

That intentionally disables the cookie `Secure` flag so Playwright can test the HTTP-only cookie flow over local `http://127.0.0.1` ports. Production should not use `APP_ENV=test`.

## Production Smoke Check After Deploy

After deploying the tested build to `https://maysara.work`, manually verify:

1. Login.
2. Right-click `Assets directory` in the left navigation and open it in a new tab.
3. Confirm the new tab opens `/assets` and does not redirect to `/login`.
4. Logout in one tab.
5. Confirm the other tab redirects to `/login`.
