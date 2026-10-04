# AMS Testing Guide — Local and Remote Fedora

Authoritative guide, consolidated on 2 October 2026 from the isolated and Fedora staging guides and checked against the current `run-vps-isolated-tests.sh` and Playwright configuration. Maintain execution instructions here; the older guide files redirect to this document.

Use the maintained [isolated runner](./run-vps-isolated-tests.sh) for Go integration regression, Newman API checks, and Playwright browser workflows. The same runner operates locally or on the remote Fedora server. These instructions do not establish that a server is configured or tests have passed.

## Test layers and maintained files

| Layer | Checks | Maintained location |
| --- | --- | --- |
| Go regression | Backend behavior, database side effects, authorization/bypass protection, concurrency, and injected failures | `ams-server/integration_regression_test.go` and focused Go package tests |
| Newman/Postman | Real HTTP API requests, contracts, permissions, uploads, and prerequisite setup | `tests/regression/api/` |
| Playwright | Real user workflows, navigation, browser validation, and requests against the isolated application | `tests/regression/e2e/`; config in `ams-frontend-cloudscape/playwright.config.ts` |

Fixtures live in `tests/regression/fixtures/`; helpers live in `tests/regression/support/`. Use the maintained runner for combined execution. Old manual collections and standalone wrappers are not the authoritative execution path; validate them against the current API before reuse.

## Isolation and runner behavior

The runner reads `DATABASE_URL`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` from `ams-server/.env`. It derives maintenance/test URLs on that PostgreSQL server, preserving connection parameters and replacing database-name overrides, and creates a disposable `ams_e2e_<timestamp>` database. It does not need the normal application's data.

1. Check tools/database name, create the disposable database, and apply all migrations.
2. If enabled, run `go test -count=1 -json ./...` with `APP_ENV=test`, `AMS_RUN_INTEGRATION=1`, and the disposable `DATABASE_URL`; recreate the database afterwards.
3. Seed an active `SUPER_ADMIN`, build/start the API, and verify its login.
4. Run selected Newman collections. They share the database during this stage; each collection must create its own prerequisites.
5. If Newman ran and Playwright is enabled, restart/recreate/reseed the API database before browser tests.
6. Type-check/build the frontend for the isolated API, serve its temporary build, and run selected Playwright specs.
7. On exit, stop the owned test processes, delete only journaled R2 objects under the unique run prefix, remove the temporary frontend build, and drop the database unless `KEEP_DB=1`. Cleanup failures return a nonzero exit; success is printed only afterwards.

Never run destructive regression against the normal application database. `DATABASE_NAME` must start with `ams_e2e_`; other names are rejected. The runner drops/recreates the selected test database, so use a fresh name for each run. Use a separate test checkout and one run at a time per checkout: fixture generation and frontend trace output are shared. Logs, journals, summaries, and HTML/JSON reports are retained under the printed `.vps-test-run/run.<suffix>/` directory.

The regression role must connect to the maintenance database (`postgres`), create/drop the disposable database, and execute migrations/test operations. Check these permissions before running; use a dedicated regression role where possible.

### Defaults

| Setting | Current default | Meaning |
| --- | --- | --- |
| `RUN_GO_REGRESSION` | `0` | Set `1` for Go integration regression. `RUN_REGRESSION` is the older fallback alias. |
| `RUN_NEWMAN` | `1` | Run selected API collections. |
| `RUN_PLAYWRIGHT` | `1` | Build frontend and run selected browser specs. |
| `DATABASE_NAME` | `ams_e2e_<timestamp>` | Disposable database. |
| `API_PORT` | `18082` | Test API base: `http://127.0.0.1:18082/v1`. |
| `FRONTEND_PORT` | `14175` | Test frontend: `http://127.0.0.1:14175`. |
| `RECLAIM_TEST_PORTS` | `0` | Fail on occupied ports. Explicit `1` permits stopping existing listeners on the configured test ports. |
| `KEEP_DB` | `0` | Set `1` to retain the last database state at exit. |
| `NEWMAN_COLLECTIONS` | Seven below | Space-separated repository-relative paths. |
| `E2E_SPECS` | Three below | Space-separated spec paths relative to the frontend directory. |

The runner still builds/starts the API and checks login for a Go-only invocation; it checks both test ports even with Playwright disabled. Flags select test layers, not a minimal infrastructure mode.

Default Newman collections:

```text
tests/regression/api/system-api-smoke.postman_collection.json
tests/regression/api/admin-surface-regression.postman_collection.json
tests/regression/api/routine-maintenance.postman_collection.json
tests/regression/api/client-asset-certificates.postman_collection.json
tests/regression/api/single-asset-equipment.postman_collection.json
tests/regression/api/hr-admin-product.postman_collection.json
tests/regression/api/generated-renewal-certificates.postman_collection.json
```

Default Playwright specs:

```text
../tests/regression/e2e/whole-app-regression.spec.ts
../tests/regression/e2e/hr-admin-product.spec.ts
../tests/regression/e2e/generated-renewal-certificates.spec.ts
```

Other feature-specific and mocked specs are opt-in through `E2E_SPECS`. The whole-app spec covers route health and selected behavior, not every feature workflow. Mocked page tests do not replace real end-to-end feature checks.

### Storage and external effects

The test API and Go run override:

```text
APP_ENV=test
ALERT_RECIPIENT_EMAIL=""
CLICKUP_API_TOKEN=""
CLICKUP_LIST_ID=""
```

The API also uses the disposable `DATABASE_URL`, test port/frontend origin, seeded credentials, and default `LOGIN_RATE_LIMIT=200`. The notification overrides disable ordinary expiry email/ClickUp delivery; they do not prove those integrations work or isolate every future external service. Add equivalent controls for new external effects.

The runner keeps the configured `R2_S3_*` bucket/credentials and uses real R2 calls. It requires all five storage settings, uses a unique `ams-e2e/<UUID>/` prefix, and journals upload intentions before each storage request. The prefix and journal require `APP_ENV=test` and an explicit `ams_e2e_` database. Normal uploads with both test settings unset retain their current keys. Use configuration approved for the run; dedicated test storage is the usual default. For generated renewal certificates, the user explicitly authorized their already-configured R2 bucket as-is. Do not request another bucket or overwrite that configuration. Make it available to Go and the API, use unique test-owned objects, and verify upload/read/delete. Record created keys before database cleanup and delete only those objects, never unrelated documents/signatures or an entire shared bucket.

