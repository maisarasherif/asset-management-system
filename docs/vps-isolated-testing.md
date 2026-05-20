# VPS Isolated Regression And E2E Testing

Use this workflow on the VPS to verify auth/session changes without touching the production database.

The runner creates a temporary PostgreSQL database whose name must start with `ams_e2e_`, applies migrations, runs Newman/Postman API regression against that database, starts an isolated API/frontend on localhost-only ports, runs Playwright API/browser checks, and then drops the database.

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
bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

## Run Everything

From the repo root:

```bash
bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

This runs the current Newman API regression collections, then recreates the isolated DB and runs Playwright browser/API smoke tests on a fresh isolated state:

```bash
newman run tests/api/postman/system-api-smoke.postman_collection.json
newman run tests/api/postman/routine-maintenance.postman_collection.json
newman run tests/api/postman/client-asset-certificates.postman_collection.json
npx playwright test tests/e2e/api-auth-smoke.spec.ts tests/e2e/auth-cookie-session.spec.ts tests/e2e/routine-maintenance.spec.ts tests/e2e/client-asset-certificates.spec.ts
```

Go integration tests are optional:

```bash
RUN_GO_REGRESSION=1 bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

Use that only if Go integration tests are configured and you intentionally want to run them. The normal API regression path is Newman/Postman under `tests/api/postman/`.

Everything runs against an isolated DB and local-only ports.

## Run Only Newman API Regression

```bash
RUN_PLAYWRIGHT=0 bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

Run one Postman collection:

```bash
RUN_PLAYWRIGHT=0 \
NEWMAN_COLLECTIONS="tests/api/postman/system-api-smoke.postman_collection.json" \
bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

## Run Only The Auth Cookie E2E

```bash
E2E_SPECS="tests/e2e/api-auth-smoke.spec.ts tests/e2e/auth-cookie-session.spec.ts" \
bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

## Keep The Test DB For Inspection

```bash
KEEP_DB=1 bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
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
