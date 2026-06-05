# Fedora 44 KDE Staging Testing Guide

Use this guide to run the same isolated Go regression, Newman, and Playwright checks on a Fedora 44 KDE staging machine. The goal is to test against a disposable `ams_e2e_*` database on the staging host, not the real staging application database.

## Safety Model

The isolated runner reads the normal `DATABASE_URL` from `ams-server/.env`, derives a temporary database name from it, creates `ams_e2e_<timestamp>`, runs tests, then drops that temporary database.

Before running anything, confirm:

- `ams-server/.env` points to the PostgreSQL server you intend to use for disposable testing.
- The database user in `DATABASE_URL` can create and drop databases.
- You are not setting `DATABASE_NAME` to a real staging database name.
- The runner output says `Creating isolated PostgreSQL database: ams_e2e_...`.

Never run regression tests directly against the live staging database.

## Install Prerequisites

On Fedora 44:

```bash
sudo dnf install -y \
  git \
  golang \
  nodejs \
  npm \
  postgresql \
  curl \
  python3 \
  sed
```

Install Newman:

```bash
sudo npm install -g newman
```

Install the Go migrate CLI:

```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

Make sure Go-installed binaries are on PATH:

```bash
export PATH="$HOME/go/bin:$PATH"
```

To make that permanent:

```bash
echo 'export PATH="$HOME/go/bin:$PATH"' >> ~/.bashrc
```

If you use zsh:

```bash
echo 'export PATH="$HOME/go/bin:$PATH"' >> ~/.zshrc
```

Install Playwright browsers after frontend dependencies are installed:

```bash
cd ams-frontend-cloudscape
npm ci
npx playwright install --with-deps
cd ..
```

## Check Tooling

From the repository root:

```bash
command -v psql
command -v migrate
command -v go
command -v npm
command -v npx
command -v newman
command -v python3
```

Also confirm versions:

```bash
psql --version
migrate -version
go version
node --version
npm --version
newman --version
```

## Prepare Environment

Confirm `ams-server/.env` contains:

```text
DATABASE_URL=postgres://...
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
SECRET_KEY=...
R2_S3_ENDPOINT=...
R2_S3_REGION=...
R2_S3_ACCESS_KEY_ID=...
R2_S3_SECRET_ACCESS_KEY=...
R2_S3_BUCKET=...
```

Storage variables are needed for API tests that upload real files. If a feature does not touch file storage, you can run a targeted subset that avoids upload tests.

For staging env files that use `APP_ENV=production`, real SMTP, ClickUp, and production frontend values, the isolated runner still starts its test API with:

```text
APP_ENV=test
ALERT_RECIPIENT_EMAIL=""
CLICKUP_API_TOKEN=""
CLICKUP_LIST_ID=""
ALLOWED_ORIGIN=http://127.0.0.1:<frontend-port>
```

This prevents the isolated regression run from sending real expiry emails or ClickUp tasks. Do not run the API binary manually with the staging `.env` for destructive tests; use the runner.

## Peer Auth And Unix Socket Databases

If staging uses PostgreSQL peer authentication over a Unix socket, the Linux user running the tests must match the database role in `DATABASE_URL`, unless `pg_ident.conf` maps it.

For this URL shape:

```text
DATABASE_URL=postgres://ams_test_runner@/ams_db?host=/var/run/postgresql&sslmode=disable
```

the test command should run as the Linux user `ams_test_runner`. The runner will derive:

```text
postgres://ams_test_runner@/postgres?host=/var/run/postgresql&sslmode=disable
postgres://ams_test_runner@/ams_e2e_<timestamp>?host=/var/run/postgresql&sslmode=disable
```

That means peer auth must allow the OS user `ams_test_runner` to connect as the DB role `ams_test_runner`.

Create the matching Linux user if needed:

```bash
sudo useradd --system --create-home --shell /bin/bash ams_test_runner
```

Create or update the matching PostgreSQL role:

```bash
sudo -u postgres psql
```

```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_test_runner') THEN
        CREATE ROLE ams_test_runner LOGIN CREATEDB;
    ELSE
        ALTER ROLE ams_test_runner CREATEDB;
    END IF;
END $$;
\q
```

Test peer auth:

```bash
sudo -iu ams_test_runner
psql "postgres://ams_test_runner@/postgres?host=/var/run/postgresql&sslmode=disable" -c "select current_user, current_database();"
```

Run the isolated suite as that same Linux user:

```bash
sudo -iu ams_test_runner
cd /path/to/asset-management-system
bash tests/regression/run-vps-isolated-tests.sh
```

If the repository belongs to another Linux user, either clone a copy under `ams_test_runner` or grant this user read/write access. The runner writes `.vps-test-run/`, builds the frontend, and may create generated fixtures.

If the database user cannot create databases, create a dedicated regression user or grant the right permission. Example:

```bash
sudo -u postgres psql
```

```sql
ALTER ROLE your_regression_user CREATEDB;
```

Then exit `psql`:

```sql
\q
```

## Run The Full Isolated Suite

From the repository root:

```bash
bash tests/regression/run-vps-isolated-tests.sh
```

To include Go integration regression:

```bash
RUN_GO_REGRESSION=1 bash tests/regression/run-vps-isolated-tests.sh
```

This will:

- Create `ams_e2e_*`.
- Run migrations.
- Start the isolated API on `127.0.0.1:18082`.
- Run Newman.
- Recreate the isolated DB before Playwright.
- Build and serve the frontend on `127.0.0.1:14175`.
- Run the unified Playwright whole-app regression.
- Drop the isolated DB.

## Targeted Runs

Go regression only:

```bash
RUN_GO_REGRESSION=1 \
RUN_NEWMAN=0 \
RUN_PLAYWRIGHT=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