Go storage-backed tests can skip when required settings are absent. Newman upload requests may fail rather than skip. For unrelated features, select an explicit subset avoiding storage. For certificate issuance, provide test storage: skipped signature/PDF paths do not satisfy the step's gate.

## Remote Fedora setup

For the current generated-certificate feature, the user owns VPS test execution and returns the results. Codex supplies code/tests/runner changes and exact commands; it does not require SSH access or start remote/local live suites. The setup instructions below are for the person operating the host.

### Connect and select the test checkout

Replace the placeholders with the agreed server account and repository path:

```bash
ssh FEDORA_USER@FEDORA_HOST
cd /path/to/asset-management-system
git branch --show-current
git rev-parse HEAD
git status --short
```

The repository does not document the SSH hostname, account, or remote checkout path. Obtain those values before connecting. The runner does not perform SSH or copy/deploy code. Ensure the separate test checkout contains the exact change being validated; record its commit and uncommitted changes. For copied uncommitted work, verify the tested diff matches the feature diff. Keep this checkout separate from a live service checkout.

Run the suite on Fedora after connecting. Localhost addresses refer to that server, not the workstation. Headless tests require no KDE session, desktop, public URL, or port forwarding.

### Install and check prerequisites

The original server guide targets Fedora 44 KDE. Install base tools as an administrator:

```bash
sudo dnf install -y git golang nodejs npm postgresql curl python3 sed
sudo npm install -g newman
```

Install migrate as the test account:

```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
export PATH="$HOME/go/bin:$PATH"
```

Add the PATH export to that account's shell profile if needed. Verify Go satisfies `ams-server/go.mod` (currently `go 1.25.4`) and Node satisfies packages installed from the frontend lockfile; distribution defaults may differ.

From the test checkout, install frontend dependencies and browsers as the test account:

```bash
cd ams-frontend-cloudscape
npm ci
npx playwright install --with-deps
cd ..
```

If automatic OS dependency installation is unavailable on Fedora, resolve dependencies reported by Playwright on the host and rerun browser installation. The test account must be able to use its browser cache. Record the working tool versions.

```bash
command -v psql migrate go node npm npx newman curl python3 sed mktemp
psql --version
migrate -version
go version
node --version
npm --version
newman --version
```

The runner requires `psql`, `migrate`, `go`, `npm`, `npx`, `curl`, `python3`, `sed`, and `mktemp` even for targeted runs; Newman is required when enabled. Port diagnostics/reclamation use `ss`, `lsof`, or `fuser` when available. SQLC is a development prerequisite when changing SQL queries, not a runner prerequisite.

### Test environment file

Create `ams-server/.env` in the separate test checkout with approved test-host configuration. Do not commit or print credentials. Include:

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

R2 settings must reference the storage approved for this run; use the user's existing configured bucket for this feature. The runner derives its database URL from this file; merely exporting another `DATABASE_URL` does not change the source URL it reads. PostgreSQL may be on another host, but the URL must identify the intended server for disposable testing. The test account needs a writable checkout, Go modules/cache, frontend dependencies, and `.vps-test-run/`.

### PostgreSQL peer authentication and Unix sockets

For peer authentication, the OS account must match the PostgreSQL role unless `pg_ident.conf` maps it. For example:

```text
DATABASE_URL=postgres://ams_test_runner@/ams_db?host=/var/run/postgresql&sslmode=disable
```

The runner preserves the socket parameters and derives:

```text
postgres://ams_test_runner@/postgres?host=/var/run/postgresql&sslmode=disable
postgres://ams_test_runner@/ams_e2e_<timestamp>?host=/var/run/postgresql&sslmode=disable
```

If a dedicated test account is needed, an administrator can create it:

```bash
sudo useradd --system --create-home --shell /bin/bash ams_test_runner
sudo -u postgres psql
```

In psql:

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

Log in as that account and verify maintenance connectivity:

```bash
sudo -iu ams_test_runner
psql "postgres://ams_test_runner@/postgres?host=/var/run/postgresql&sslmode=disable" -c "select current_user, current_database();"
cd /path/to/asset-management-system
```

Provision a writable separate checkout and install dependencies/browser binaries for the same account running tests. Use an existing dedicated regression role if available, granting it `CREATEDB` only where needed. Password authentication requires its own configured connection rather than the peer-account example.

### Ports and network behavior

The frontend helper binds to `127.0.0.1`. Tests/probes address the API at `127.0.0.1`, but the current API uses `router.Run(":" + port)` and listens on all interfaces. Use host network restrictions to keep test API ports private; public firewall openings are unnecessary.

Use free test ports. `RECLAIM_TEST_PORTS=0` is the default; explicit `1` permits stopping existing listeners. Exit cleanup stops only the run's owned process IDs. Do not use live-service ports. Alternate ports:

```bash
API_PORT=18083 FRONTEND_PORT=14176 RECLAIM_TEST_PORTS=0 \
RUN_GO_REGRESSION=1 bash tests/regression/run-vps-isolated-tests.sh
```

Check listeners:

```bash
ss -ltnp 'sport = :18082 or sport = :14175'
```

## Run all three layers

From the repository root on Fedora or a configured local test host:

```bash
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

This enables Go, Newman, and Playwright explicitly. Without flags, Go is off. A final success message applies only to selected checks and does not establish that skipped paths ran.

## Targeted commands

Use the smallest relevant selection first, then the complete relevant collection/spec and broader suite. These commands retain the runner's isolated migrations, API startup/login check, and cleanup.

### Go integration regression

Go layer only:

```bash
RUN_GO_REGRESSION=1 RUN_NEWMAN=0 RUN_PLAYWRIGHT=0 RECLAIM_TEST_PORTS=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

For a single Go test, first prepare a migrated disposable database (for example, retain one using the cleanup section), and export its full URL as `TEST_DATABASE_URL` in the test shell. Run from the repository root. This direct command validates the database name before invoking Go and preserves test-only flags outside the build path:

