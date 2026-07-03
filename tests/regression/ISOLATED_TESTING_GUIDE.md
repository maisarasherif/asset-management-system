# Isolated Regression Testing Guide

Use this guide whenever you need to test a feature without touching the main database. The isolated runner creates a temporary PostgreSQL database named `ams_e2e_*`, applies migrations, starts the API and frontend as needed, runs Go regression, Newman, and Playwright tests, then drops the temporary database.

## What The Runner Does

`tests/regression/run-vps-isolated-tests.sh`:

- Reads `DATABASE_URL`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` from `ams-server/.env`.
- Creates a fresh database named `ams_e2e_<timestamp>`.
- Applies all migrations to that database.
- Optionally runs Go integration regression tests with `AMS_RUN_INTEGRATION=1`.
- Seeds an isolated admin user.
- Starts the API on `http://127.0.0.1:18082/v1`.
- Runs selected Newman/Postman collections, including the HR/Admin product collection by default.
- Optionally rebuilds/reseeds, builds the frontend, serves it locally, and runs selected Playwright specs, including the HR/Admin product spec by default.
- Drops the isolated database unless `KEEP_DB=1` is set.

## Prerequisites

Run from the repository root.

Required commands:

```bash
psql
migrate
go
npm
npx
newman
curl
python3
sed
mktemp
```

On Windows, prefer Git Bash:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tests/regression/run-vps-isolated-tests.sh
```

If Git Bash resolves the Windows Store `python3` alias instead of a real Python install, create a temporary shim or update PATH so `python3` points to a real Python executable.

## Run Everything

This runs the maintained Newman collections and Playwright browser regressions by default, including HR/Admin product coverage. Go regression is off by default unless enabled.

```bash
bash tests/regression/run-vps-isolated-tests.sh
```

To include Go integration regression too:

```bash
RUN_GO_REGRESSION=1 bash tests/regression/run-vps-isolated-tests.sh
```

## Common Targeted Runs

API collections only:

```bash
RUN_PLAYWRIGHT=0 bash tests/regression/run-vps-isolated-tests.sh
```

One Newman collection:

```bash
RUN_PLAYWRIGHT=0 \
NEWMAN_COLLECTIONS="tests/regression/api/system-api-smoke.postman_collection.json" \
bash tests/regression/run-vps-isolated-tests.sh
```

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
GOFLAGS="-run=TestNameHere" \
bash tests/regression/run-vps-isolated-tests.sh
```

Playwright only:

```bash
RUN_NEWMAN=0 bash tests/regression/run-vps-isolated-tests.sh
```

By default, Newman runs:

```text
tests/regression/api/system-api-smoke.postman_collection.json
tests/regression/api/admin-surface-regression.postman_collection.json
tests/regression/api/routine-maintenance.postman_collection.json
tests/regression/api/client-asset-certificates.postman_collection.json
tests/regression/api/single-asset-equipment.postman_collection.json
tests/regression/api/hr-admin-product.postman_collection.json
```

By default, Playwright runs:

```text
../tests/regression/e2e/whole-app-regression.spec.ts
../tests/regression/e2e/hr-admin-product.spec.ts
```

Older feature-specific or mocked specs are kept for targeted diagnosis and are opt-in through `E2E_SPECS`.

One non-default Playwright spec:

```bash
RUN_NEWMAN=0 \
E2E_SPECS="../tests/regression/e2e/refactored-pages-mocked.spec.ts" \
bash tests/regression/run-vps-isolated-tests.sh
```

Keep the isolated database for inspection:

```bash
KEEP_DB=1 RUN_PLAYWRIGHT=0 bash tests/regression/run-vps-isolated-tests.sh
```

When using `KEEP_DB=1`, note the printed database name and drop it manually after inspection.

By default, the runner reclaims stale listeners on its configured test ports before it starts:

```text
API_PORT=18082
FRONTEND_PORT=14175
RECLAIM_TEST_PORTS=1
```

If you want the older behavior where occupied ports fail the run instead of being killed:

```bash
RECLAIM_TEST_PORTS=0 bash tests/regression/run-vps-isolated-tests.sh
```

## Adding Tests For A New Feature

Use all three layers when the feature crosses UI, API, and persistence boundaries:

- Go regression: backend contract, database side effects, permission checks, and bypass protection.
- Newman/Postman: real HTTP API flow against a running isolated API.
- Playwright: user-visible workflow, browser validation, navigation, and request/no-request assertions.

Recommended workflow:

1. Add or update backend Go regression in `ams-server/integration_regression_test.go` or a narrower package test.
2. Add or update a collection in `tests/regression/api/`.
3. Add or update a browser spec in `tests/regression/e2e/`.
4. Run the smallest targeted isolated command first.
5. Run the relevant full collection/spec.
6. Run the broader isolated suite before merging.

## Fixtures

Committed fixtures live in:

```text
tests/regression/fixtures/
```

Large generated fixtures should be created by `run-vps-isolated-tests.sh` instead of committed. Keep generated fixture names documented in `tests/regression/README.md`.

## Side Effects

The runner disables real external notification side effects for isolated test runs:

```text
ALERT_RECIPIENT_EMAIL=""
CLICKUP_API_TOKEN=""
CLICKUP_LIST_ID=""
```

For new features that call external services, add a similar explicit test-mode gate or blank test configuration before adding regression coverage.

## Playwright Authoring Notes

Prefer role and label selectors:

```ts
page.getByRole("button", { name: "Save" });
page.getByLabel("Working hours");
```

Scope locators to dialogs, sections, or table rows when labels repeat. Use API setup for expensive prerequisites, then exercise the actual user workflow through the UI. For dangerous or threshold-triggering flows, require an explicit env gate such as `PLAYWRIGHT_RUN_<FEATURE>_TRIGGER=1` and set it only inside the isolated runner.

Important URL distinction:

```text
VITE_API_BASE_URL=http://127.0.0.1:18082
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:18082/v1
```

The frontend build gets the API origin. Playwright API helpers can use the `/v1` base URL directly.

## Troubleshooting

If `psql` is missing in WSL but installed on Windows, use Git Bash instead of Windows `bash.exe`.

If migration fails on a fresh isolated database, fix the migration or setup path so clean databases work. Do not point the runner at the main database.

If Go integration fails before your test runs, check shared fixture setup first: auth tokens must match session middleware, and catalog/category/template setup must satisfy current API validation.

If Playwright fails because the frontend cannot reach the API, confirm `PLAYWRIGHT_API_BASE_URL` and `VITE_API_BASE_URL` are set by the runner. For mocked specs, confirm the spec routes `**/v1/**`.

If a run is interrupted, the next run will normally reclaim leftover listeners on ports `18082` or `14175`. If you disabled `RECLAIM_TEST_PORTS`, check those ports manually and drop any leftover `ams_e2e_*` database before rerunning.

## Final Verification Checklist

Before handing back feature work, report:

- Which layers ran: Go, Newman, Playwright.
- Whether they used an isolated database.
- Exact pass/fail result.
- Any known skipped checks or blockers.
- Confirmation that no generated logs, local env files, reports, or throwaway DBs remain.

## Safety Rule

Never run destructive regression tests against the main database. The expected database name should start with `ams_e2e_`; the runner refuses other names for its managed database.
