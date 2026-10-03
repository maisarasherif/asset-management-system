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

The focused Go file `ams-server/generated_renewal_certificates_integration_test.go`, Newman collection `api/generated-renewal-certificates.postman_collection.json`, and Playwright spec `e2e/generated-renewal-certificates.spec.ts` verify the existing external renewal workflow and own ADMIN signing profiles. They contain implemented checks, not placeholders for future generated endpoints. All are included in the maintained broader run. The baseline preserves historical documents, checks automatic validity dates, and downloads persisted R2 document bytes after reload.

Step 1 passed on the user's Fedora VPS on 3 October 2026: run.BQqdIV recorded 106 Go passes, no failures/skips, Newman passed, and 6 journaled objects deleted; the spec-loading fix was verified by run.BfIKDk with all 5 Playwright tests passed, 1 journaled object deleted, and the disposable database dropped. The second run selected Playwright only. Newman request/assertion totals from the first run were not supplied.

Step 2 adds 47 signing-profile requests to the collection (73 requests total), a second real-stack Playwright test, image-normalization tests in `ams-server/certificateissuance/signature_image_test.go`, and scoped storage/read tests in `ams-server/utils/object_storage_test.go`. Coverage includes organization persistence, account-derived identity, private owner-only image access, PNG/JPEG normalization, retained earlier images, oversized/invalid images, ownership/category bypasses, role/status changes, controlled storage/publication failures, and overlapping uploads. Playwright also checks the Account form at 320, 768, 1024, and 1440 pixels. These live Step 2 checks remain pending until the user returns results.

Use the configured test OS account rather than running the script as root. On the current Fedora VPS the PostgreSQL role `ams_test_runner` uses Unix-socket peer authentication and requires the matching OS account. The test checkout is `/home/pms/ams-testing/asset-management-system`; synchronizing Git changes as `pms` and running the script as `ams_test_runner` are separate operations.

```bash
# Run in an ams_test_runner shell after synchronizing certgen.
cd /home/pms/ams-testing/asset-management-system
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' \
E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

No runner change is required for Step 2: its existing default collection/spec registration and Go discovery include the added cases; committed PNG/JPEG fixtures and the generated oversize certificate fixture supply uploads; signature writes use the established scoped journal. Earlier signature objects remain readable until run cleanup, even if database rows are reset or source users are deleted.

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