```bash
(
  cd ams-server
  python3 - <<'PY'
import os
import re
import subprocess
from urllib.parse import parse_qs, unquote, urlsplit

url = os.environ.get("TEST_DATABASE_URL", "")
parts = urlsplit(url)
name = unquote(parts.path.lstrip("/"))
for key in ("dbname", "database"):
    if any(value != name for value in parse_qs(parts.query, keep_blank_values=True).get(key, [])):
        raise SystemExit("Database query override must match the disposable database path")
if parts.scheme not in {"postgres", "postgresql"} or not re.fullmatch(r"ams_e2e_[A-Za-z0-9_]+", name):
    raise SystemExit("Set TEST_DATABASE_URL to the prepared disposable database URL")
env = os.environ.copy()
env.update(APP_ENV="test", DATABASE_URL=url, AMS_RUN_INTEGRATION="1",
           ALERT_RECIPIENT_EMAIL="", CLICKUP_API_TOKEN="", CLICKUP_LIST_ID="")
raise SystemExit(subprocess.run([
    "go", "test", "./...", "-run", "^TestUploadCertificateFileRejectsOversizeFile$",
    "-count=1", "-v",
], env=env).returncode)
PY
)
```

This advanced direct command does not provision/drop the database or start the API. It uses test storage from the shell/test checkout; verify and clean up its side effects and database afterwards. Confirm the intended test appears: a filter matching no tests is not coverage. The runner sets `AMS_RUN_INTEGRATION=1`; direct integration runs without it can skip. Storage checks have a separate gate.

Do not put test-only `-run` or `-count` flags in `GOFLAGS` for the maintained runner: it also invokes `go run` and `go build`, which reject those flags. The original guides' `GOFLAGS=-run=...` example is superseded. For the normal isolated workflow, use the Go-layer command above.

### Newman API regression

All default collections, no Go/browser tests:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=1 RUN_PLAYWRIGHT=0 RECLAIM_TEST_PORTS=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

One maintained collection:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=1 RUN_PLAYWRIGHT=0 RECLAIM_TEST_PORTS=0 \
NEWMAN_COLLECTIONS='tests/regression/api/client-asset-certificates.postman_collection.json' \
bash tests/regression/run-vps-isolated-tests.sh
```

The runner uses the repository root as Newman's working directory and injects `baseUrl`, `adminEmail`, and `adminPassword`; separate Postman environment files are unnecessary. Multipart file paths must resolve from that directory. Before Newman it generates the 11 MB `oversize-certificate.pdf` fixture to test the 10 MB upload limit; do not commit it.

### Playwright browser regression

Default browser specs only:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

One existing real feature spec:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
E2E_SPECS='../tests/regression/e2e/client-asset-certificates.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

For multiple specs, provide one space-separated value. Paths are relative to `ams-frontend-cloudscape`, where Playwright runs. The config is headless, uses one worker/no parallel execution, zero retries, a 120-second test timeout, list/HTML reports, screenshots on failure, and retained failure traces. `PLAYWRIGHT_BROWSER_CHANNEL` can select an installed browser channel; otherwise use the installed Playwright browser.

The runner supplies:

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:14175
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:18082/v1
PLAYWRIGHT_ADMIN_EMAIL=<seeded email>
PLAYWRIGHT_ADMIN_PASSWORD=<seeded password>
PLAYWRIGHT_RUN_ROUTINE_MAINTENANCE_TRIGGER=1
PLAYWRIGHT_RUN_CLIENT_PORTAL_TRIGGER=1
```

The frontend build receives `VITE_API_BASE_URL=http://127.0.0.1:18082` (origin without `/v1`); API helpers receive the base including `/v1`. Custom ports update these automatically. The standalone Playwright config's fallback port is not the isolated runner's frontend port.

## Test every completed feature step

After every new or changed feature, create or update its dedicated test files in all three layers:

| Layer | Dedicated feature file |
| --- | --- |
| Go | `<feature>_integration_test.go` or another feature-specific `_test.go` in the appropriate backend package |
| Newman | `tests/regression/api/<feature>.postman_collection.json` |
| Playwright | `tests/regression/e2e/<feature>.spec.ts` |

Extend existing dedicated files when changing a feature. Shared smoke/whole-app checks supplement this coverage, rather than replacing it. Include successful paths, relevant roles, invalid input, state transitions, and introduced edge cases; do not create empty placeholders.

Review `run-vps-isolated-tests.sh` for every feature and update it where needed: collection/spec registration, fixtures, test services/configuration, environment gates, and cleanup. Applicable maintained feature suites belong in the broader run; document the reason and exact command for any intentionally opt-in suite. Go files inside the backend module are already discovered by `go test ./...`, so registration alone needs no script change for that layer. Keep this guide/README current and explain in the final report when no runner change was necessary.

For generated renewal certificates, deliver each step as a vertical slice with UI, API, persistence/storage, and focused tests. Codex prepares tests and exact commands, performs scoped static/build checks, and hands off the slice. The user synchronizes that change to the VPS and runs Go/Newman/Playwright. Record returned results and fix failures in the same slice; the user reruns before advancing. This is a gate per completed slice, not a full-suite run after each file edit. Label live checks pending until actual user results arrive.

1. Establish isolated services and a baseline; report unrelated baseline failures separately.
2. Add/update focused Go checks, a self-contained Newman collection, and a real browser spec for the slice.
3. Run targeted checks covering relevant roles, successful/rejected requests, and side effects.
4. Where PDFs are produced, extract content and visually verify branding, signatures, numbering, dates, and pagination.
5. Run the complete relevant collection/spec before advancing. Skipped or mocked workflow paths do not establish end-to-end coverage.
6. Run the broader maintained suite plus relevant opt-in feature specs before merge/deployment.

During implementation, select new collections/specs explicitly with `NEWMAN_COLLECTIONS`/`E2E_SPECS`; before feature completion, register applicable maintained suites in runner defaults or document the reason and exact command for intentional opt-in execution. The planned generated-certificate suites are not implemented yet; their planned filenames are not proof of coverage.

Follow [development rules](../../rules.md): consider updates to `ams-server/integration_regression_test.go`, `tests/regression/api/system-api-smoke.postman_collection.json`, and `tests/regression/e2e/whole-app-regression.spec.ts`, alongside focused suites; explain when a listed file needs no change. The user performs live verification for this feature. Documentation-only edits need link/command checks rather than live regression.