One Go regression test:

```bash
RUN_GO_REGRESSION=1 \
RUN_NEWMAN=0 \
RUN_PLAYWRIGHT=0 \
GOFLAGS="-run=TestUploadCertificateFileRejectsOversizeFile" \
bash tests/regression/run-vps-isolated-tests.sh
```

Newman only:

```bash
RUN_GO_REGRESSION=0 \
RUN_PLAYWRIGHT=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

One Newman collection:

```bash
RUN_GO_REGRESSION=0 \
RUN_PLAYWRIGHT=0 \
NEWMAN_COLLECTIONS="tests/regression/api/system-api-smoke.postman_collection.json" \
bash tests/regression/run-vps-isolated-tests.sh
```

Playwright only:

```bash
RUN_GO_REGRESSION=0 \
RUN_NEWMAN=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

By default, Playwright runs only the unified main E2E:

```text
../tests/regression/e2e/whole-app-regression.spec.ts
```

Older feature-specific or mocked specs are kept for targeted diagnosis and are opt-in through `E2E_SPECS`.

One non-default Playwright spec:

```bash
RUN_GO_REGRESSION=0 \
RUN_NEWMAN=0 \
E2E_SPECS="../tests/regression/e2e/refactored-pages-mocked.spec.ts" \
bash tests/regression/run-vps-isolated-tests.sh
```

API plus Newman, no browser:

```bash
RUN_GO_REGRESSION=0 \
RUN_PLAYWRIGHT=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

## Keep The Test Database Temporarily

Use this when you need to inspect failed state:

```bash
KEEP_DB=1 \
RUN_PLAYWRIGHT=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

The runner will print the database name. Drop it manually when finished:

```bash
dropdb ams_e2e_<timestamp>
```

Or with a connection URL:

```bash
psql "postgres://user:password@host:port/postgres" -c 'DROP DATABASE "ams_e2e_<timestamp>";'
```

## Ports

Default ports:

```text
API:      18082
Frontend: 14175
```

Use different ports if staging already has something there:

```bash
API_PORT=18083 \
FRONTEND_PORT=14176 \
bash tests/regression/run-vps-isolated-tests.sh
```

By default, the runner reclaims stale listeners on its configured test ports before starting:

```text
RECLAIM_TEST_PORTS=1
```

If you want occupied ports to fail the run instead:

```bash
RECLAIM_TEST_PORTS=0 bash tests/regression/run-vps-isolated-tests.sh
```

Check listeners:

```bash
ss -ltnp | grep -E ':18082|:14175'
```

## Fedora/KDE Notes

Headless Playwright should work without opening a browser window. If Chromium dependencies are missing, rerun:

```bash
cd ams-frontend-cloudscape
npx playwright install --with-deps
```

If KDE notifications or browser windows appear, confirm Playwright is using headless mode in `ams-frontend-cloudscape/playwright.config.ts`.

If SELinux or firewall rules block local ports, verify loopback access:

```bash
curl http://127.0.0.1:18082/v1/health
curl http://127.0.0.1:14175
```

The runner binds to `127.0.0.1`, so firewall changes are usually not needed.

If the API log says Gin is `Listening and serving HTTP on :18082` but the runner still says the API did not become ready, check proxy variables:

```bash
env | grep -i proxy
```

The runner exports `NO_PROXY`/`no_proxy` for `127.0.0.1`, `localhost`, and `::1`, and its own `curl` probes use `--noproxy "*"`. If you test manually, use:

```bash
curl --noproxy "*" http://127.0.0.1:18082/v1/health
```

## Adding Future Feature Tests

For every feature, decide which layers matter:

- Backend-only behavior: add Go regression.
- API contract or external client behavior: add Newman.
- User workflow or browser validation: add Playwright.
- File, auth, permissions, or database side effects: test both bypass/API and UI behavior.

Recommended feature-test loop:

1. Write the smallest Go regression or Newman request that proves the backend behavior.
2. Run the targeted isolated command.
3. Add Playwright coverage for the visible workflow.
4. Run the targeted Playwright spec.
5. Run the relevant Newman collection.
6. Run the broader isolated suite before deployment.

## Troubleshooting

`psql: command not found`:

```bash
sudo dnf install -y postgresql
```

`migrate: command not found`:

```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
export PATH="$HOME/go/bin:$PATH"
```

`newman: command not found`:

```bash
sudo npm install -g newman
```

`permission denied to create database`:

Grant `CREATEDB` to the regression database user or use a different `DATABASE_URL`.

Migration fails on a fresh `ams_e2e_*` DB:

Fix the migration or seed path. Fresh isolated databases must migrate cleanly.

Tests fail before your feature:

Check shared fixtures, auth/session setup, catalog scope setup, and required environment variables.

Interrupted run left processes:

```bash
pkill -f ams-server-e2e || true
pkill -f static-server.cjs || true
```

Usually this is unnecessary because the next runner invocation reclaims listeners on `API_PORT` and `FRONTEND_PORT` when `RECLAIM_TEST_PORTS=1`.

Interrupted run left a database:

```bash
psql "postgres://user:password@host:port/postgres" -c "SELECT datname FROM pg_database WHERE datname LIKE 'ams_e2e_%';"
dropdb ams_e2e_<timestamp>
```

## Final Pre-Deployment Checklist

Before trusting a staging test run, verify the output includes:

```text
Creating isolated PostgreSQL database: ams_e2e_...
Applying migrations to isolated database
Running Newman API regression collections
Running Playwright E2E specs against isolated stack
All isolated VPS tests passed.
Dropping isolated database: ams_e2e_...
```

If `KEEP_DB=1` is set, the final drop will not happen. Drop the database manually after inspection.