Each Newman collection creates its own prerequisites; include project-backed and warehouse assets where assignment affects behavior. Cover relevant branches within the focused suite. Fix the first setup failure before downstream blank-ID requests.

Playwright should use role/label selectors scoped to dialogs/rows when needed. API setup may create expensive prerequisites, but exercise delivered actions through the real UI. Gate destructive/threshold-triggering workflows explicitly and enable them only in isolated execution. New gates must be documented/passed to the process; the two existing gates do not enable future ones.

Use controlled test infrastructure or narrow Go rendering/storage interfaces for failure injection, rather than public production failure-trigger endpoints. Regenerate sqlc after SQL source changes. Run relevant frontend build/lint checks; the isolated runner does not run lint automatically.

## Logs, reports, and cleanup

The exit trap stops owned services, cleans journaled test objects, removes temporary frontend output, and drops the disposable database. Verify the printed cleanup results; object/database failures make the run fail. It retains run logs/binaries/journals, the oversize fixture, and Playwright reports/results. Preserve failure evidence for diagnosis, then deliberately remove generated artifacts and keep them out of the feature diff. Keep `.env`, seeded credentials, login-response tokens, and sensitive reports private.

| Location | Evidence |
| --- | --- |
| `.vps-test-run/run.<suffix>/api.out.log`, `api.err.log` | API output/errors |
| `.vps-test-run/run.<suffix>/frontend.out.log`, `frontend.err.log` | Frontend output/errors |
| `.vps-test-run/run.<suffix>/*-ready.curl.log` | Last readiness error |
| `.vps-test-run/run.<suffix>/summary.txt`, `go-summary.txt`, `go-results.jsonl` | Layer/cleanup outcomes and actual Go counts/skips |
| `.vps-test-run/run.<suffix>/*.postman_collection.json.log` | Newman request/assertion summaries |
| `.vps-test-run/run.<suffix>/storage-objects.txt`, `storage-cleanup.log` | Run-owned object intents and deletion outcomes |
| `.vps-test-run/run.<suffix>/cleanup.env` | Private cleanup retry settings; includes database credentials |
| `.vps-test-run/run.<suffix>/playwright-report/` | Browser HTML report |
| `ams-frontend-cloudscape/test-results/` | Failure screenshots/traces and artifacts |

View a saved report on the test host:

```bash
cd ams-frontend-cloudscape
npx playwright show-report ../.vps-test-run/run.EXAMPLE/playwright-report --host 127.0.0.1
```

For remote evidence, use an authorized SSH tunnel or copy reviewed artifacts to the workstation; do not expose reports publicly. Remove sensitive data before sharing.

Retain the last disposable database for diagnosis:

```bash
KEEP_DB=1 RUN_GO_REGRESSION=1 RECLAIM_TEST_PORTS=0 \
bash tests/regression/run-vps-isolated-tests.sh
```

Stage resets still occur; `KEEP_DB=1` preserves exit state, not every stage. Afterwards, connect to the same PostgreSQL maintenance database using approved authentication, verify the exact retained `ams_e2e_*` name from output, and drop only that database. Do not use bare `dropdb` against an assumed default PostgreSQL host.

For interrupted runs, inspect ports/process command lines, stop only identified test processes, and check retained databases/test objects. Avoid broad process-name kills on a shared server. Use a fresh database name next time.

## Troubleshooting

| Symptom | Check/action |
| --- | --- |
| Missing command | Install the listed tool for the test account; check PATH for Go binaries/Newman. |
| PostgreSQL/peer-auth failure | Verify maintenance connectivity, OS/DB account or mapping, socket/host parameters, and regression-role `CREATEDB`. |
| Fresh database migration failure | Fix migration/seed setup; continue using disposable databases. |
| First login/setup request fails | Check credentials, active roles/sessions, and catalog/category fixture contracts before downstream blank-ID requests. |
| Upload/signature/PDF failure or skip | Check dedicated storage config, permissions/connectivity, and cleanup; distinguish skip from success. |
| Occupied port | Inspect its owner and choose free ports rather than reclaiming a live listener. |
| API listening but readiness fails | Inspect API/curl logs, database startup errors, proxies, and selected URLs. Runner sets `NO_PROXY`/`no_proxy` and uses `curl --noproxy "*"`. |
| Fedora browser startup/install failure | Verify browser cache ownership and install missing OS dependencies reported by Playwright. |
| Frontend cannot reach API | Check origin versus `/v1`, build URLs, trace, and API logs. |
| Unexpected browser skips | Check spec gates and selection; skipped workflows are not coverage. |

While the runner is active, probe its configured ports:

```bash
curl --noproxy '*' http://127.0.0.1:18082/v1/health
curl --noproxy '*' http://127.0.0.1:14175
```

Use the chosen ports; the frontend exists only during Playwright's stack. Readiness failures print recent logs.

## Local Windows option

Remote Fedora is the feature's agreed test target. A configured Windows host can use the runner for local diagnosis through Git Bash:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -c 'RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 bash tests/regression/run-vps-isolated-tests.sh'
```

Run from the repository root. Use Git Bash rather than `C:\Windows\system32\bash.exe` (WSL), with required tools on PATH. If `python3` resolves to the Windows Store alias, use a temporary shim/PATH entry for a real Python executable. Apply the same database/storage isolation locally.

## Result report and completion gate

After each feature step, record:

- Tested branch/commit and uncommitted diff, host, and relevant tool versions.
- Exact commands/flags and selected Go tests, Newman collections, and Playwright specs.
- The dedicated feature test files and runner changes, or the reason no runner change was necessary.
- Pass/fail/skip counts by layer, unrelated baseline failures, and blockers.
- Roles/workflows covered, PDF checks, and coverage gaps.
- Disposable database identity and test storage, without credentials.
- Failure evidence and cleanup status for processes, database, objects, and generated artifacts.

For a full three-layer run, verify the stages and completion/cleanup messages:

```text
Creating isolated PostgreSQL database: ams_e2e_...
Applying migrations to isolated database
Running Go regression tests against isolated database
Running Newman API regression collections
Running Playwright E2E specs against isolated stack
All isolated VPS tests passed.
Dropping isolated database: ams_e2e_...
```

The success line alone does not prove all feature paths ran. Verify selections/counts/skips and cleanup. With `KEEP_DB=1`, document retention and later cleanup. Disabled notification delivery does not verify live SMTP/ClickUp; integration-specific checks need a separately scoped test setup.

## Generated-certificate feature-step coverage and evidence

The focused Go file `ams-server/generated_renewal_certificates_integration_test.go`, Newman collection `api/generated-renewal-certificates.postman_collection.json`, and Playwright spec `e2e/generated-renewal-certificates.spec.ts` verify the existing external renewal workflow, own ADMIN signing profiles, and SUPER_ADMIN signer management/eligibility. They contain implemented checks, not placeholders for future generated endpoints. All are included in the maintained broader run. The baseline preserves historical documents, checks automatic validity dates, and downloads persisted R2 document bytes after reload.

Step 1 passed on the user's Fedora VPS on 3 October 2026: run.BQqdIV recorded 106 Go passes, no failures/skips, Newman passed, and 6 journaled objects deleted; the spec-loading fix was verified by run.BfIKDk with all 5 Playwright tests passed, 1 journaled object deleted, and the disposable database dropped. The second run selected Playwright only. Newman request/assertion totals from the first run were not supplied.

Step 2 added 47 signing-profile requests to the collection (73 requests total), a second real-stack Playwright test, image-normalization tests in `ams-server/certificateissuance/signature_image_test.go`, and scoped storage/read tests in `ams-server/utils/object_storage_test.go`. Coverage includes organization persistence, account-derived identity, private owner-only image access, PNG/JPEG normalization, retained earlier images, oversized/invalid images, ownership/category bypasses, role/status changes, controlled storage/publication failures, and overlapping uploads. Playwright also checks the Account form at 320, 768, 1024, and 1440 pixels. Step 2 is complete across the two runs recorded below.

Step 3 adds four dedicated Go integration tests, 121 API requests (194 total), and a third real-stack browser test. They cover super-admin-managed competent-person signatures; private immutable PNG/JPEG replacements; ordinary-admin category assignment, clearing, and preservation of the saved image; direct role/field bypasses; only-own ADMIN selection versus eligible SUPER_ADMIN competent-person lists; restricted/unrestricted certificate categories; inactive people/categories/accounts and unsigned profiles; changed eligibility after selection; and overlapping uploads or management permission revoked during storage. Browser checks include the Administration forms and generated signer panel at the four maintained viewport widths. PDF preview and issuance are later slices and are not claimed as covered here. Step 3 passed its live gate across the recorded Go/Newman and browser correction runs below.

The first Step 3 run, run.XDW6be, recorded Go 123 passed, 1 failed, 0 skipped; Newman/Playwright were not run. Storage cleanup deleted 8 journaled objects and database cleanup dropped `ams_e2e_20261003182348`, with exit 1. The failing eligibility test tried to remove certificate category rules through PATCH, which does not accept that field. The dedicated suites now create restricted/unrestricted certificates through POST, verify persisted rules, and check that a signer allowed on one certificate cannot bypass another's restrictions. Newman setup also creates its competency category before its restricted certificate.

The corrected run.U0sx6o recorded 124 Go passes, no failures/skips, and Newman passed (request/assertion totals not supplied). Playwright recorded 2 passes and 1 failure in 32 seconds: the SUPER_ADMIN dropdown label matched its trigger button and two internal elements. Storage cleanup deleted 23 journaled objects, database `ams_e2e_20261003191549` was dropped, and exit status was 1. The dedicated Playwright spec now restricts every affected dropdown label to the button role. This changes test targeting only; Go/Newman and shared regression files need no changes. After reviewing, committing, pushing, and updating the VPS checkout, rerun Playwright as `ams_test_runner`:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

The subsequent browser-only result had 2 passes and 1 failure in 2.5 minutes. The SUPER_ADMIN test exhausted its 120-second budget and its finally-block DELETE replaced the stalled-action error. The supplied snapshot remained on the certificate page immediately after deactivation checks. Source inspection found a Sign out button lookup there, but the sidebar uses a menuitem inside a closed menu; the visible button is on Account. The spec now navigates to Account, verifies its heading, and uses its visible Sign out button with a 10-second click bound. Cleanup DELETEs have 5-second request bounds; all registered fixture deletions are attempted, and cleanup errors are annotated when there is an original failure rather than replacing it. Cleanup failure still fails an otherwise successful test. Runner/HTML hosting defaults, application behavior, Go/Newman, and shared regression files remain unchanged for this correction. The user did not supply a run ID or final cleanup summary for this latest result; no cleanup pass is inferred.

The user then returned run.PMeaRd: all 3 focused Playwright tests passed in 56.7 seconds (baseline 7.1s, SUPER_ADMIN management/eligibility 32.2s, own-ADMIN profile 14.5s). Storage cleanup deleted 9 journaled objects, database `ams_e2e_20261003200133` was dropped, and exit status was 0. Go/Newman were intentionally not run for this browser-only correction. Together with run.U0sx6o's 124 Go passes (0 failed/skipped) and Newman pass, this completes the Step 3 gate and permits Step 4 PDF preview work. Evidence was received on 4 October 2026; the run/database identifier carries the VPS timestamp from 3 October. Static checks are not counted as live passes.

Use the configured test OS account rather than running the script as root. On the current Fedora VPS the PostgreSQL role `ams_test_runner` uses Unix-socket peer authentication and requires the matching OS account. The test checkout is `/home/pms/ams-testing/asset-management-system`; synchronizing Git changes as `pms` and running the script as `ams_test_runner` are separate operations.

```bash
# Review, commit, and push the local certgen changes yourself, then update the VPS test checkout.
# Run this in an ams_test_runner shell after that update.
cd /home/pms/ams-testing/asset-management-system
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' \
E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

Existing default collection/spec registration and Go discovery include the added cases; committed PNG/JPEG fixtures and the generated oversize certificate fixture supply uploads; signature writes use the established scoped journal. The shared Go reset includes `competent_person_signing_profiles`. Shared API smoke and whole-app specs need no changes because the focused suites exercise the new behavior and existing routes remain compatible. Earlier signature objects remain readable until run cleanup, even if database rows are reset or source users are deleted. At the user's request after run.U0sx6o, automatic failure-report hosting is restored: the runner explicitly sets `PLAYWRIGHT_HTML_OPEN=on-failure`, and the config also uses `open: "on-failure"` for direct runs. The CLI reporter selection overrides config HTML options, so both are aligned. A failed run hosts its report on localhost:9323 for inspection through your existing VPS port forwarding. Press Ctrl+C after inspection to stop report hosting and allow runner cleanup; exit 130 can reflect this interruption. Successful runs finish normally. Reports remain saved in the run directory for later viewing as the test account.

The user returned Step 2 evidence from run.Gl9Onp: Go 120 passed, 0 failed, 0 skipped; Newman passed (individual totals not supplied); Playwright baseline passed and the signing-profile test failed at the first narrow-viewport visibility check. Storage cleanup deleted 12 journaled objects and database cleanup dropped `ams_e2e_20261003162429`. Exit status 130 reflects Ctrl+C used to stop automatic HTML report serving. The spec now closes the responsive navigation drawer before checking visible Account controls and overflow. The user then returned run.3JTPvP: both focused Playwright tests passed in 23.1 seconds, Go/Newman intentionally not rerun, 3 journaled objects deleted, database `ams_e2e_20261003165719` dropped, and exit 0. This completes Step 2 and permits preparation of Step 3. The user requires future work to remain uncommitted and unpushed for review; Codex supplies a suggested commit message and does not synchronize unreviewed changes to the VPS.

The exit summary reports each layer and database/storage cleanup separately. Go JSON events and `go-summary.txt` expose passed/failed/skipped cases, including named skips. Newman CLI summaries are retained per collection; `--bail failure` stops at the first failed prerequisite/assertion. Playwright retains list/HTML/JSON results plus its configured failure traces/screenshots. Share `summary.txt`, `go-summary.txt`, Newman totals, Playwright totals, and the first failure/trace. Do not send `cleanup.env`: it contains the isolated database connection string. Reports/traces can include session data; inspect before sharing.

Only recorded keys under the run prefix are deleted. Cleanup validates the entire journal before any deletion and never lists or purges the bucket. The journal survives database resets and failed/uncertain uploads, and remains available for repeated cleanup. `KEEP_DB=1` retains database metadata but still cleans test storage. A forced kill or host outage cannot run an EXIT trap; use the retained journal for cleanup retry:

```bash
# Replace the example with the exact absolute run directory printed by the runner.
run_dir=/absolute/path/to/asset-management-system/.vps-test-run/run.EXAMPLE
set -a
source "$run_dir/cleanup.env"
set +a
(cd ams-server && "$run_dir/test-storage-cleanup")
```

New storage paths introduced by later slices must journal their test-owned objects through the same scoped storage boundary before uploading. Do not infer ownership from current database rows or delete objects outside that journal.


## Step 4: stateless generated examination PDF preview

The original Step 4 template passed its automated VPS gate in run.xlboab and Codex visual review of the supplied PDFs. The user subsequently requested a smaller logo-to-header-line gap and then proportional upward movement of the title and body. Template v3 passed the focused VPS gate and the user approved the updated layout; Step 4 is complete. It adds synchronous gopdf previews to the generated signer panel: automatic equipment/component/test/IMCA/signing details, dates/validity, optional remarks and measurements, and a PMS-CE number ending XX. This is a preview-only slice; approval/number allocation and final publication follow in Step 5. Existing external upload behavior remains available.

The first VPS run, run.rftUWC, reported 145 Go passes, 1 failure, and no skips; Newman and Playwright did not run. Cleanup deleted 9 journaled storage objects and dropped ams_e2e_20261003212143; exit status was 1. TestGeneratedRenewalPreviewHTTPPDFTokenAndRoleBoundaries failed during fixture creation because VIEWER was inserted as users.role. VIEWER is a product_access role; the fixture now uses a valid USER, grants HR_ADMIN VIEWER access, and asserts both preview endpoints still reject that account with 403. Runtime authorization and the schema are unchanged. The next run below passed the corrected Go fixture.

The next VPS run, run.SROvan, passed all 146 Go tests with no failures/skips. Newman stopped at request 175 (Prepare stateless competent person PDF preview), returning 500; Playwright did not run. Cleanup deleted 19 journaled objects and dropped ams_e2e_20261003213257; exit 1. The retained API log reported "16-bit depth not supported": JPEG decoding followed by direct PNG encoding preserved a color model that generated 16-bit PNGs. Upload normalization now explicitly produces 8-bit PNGs; existing 16-bit signature versions convert only in rendering memory after stored-byte integrity verification, with no R2 overwrite or new version. Current compatible PNGs avoid re-encoding during rendering. Dimensions, bounded decoding, and alpha are preserved. Go adds bit-depth/legacy/transparency/bounds coverage and uses JPEGs in the real preview HTTP test; Newman and Playwright assert saved JPEG replacements are 8-bit for both account and competent-person profiles before PDF creation. Collection/browser counts stay 234 requests and 3 journeys. No runner or shared regression-file changes are needed for this correction. The corrected live three-layer gate and PDF visual review are pending; rerun the command below after reviewing and publishing the changes yourself.

Static verification of the bit-depth correction passed: backend build, compile-only package/integration test binaries, Go vet, strict focused Playwright spec typechecking and discovery of 3 tests, collection SDK/JSON validation and syntax checks of all 237 embedded scripts, Bash runner syntax, and diff whitespace. Test bodies, PDF rendering, R2 operations, and live suites remain user-run.

Latest user-run evidence, received 4 October 2026: run.xlboab passed 148 Go tests with 0 failures and 0 skips; Newman passed; Playwright passed. Cleanup deleted 28 journaled storage objects and dropped ams_e2e_20261003215237; exit status 0. This verifies the role-fixture and signature bit-depth corrections across the selected automated layers. Detailed Newman/Playwright counts and timings were not included in the returned summary. No automated rerun is needed solely to record this result. On 4 October 2026, Codex visually reviewed every page of the ordinary/long PDFs supplied by the user and verified the approved layout. The original rendering was verified, then the user requested the header-line spacing refinement described below. At that gate Step 5 had not started; its current delivery status follows below.

The signed snapshot token lasts 30 minutes and is bound to the issuing account and certificate with a preview-specific purpose, issuer, audience, algorithm, and derived key separate from authentication. Current source content, certificate version, signer eligibility, and signature are checked on validation; stale review returns 409 and expiry 410. Preparing, validating, editing, canceling, reloading, or navigating away creates no DB/R2 draft, renewal, history row, or number reservation. Preview/token/PDF Blob URL remain only in the mounted component's memory; discard revokes the URL and cancels pending responses. Expiry retains typed form details for a new preview.

Header refinement requested 4 October 2026 after reviewing the actual PDFs: place the header line 10 points below the logo instead of approximately 34, on every page; retain logo size/top position and title/body/footer positions. TemplateVersion is now pms-examination-a4-v2. Signed v1 previews are rejected and must be refreshed so a later issued document cannot silently use a different layout from its reviewed preview. Go covers both cryptographic and HTTP rejection of a genuine old-template token; Newman and Playwright assert v2 snapshots for fresh previews. Existing PDF pagination/Unicode/signature cases remain applicable. The runner, shared Go setup, API smoke, and whole-app specs need no changes because fixtures, routes, and cleanup remain compatible. Counts remain 234 Newman requests and 3 browser journeys. Rerun the focused three-layer command below and review the new ordinary/long PDF attachments. The old run.xlboab pass does not verify this refinement.

Header-refinement static checks passed: backend build, compile-only package/integration test binaries, strict focused-spec typechecking, discovery of 3 browser tests, JSON/collection SDK validation and syntax checks of 237 scripts, Bash runner syntax, and diff whitespace. No live suites or gopdf generation were executed by Codex.

Follow-up layout refinement, 4 October 2026: the user supplied examination-preview1.pdf (1 A4 page) and examination-preview-long1.pdf (3 A4 pages), confirming the header-line fix but noting the title and body still needed to move up. Read-only Poppler/pdfplumber inspection confirmed a 10-point logo-to-line gap but the title remained at its old fixed position. Template pms-examination-a4-v3 now places the title relative to the line (+16 points), number relative to the title (+32), and body relative to the number (+27 plus wrapped-number lines), moving the content upward about 24.3 points/8.6 mm on every page while preserving its internal spacing. The footer stays at the bottom, and the signer-fit limit uses the actual body start. Go rejects genuine signed v1/v2 previews; Newman/Playwright check fresh v3 snapshots. All existing PDF pagination, signature, and Unicode cases remain applicable. No runner/shared-suite changes are needed; 234 Newman requests and 3 browser journeys remain registered. No new automated summary/run ID was supplied with the v2 PDFs. Latest user-run evidence, received 4 October 2026: run.x5jllI passed 150 Go tests with 0 failures and 0 skips; Newman passed; Playwright passed. Storage cleanup deleted 28 journaled objects and database cleanup dropped ams_e2e_20261004090226; exit status 0. The user confirmed the updated PDF layout is satisfactory. This completes Step 4, including template pms-examination-a4-v3 automated verification and user layout approval. Detailed Newman/Playwright counts and timings were not supplied. That completed gate authorized Step 5; its current delivery status follows below. No additional suite run is required solely to record this evidence. Changes remain uncommitted and unpushed for the user to review. The command below remains available for future focused reruns.

Proportional-layout static checks passed: backend build, compile-only package/integration test binaries, strict focused-spec typechecking, discovery of 3 browser tests, JSON/collection SDK validation and syntax checks of 237 scripts, Bash runner syntax, and diff whitespace. The user subsequently verified the live suites and approved the v3 layout in run.x5jllI; Codex did not execute live suites.

Dedicated coverage:

- ams-server/generated_renewal_certificates_integration_test.go adds two preview integration tests covering source/race/eligibility changes, no DB or storage writes, injected renderer/read failures, real private signature retrieval, HTTP PDF output, auth/role/account/certificate/expiry boundaries, invalid dates/text, ordinary-admin identity, and non-expiring tests.
- ams-server/certificateissuance/preview_test.go covers cryptographic token validation and auth-token isolation, calendar/number formatting, Unicode maps, transparency, ordinary and long pagination, missing glyphs, and cancellation.
- api/generated-renewal-certificates.postman_collection.json now contains 234 requests, including 40 added preview/security/no-side-effect/non-expiring checks. Real expired server-signed tokens are exercised by Go's HTTP test; Newman does not receive the signing secret.
- e2e/generated-renewal-certificates.spec.ts still contains 3 maintained real-stack journeys, expanded with SUPER_ADMIN and own-ADMIN preview creation, PDF bytes/attachments, dates, editing, refresh/cancel/revoke, reload, browser-clock expiry, responsive widths, long pagination, unchanged current certificate/history, and invalid form controls. Clock acceleration checks UI expiry separately from Go's server-side expiry checks.

The runner adds AMS_CERTIFICATE_PREVIEW_EVIDENCE_DIR for Go to save ordinary/long PDF examples under the private run directory. Registration, signature storage journal cleanup, and automatic on-failure HTML report hosting already cover this step. No additional migration or server/font runtime is needed; assets are embedded and gopdf is pinned to v0.38.1. SQLC was regenerated for the joined preview-source query. Shared integration_regression_test.go, system-api-smoke.postman_collection.json, and whole-app-regression.spec.ts need no changes: their existing contracts remain compatible and the dedicated files cover this new behavior.

After reviewing, committing, and pushing locally yourself, update the exact certgen change in the VPS test checkout. Run as ams_test_runner:

```bash
cd /home/pms/ams-testing/asset-management-system
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' \
E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

Expected collection requests: 234; browser tests: 3. Return Go pass/fail/skip counts, Newman counts, browser results, cleanup, run ID, and PDF feedback. Storage-dependent skips do not satisfy the gate. After a failed browser run, inspect the hosted report and press Ctrl+C to allow cleanup. To inspect a successful run's PDF attachments, use the retained report as the test account:

```bash
cd /home/pms/ams-testing/asset-management-system/ams-frontend-cloudscape
# Replace run.YOUR_RUN_ID with the directory printed by the runner.
npx playwright show-report /home/pms/ams-testing/asset-management-system/.vps-test-run/run.YOUR_RUN_ID/playwright-report
```

The Go examples are retained in that run directory as pdf-previews/examination-preview.pdf and pdf-previews/examination-preview-long.pdf. Playwright attaches ordinary/long examples to its HTML report. Inspect the actual gopdf output: small upper-left logo; centered CERTIFICATE OF EXAMINATION below the header; complete PMS-CE number ending XX; correct equipment/component/serial/location/validity; test description and IMCA references; no printed equipment/component ID, manufacturer/model, issuing authority, or signer category; optional section omission/line breaks; issue date repeated beside the signer; proportional transparent signature; company/website/page footer; readable Unicode; and long-text continuation without clipping, with the signer block kept together. Ordinary short content should fit one A4 page. The bundled Noto Sans supports Latin, Greek, and Cyrillic; missing glyphs cause an explicit error. Additional scripts require deliberate font/shaping support and are not claimed as covered.

Local frontend/backend builds, compile-only Go test checks, strict Playwright spec typechecking, discovery of 3 tests, collection/embedded-script syntax validation, Bash syntax, and diff whitespace checks passed. Codex has not executed live suites, services, gopdf certificate generation, or R2 calls; the automated live passes come from the user's run.xlboab and run.x5jllI evidence above. Codex leaves evidence-documentation updates uncommitted and unpushed. The supplied v1 ordinary/long PDFs were visually inspected against the approved layout, and the user then requested the header-line spacing refinement. Template v3 automated verification and user layout approval passed in run.x5jllI; no latency measurement is inferred from automated success.

## Step 5: approved generated issuance

Prepared on 4 October 2026 on certgen. **Live VPS gate pending**; the earlier run.x5jllI verifies Step 4 only. Changes remain uncommitted and unpushed for the user's review. Approval confirmation now reserves one component/issue-date sequence and immutable snapshot, synchronously renders/stores/verifies the PDF, then atomically publishes the current certificate's file, dates, and status. The final number uses PMS-CE-yymmdd-componentDisplayID-initials-nn, padded to at least two sequence digits. Certificate detail adds paginated issuance history and private links to completed documents. No PDF layout change is included.

Duplicate confirmation returns the same approval/number. Concurrent processing returns saved status; the UI checks it without creating another approval. Failed work keeps its number and preserves the current certificate. An existing approval can resume using its original signed identity after preview expiry, but an expired, previously unapproved preview cannot reserve a number. Stored-document retries reuse verified bytes at the stable key; conditional object creation prevents overwrite. A certificate update version fence and issuer permission recheck protect publication against stale work and role changes.

Implementation-specific coverage:

- ams-server/generated_renewal_certificates_integration_test.go adds eight Step 5 top-level tests with additional permission-change subcases: duplicate approval and concurrent component/date allocation; stale/expired approval; render/read/write/lost-ack/publication failures; atomic rollback and update fencing; stored integrity and processing leases; strict HTTP/role/certificate boundaries; real R2 PDF retrieval and conditional-write protection; immutable history and old signature versions; and non-expiring issuance. certificateissuance/preview_test.go covers persisted-approval token identity validation.
- api/generated-renewal-certificates.postman_collection.json now has **270 requests**, including 36 added issuance/history requests. They exercise SUPER_ADMIN and own-ADMIN final approval, duplicate responses, unauthorized/input/token/certificate boundaries, exact reviewed snapshots, current dates/file, real PDF bytes and hashes, saved history, signer replacement, later issuance, and no-expiry publication.
- e2e/generated-renewal-certificates.spec.ts still has **3 journeys**. The managed-signers journey now verifies confirmation cancellation, both admin types issuing and fetching final PDFs, current dates/history, mobile widths, opening the document from the UI, persisted history after reload, and old-document preservation after signature replacement. Its complete journey timeout is 180 seconds; action assertion timeouts were not increased. Browser clock acceleration is reset before real approval.
- Shared integration_regression_test.go resets certificate_issuances and certificate_number_counters. system-api-smoke.postman_collection.json and whole-app-regression.spec.ts need no change because their contracts remain compatible and focused files cover the added behavior.

Migration 000052 adds approvals/counters, immutable content constraints, processing leases, and the certificate renewal_version trigger. SQLC was regenerated. The runner needs no change: it already applies new migrations, discovers Go tests, registers these feature files, journals scoped R2 keys, retains evidence, automatically hosts a failed Playwright report, and cleans up storage/database/processes. Use the existing bucket/configuration. Recovery-by-ID/abandonment controls belong to Step 7; combined external/Legacy history belongs to Step 6.

Static checks passed: Go formatting/build, compile-only main/package tests, vet; frontend production build/typechecking and focused lint; strict feature-spec typechecking and discovery of three Playwright tests; collection JSON/SDK validation and syntax checks of 273 embedded scripts; Bash runner syntax and diff whitespace. These do not count as live test passes, PDF rendering, R2 verification, or latency measurements.

After reviewing, committing and pushing yourself, synchronize that exact certgen revision to the Fedora checkout. Run as ams_test_runner with the existing isolated database credentials:

```bash
cd /home/pms/ams-testing/asset-management-system
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' bash tests/regression/run-vps-isolated-tests.sh
```

Expected focused requests: **270**. Expected browser journeys: **3**. Return Go pass/fail/skip counts, Newman/Playwright summaries, cleanup, exit status, run ID, and PDF feedback. A storage-backed skip does not satisfy this gate. On browser failure the report should host automatically; inspect it, then press Ctrl+C to finish cleanup.

The Go test retains pdf-previews/approved-examination-preview.pdf and pdf-previews/issued-examination.pdf under the printed run directory. Playwright report attachments include approved-own-examination-preview.pdf / issued-own-examination.pdf and approved-competent-examination-preview.pdf / issued-competent-examination.pdf, alongside the earlier ordinary/long examples. View a successful report as ams_test_runner using the installed project binary; replace run.YOUR_RUN_ID:

```bash
/home/pms/ams-testing/asset-management-system/ams-frontend-cloudscape/node_modules/.bin/playwright show-report /home/pms/ams-testing/asset-management-system/.vps-test-run/run.YOUR_RUN_ID/playwright-report --host 127.0.0.1 --port 9323
```

Compare preview/final pairs. The intended content difference is XX becoming the allocated sequence; the approved v3 layout, signer/signature, dates/validity, equipment/component/test/IMCA details and optional text must remain consistent. Verify the current certificate changes only after completion and the older PDF remains available after another issuance or signature edit. No Step 6 work should begin until all selected layers, cleanup and PDF feedback pass.

Suggested commit message: feat(certificates): approve and publish generated renewals.
