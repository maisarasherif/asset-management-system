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
| `E2E_PROFILE` | `default` | `certificates-final` selects 11 related browser specs unless explicit `E2E_SPECS` overrides it. |

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

### Step 8 final certificate regression and timing evidence

Prepared 4 October 2026 on `certgen`. Step 7 remains verified across run.2zwEuQ (192 Go passes, no failures/skips; Newman passed) and run.Xnlhcs (four dedicated browser journeys passed). **Step 8 implementation and verification are complete. run.yNbzjh passed 194 Go tests (0 failures/skips), Newman, all four dedicated Playwright journeys and both cleanup gates after the empty-heading correction. The corrected long PDF has been rendered and inspected successfully. Broader browser coverage retains combined passing evidence across the earlier runs.** The latest evidence entries below combine run.47x15g, the subsequent 17-of-18 browser profile, the corrected HR/Admin rerun run.VEpZ2d and supplemental run.5mSUXv. This is combined evidence, not a claimed single all-green run.

Recovery and abandonment from issuance history now invalidate the preview panel's saved-approval status. Failed approvals remain observable without continuous polling. A completed or abandoned approval clears its previous PDF review, confirmation and failure message; abandonment displays its retained number and terminal state. Go adds an HTTP status-contract case for recovered/abandoned records, Newman adds two status requests, and Playwright exercises both transitions without reloading the certificate page. No PDF template, schema, numbering or permission changes were made.

Dedicated files updated:

- `ams-server/generated_renewal_certificates_integration_test.go`
- `tests/regression/api/generated-renewal-certificates.postman_collection.json` (400 requests after the final empty-heading correction)
- `tests/regression/e2e/generated-renewal-certificates.spec.ts` (four journeys discovered)

The runner now offers `E2E_PROFILE=certificates-final`. It selects these 11 maintained specs: `whole-app-regression`, `hr-admin-product`, `generated-renewal-certificates`, `client-asset-certificates`, `single-asset-equipment`, `routine-maintenance`, `template-catalog`, `user-management-permissions`, `scheduler-management`, `auth-cookie-session`, and `api-auth-smoke`. Static discovery lists **18 tests**, including four dedicated certificate journeys and the supplemental session-expiry mock. The profile supplies the existing isolated credentials, client/maintenance trigger flags and guarded issuance fault secret. These specs supplement certificate coverage with related catalog, asset, access, notification and product workflows. The broader profile is opt-in because normal implementation runs intentionally use smaller selections; it is required for final certificate verification.

After reviewing/committing/pushing and synchronizing the changes yourself, run **as `ams_test_runner`, without sudo, from `/home/pms/ams-testing/asset-management-system`**:

```bash
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
NEWMAN_COLLECTIONS='' E2E_SPECS='' E2E_PROFILE=certificates-final \
bash tests/regression/run-vps-isolated-tests.sh
```

Empty overrides restore the maintained seven-collection selection and the profile's 11 specs, even if previous focused selections were exported. Explicit nonempty `E2E_SPECS` overrides the profile. Go still requires `RUN_GO_REGRESSION=1` and discovers all backend package tests. The existing shared Go harness/reset, system API smoke and whole-app spec were reviewed and need no edits for this UI cache/status change; the dedicated files cover it, while the final run executes the shared baselines. SQLC regeneration is unnecessary because SQL did not change. Report hosting on failure and scoped R2/database cleanup remain enabled.

Then rerun the **three changed supplemental CertificateDetailPage mock cases** from Step 6 as a separate gate. The full mock suite includes unrelated pages; these three relevant cases are selected explicitly and supplement the real stack:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
E2E_SPECS='../tests/regression/e2e/refactored-pages-mocked.spec.ts --grep CertificateDetailPage' \
bash tests/regression/run-vps-isolated-tests.sh
```

Both runs must finish their selected gates and cleanup successfully. Report actual Go pass/fail/skip counts, each Newman collection's assertions/failures, browser results, storage deletion/database cleanup and exit status, plus both run evidence paths. A storage-backed skip does not satisfy certificate verification. On failure, inspect the automatically hosted report, then Ctrl+C to allow cleanup; exit 130 from report interruption does not mean the tests passed.

The dedicated collection records compact successful request timings in its existing Newman log. The browser spec attaches `certificate-request-timings.json` and retains per-test JSON in `certificate-timings/`. After selected suites pass, `support/certificate-latency-summary.py` prints and writes **`certificate-latency-summary.json`** under that run's evidence directory. It groups Newman/browser measurements by preview, generated issuance, external renewal and retry, reporting count, minimum, nearest-rank p50/p95 and maximum milliseconds. The layers use Newman response time and Playwright request-to-response-end duration respectively; these are different observations and remain separate. Only HTTP 200 previews and completed publication/retry responses count. Controlled fault requests, errors and pending work are excluded; repeated idempotent successful requests remain included, so retry timings include both recovery and completed retries. No credentials, tokens, URLs or document IDs enter these timing artifacts.

Return the printed timing table or summary JSON from the successful final run. Missing operation samples require investigation before declaring the timing evidence complete. Small functional-test samples describe this VPS/R2 run; they are not a load benchmark or an SLA, and there is no arbitrary latency pass/fail threshold. On failed runs, raw browser timing attachments and Newman log lines remain available; the combined summary may not have been produced yet. These measurements add no production instrumentation or extra application requests.

Finally, review report PDF attachments for both own ADMIN and competent-person issuance, matching approved previews, long text/pagination and recovered stored documents. Confirm the approved layout, signature proportions, Unicode, dates/validity and footer; the final issued document changes the `XX` placeholder to its allocated number. Existing dedicated tests recheck snapshots and stored bytes after source/signature edits and exclude other identities from ordinary ADMIN issuance. Return any remaining visual issue before feature sign-off.

Static verification passed: frontend TypeScript/Vite build, Go compile-only test binary/vet, strict dedicated-spec TypeScript, Playwright discovery, Postman SDK/JSON/script syntax, Python/Bash syntax and diff whitespace. No live suites or servers were run by Codex; changes remain uncommitted/unpushed. Suggested commit: `fix(certificates): synchronize recovery state and prepare final regression`.

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

Prepared on 4 October 2026 on certgen. **Step 5 is verified** across the first run's 161 Go passes, run.fTsdAI's Newman/Playwright passes, and Codex's review of all six supplied PDF attachments on 4 October. The earlier run.x5jllI verifies Step 4 only. Codex leaves its changes uncommitted and unpushed for the user's review. Approval confirmation now reserves one component/issue-date sequence and immutable snapshot, synchronously renders/stores/verifies the PDF, then atomically publishes the current certificate's file, dates, and status. The final number uses PMS-CE-yymmdd-componentDisplayID-initials-nn, padded to at least two sequence digits. Certificate detail adds paginated issuance history and private links to completed documents. No PDF layout change is included.

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

### Step 5 first VPS gate and anonymous-request correction

User results received 4 October 2026: **161 Go passes, 0 failures, 0 skips**. Newman stopped at request 228 with one failed assertion: Anonymous cannot approve another account review expected 401 but received 403. Playwright did not run. Storage cleanup deleted 24 journaled objects; database ams_e2e_20261004100656 was dropped; exit status 1. No run directory identifier was supplied.

The three new anonymous approval/history/document cases used noauth without disabling cookies. Newman can therefore send a cookie from a preceding login; the server correctly reads it as authentication. Each now sets protocolProfileBehavior.disableCookies=true, matching the existing anonymous cases, and keeps its strict 401 assertion. Local JSON/SDK and script-syntax checks plus a structural check of all anonymous requests verify the fixture correction; live confirmation remains pending. The collection still contains 270 requests. This changes the Newman fixture only; dedicated Go and Playwright files and shared regression suites need no changes. The runner remains compatible and automatic failed-report hosting stays enabled.

After reviewing and synchronizing this correction, rerun the two unverified layers as ams_test_runner. The successful Go result can be retained because backend and Go test sources are unchanged:

```bash
cd /home/pms/ams-testing/asset-management-system
RUN_GO_REGRESSION=0 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' bash tests/regression/run-vps-isolated-tests.sh
```

Return the Newman/Playwright summaries, cleanup, exit status and run ID, plus feedback on the preview/final PDF pairs. Step 5 remains incomplete until these checks pass. Suggested correction commit: test(certificates): isolate anonymous issuance requests from login cookies.

### Step 5 automated gate passed — PDF review pending

Follow-up user evidence received 4 October 2026: **run.fTsdAI passed Newman and Playwright**. Go was intentionally not run because only the Newman fixture changed; retain the earlier **161 Go passes, 0 failures/skips**. Storage cleanup deleted 25 journaled objects; database ams_e2e_20261004103418 was dropped; exit status 0. The combined results satisfy all three automated layers and confirm the anonymous-request correction. Detailed Newman/Playwright counts and timings were not included in the supplied summary. Codex did not execute live suites. No additional run is required solely to record this evidence; remaining Step 5 work is preview/final PDF feedback. Step 6 has not started.

Inspect this successful run's report as ams_test_runner:

```bash
/home/pms/ams-testing/asset-management-system/ams-frontend-cloudscape/node_modules/.bin/playwright show-report /home/pms/ams-testing/asset-management-system/.vps-test-run/run.fTsdAI/playwright-report --host 127.0.0.1 --port 9323
```

The Playwright report contains both own-ADMIN and competent-person preview/final PDF pairs. Check the allocated sequence replacing XX and consistent approved content/signatures/layout. Go did not run in run.fTsdAI, so Go-generated PDF examples belong to the earlier run directory rather than this one.

### Step 5 PDF review completed

On 4 October 2026 the user supplied approved-own-examination-preview.pdf, issued-own-examination.pdf, approved-competent-examination-preview.pdf, issued-competent-examination.pdf, examination-preview.pdf and examination-preview-long.pdf from run.fTsdAI. Codex used read-only Poppler rendering and text/image extraction, visually inspecting all eight pages. Both preview/final pairs match except their document-number line: PMS-CE-261004-002-MS1-XX becomes -01 for own ADMIN and -02 for the competent person. Pixel differences are confined to that line, and embedded logo/signature streams and positions are identical within each pair. Signer identity, dates/validity, automatic details, optional text, Unicode and footer remain consistent.

All short documents fit one A4 page. The long preview preserves all 60 observation lines across three A4 pages, with correct page numbering and the signer block together on page 3. No clipping or overlap was observed. One non-blocking cosmetic detail carried from the approved template remains: page 3 repeats REMARKS (continued) without further remarks, followed by measurements and signer details. No renderer/PDF/source/test changes were made or live suites rerun. Combined with the documented automated evidence, this verifies Step 5; Step 6 is ready but not started. Documentation updates remain uncommitted and unpushed for the user.

## Atomic external renewal and combined history (Step 6)

Prepared 4 October 2026 on `certgen`; **Step 6 verified across run.u2Zttq, run.6TdGBM and run.qzL6y5, including all three supplemental mocked cases**. Step 5 remains verified. Certificate detail defaults to generation and offers Upload external document. External renewal sends file, dates and eligible competent person in one request, saves immutable approval details, verifies original private R2 bytes, then atomically publishes file/dates/status and history. Both ADMIN and SUPER_ADMIN retain existing upload permissions; no saved competent-person signature is required. PDF/JPEG/PNG/WEBP up to 10 MiB are preserved without rewriting or PMS numbering. Non-expiring tests omit expiry; renewable expiry must be strictly after issue.

Migration 000053 adds original file metadata and links external audit to issuance. Combined paginated history shows generated/external/Legacy records once, opens original stored documents and reports legacy dates/signer details as unrecorded. Duplicate approval uses its original identity/object; failed, stale or permission-revoked publication preserves the current certificate. The compatibility file-only endpoint now publishes file/audit together and remains Legacy because it lacks a complete renewal snapshot. Recovery/abandonment controls remain Step 7. The approved PDF renderer/layout is unchanged.

Dedicated coverage: `ams-server/generated_renewal_certificates_integration_test.go` adds five top-level tests plus fault subcases for storage/rollback/integrity/concurrency, input and exact size boundaries, all four formats, private R2 access, non-expiring publication, role gates and combined historical snapshots/bytes. `tests/regression/api/generated-renewal-certificates.postman_collection.json` now has **335 requests** (65 new external/history requests) and **338 embedded scripts**. `tests/regression/e2e/generated-renewal-certificates.spec.ts` retains **three real-stack journeys**, expanded for the generated/upload chooser, one-request renewal with no date PATCH, legacy/history popup access, original bytes, unsigned competent-person Admin upload, non-expiring certificates and widths 320/768/1024/1440. Three existing CertificateDetailPage cases and contracts in `refactored-pages-mocked.spec.ts` are also updated.

Passed static checks: SQLC, Go formatting/build/vet and compile-only integration binary; frontend typecheck/build/focused lint; strict feature-spec typecheck/discovery; collection JSON/SDK validity and script syntax; Bash syntax and diff whitespace. These static checks do not execute test bodies/services, render certificates or call R2; user-run VPS outcomes are recorded below. Shared Go reset, system API smoke and whole-app navigation files were reviewed and need no edits: no new tables require reset, existing routes remain compatible, and dedicated tests cover the added behavior. The isolated runner needs no change: suite/migration discovery, oversized fixture generation, scoped storage journaling/cleanup and automatic failed-report hosting already cover this step. The new WEBP fixture is a test input.

Review, commit and push yourself, then synchronize that exact `certgen` revision to Fedora. Run as `ams_test_runner`:

```bash
cd /home/pms/ams-testing/asset-management-system
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' bash tests/regression/run-vps-isolated-tests.sh
```

An additional full strict TypeScript check of the optional mocked-pages spec reports five pre-existing fixture type errors (TS2322/TS2339). The same five errors occur on HEAD; this change introduces no new diagnostics. The dedicated feature spec passes strict checking, and both specs pass Playwright discovery. The mocked runtime gate remains pending on Fedora.

Run the three changed mocked cases as a supplemental gate; the rest of that suite remains opt-in:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 E2E_SPECS='../tests/regression/e2e/refactored-pages-mocked.spec.ts --grep CertificateDetailPage' bash tests/regression/run-vps-isolated-tests.sh
```

Return actual Go pass/fail/skip counts, Newman and Playwright summaries, cleanup, exit status and run IDs. Check generation/upload switching and history labels. On browser failure, inspect the automatically hosted report and Ctrl+C to finish cleanup. No fresh PDF layout approval is needed for this unchanged renderer. Step 7 waits for successful Step 6 verification. Suggested commit: `feat(certificates): renew external documents atomically and unify history`.

### Step 6 first VPS result and PDF popup assertion correction

Evidence received 4 October 2026 from run.u2Zttq: **170 Go passes, 0 failures/skips; Newman passed; Playwright 2 passed, 1 failed (1.6m)**. Generated issuance and own ADMIN signing-profile journeys passed. The external journey timed out waiting for a history PDF popup URL to leave about:blank, while the Playwright log showed navigation to the expected private R2 external object. Its earlier external document retrieval had already returned the original PDF bytes. Legacy popup, responsive checks and ordinary ADMIN non-expiring upload later in that journey were not reached; those paths are not yet verified by this run. Cleanup deleted 55 journaled objects and dropped ams_e2e_20261004145535. Exit 130 followed the user's Ctrl+C to stop the hosted report, rather than a cleanup failure. Detailed Newman counts were not supplied.

The failure is consistent with headless PDF viewer navigation, so the dedicated Playwright fixture now follows the passing generated-document journey: register a browser-context document-request listener before the history button click, match the exact expected object origin/path for each EXTERNAL and LEGACY history ID, and verify the actual requested signed URL returns status 200 and original PDF bytes. Signed query strings may differ between link requests; the object binding stays exact. The popup remains part of the interaction and is closed in finally. This corrects the assertion without depending on PDF viewer URL commitment or increasing the navigation timeout. The VPS rerun must confirm the diagnosis.

Strict feature-spec TypeScript checking, discovery of all three tests, Bash syntax and diff whitespace passed after the correction. No live suite was executed by Codex. Production behavior, dedicated Go/Newman tests, shared Go/API/whole-app baselines, optional mocked UI cases and the isolated runner need no edits for this browser-only fixture change. Automatic failed-report hosting remains enabled. Retain the successful Go/Newman evidence and rerun the focused Playwright journeys as ams_test_runner after reviewing, committing/pushing and synchronizing the correction yourself:

```bash
cd /home/pms/ams-testing/asset-management-system
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' bash tests/regression/run-vps-isolated-tests.sh
```

Step 6 verification and the supplemental mocked gate remain pending; Step 7 has not started. Changes remain uncommitted/unpushed. Suggested commit: `test(certificates): verify history PDF requests without waiting for viewer navigation`.

### Step 6 follow-up: mobile drawer visibility and report viewer

Evidence received 4 October 2026 from run.Y6Fzpj: Go/Newman were intentionally not rerun; Playwright reported **2 passed, 1 failed (1.5m)**. Both external and Legacy PDF history popup checks now passed, confirming the previous request/byte assertion correction. The external journey reached the first responsive-width check, where the file input was present but hidden. Cloudscape's initially open navigation becomes a mobile drawer and hides the main page. The generated issuance and Account journeys already close that drawer before responsive checks; the external journey now does the same and checks the Open primary navigation button before testing file/table visibility and horizontal overflow. The later responsive widths and ordinary ADMIN non-expiring UI upload still await a passing rerun. Cleanup deleted 13 journaled objects and dropped ams_e2e_20261004151553. Exit 130 followed Ctrl+C of the hosted report; both cleanups passed.

The user also reported a blank HTML report page and supplied `Electron sandboxed_renderer.bundle.js script failed to run`. This points to the Electron-based viewer; it does not establish a Playwright report-generation fault. The runner still hosts the HTML report on failure. Verify the same saved report in a separate desktop Chrome/Edge window using the actual Forwarded Address from VS Code's Ports panel. As ams_test_runner, from the Fedora repository root, reopen this run's report with the installed CLI (no npx package download):

```bash
./ams-frontend-cloudscape/node_modules/.bin/playwright show-report .vps-test-run/run.Y6Fzpj/playwright-report --host 127.0.0.1 --port 9323
```

Keep that command running while viewing the report; after Ctrl+C the saved report remains but its server stops. Chrome/Edge runs on the Windows workstation; no browser installation or desktop session is needed on Fedora. In the remote VS Code window, open the Ports panel, forward remote port 9323, copy its Forwarded Address, and paste it into a separate Windows browser window. SSH tunnels those HTTP requests to Fedora. A remote port may map to a different local port, so use the displayed Forwarded Address. VS Code remote SSH documentation describes this port mapping: https://code.visualstudio.com/docs/remote/ssh#_forwarding-a-port-creating-ssh-tunnel. If a separate browser remains blank, collect its Console/Network errors and verify the forwarded address reaches this report before changing reporter settings. External-browser confirmation is pending; report rendering is not claimed fixed.

After the mobile fixture correction, strict feature-spec TypeScript, discovery of three tests, runner Bash syntax and diff whitespace passed. No live suites were executed by Codex. No production feature/API changes were made, so the dedicated Go/Newman files, shared Go/API/whole-app baselines and optional mocked cases need no edits. The runner was reviewed and remains unchanged, preserving report hosting, scoped cleanup and the focused spec selection. Retain 170 Go passes (0 failures/skips) and the earlier Newman pass; rerun the focused Playwright command above with RUN_GO_REGRESSION=0 and RUN_NEWMAN=0 after reviewing and syncing the fixture correction. Step 6 verification, including the supplemental mocked gate, remains pending; Step 7 has not started. No commit/push was made. Suggested commit: `test(certificates): close mobile navigation before renewal layout checks`.

### Step 6 real-stack gate passed — run.6TdGBM

Evidence received 4 October 2026: **all three focused Playwright journeys passed in 1.5m**. External renewal/history passed in 18.8s, SUPER_ADMIN/generated and own ADMIN issuance in 52.9s, and own ADMIN signing-profile management in 14.2s. This verifies both browser-only corrections, including original-byte EXTERNAL/LEGACY popup access, all responsive widths and ordinary ADMIN non-expiring upload with an unsigned competent person. Storage cleanup deleted 14 journaled objects; database ams_e2e_20261004153217 was dropped; exit status 0.

Go/Newman were intentionally not rerun after the browser-only corrections. Retain the 170 Go passes (0 failures/skips) and Newman pass from run.u2Zttq. Together, these results satisfy the Step 6 dedicated Go/Newman/real-stack Playwright gate. Detailed Newman assertion counts were not supplied. No additional rerun of those layers is needed solely to record this evidence.

The three supplemental CertificateDetailPage mocked tests changed in Step 6 still have no reported runtime result; their opt-in command remains above. Do not count them as passed. The blank Electron-based report viewer remains unconfirmed in a separate Windows browser; this successful run confirms tests/report output and cleanup, not that the earlier viewer problem is resolved. Report-hosting settings are unchanged. Step 7 has not started. This evidence update changes only documentation; dedicated/shared tests and the runner need no further edits. No live tests were executed by Codex and no commit/push was made. Suggested documentation commit: `docs(certificates): record successful step 6 browser verification`.

### Step 6 supplemental mocked fixture correction — run.XQ9SKl

Evidence received 4 October 2026: all three CertificateDetailPage mocked tests failed in run.XQ9SKl before their feature interactions because the browser repeatedly navigated to /login. The oversize and upstream-413 cases each exhausted 120 seconds; the normal renewal journey could not find its certificate heading. The attached contexts show authentication checks and brief shell rendering rather than upload failures. Go/Newman were not run. Storage cleanup deleted 0 journaled objects; database ams_e2e_20261004154509 was dropped; cleanup passed. Exit 130 followed stopping the hosted report. The user confirmed the report viewer now works; no further report-hosting change is needed and the method was not specified.

The shared mock's 2099 session expiry is incompatible with the app's logout timer. At the reported run date, the computed expiry delay exceeds the signed 32-bit setTimeout limit and converts to a negative delay, consistent with immediate logout and repeated authentication. Each mock session now expires one hour after its setup. The mock now supplies GET /v1/platform/products with active AMS ADMIN access, matching the current authentication contract. Bootstrap waits for visible primary navigation and the requested pathname instead of allowing a transient absence of Checking authentication to signal readiness; valid workspace query normalization remains permitted. Logout remains unmocked so unexpected expiry still fails the fixture checks. Browser timer reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#maximum_delay_value.

The three certificate cases also use accessible date labels, await completed UI effects before inspecting request logs, verify the cleared file input separately from the retained historical filename, and select the renewed history row explicitly. The multipart mock preserves the uploaded filename. Oversize rejection still asserts no upload/date PATCH, the HTML 413 case still asserts friendly errors without raw proxy HTML, and successful renewal still asserts a single multipart approval with file/dates/competent person and no PATCH. These are fixture/assertion corrections; production certificate/auth code is unchanged.

Static validation: discovery lists all three supplemental tests; strict TypeScript baseline comparison reports the same five pre-existing unrelated fixture diagnostics (TS2322/TS2339) before and after, with no new diagnostics; runner Bash syntax and diff whitespace passed. No live suite was executed by Codex. Dedicated Go/Newman/real-stack feature tests and shared Go/API/whole-app baselines need no changes for this mock-only correction. The runner was reviewed and needs no edits: E2E_SPECS already selects these cases and report hosting/cleanup remain enabled. Retain the dedicated gate evidence of 170 Go passes (0 failures/skips), Newman pass and run.6TdGBM's 3 real-stack Playwright passes. The supplemental gate remains pending; Step 7 has not started.

After reviewing, committing/pushing and syncing the mock correction yourself, run as ams_test_runner from the Fedora repo root:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 E2E_SPECS='../tests/regression/e2e/refactored-pages-mocked.spec.ts --grep CertificateDetailPage' bash tests/regression/run-vps-isolated-tests.sh
```

Changes remain uncommitted/unpushed. Suggested commit: `test(certificates): repair mocked session setup and renewal assertions`.

### Step 6 verified — supplemental run.qzL6y5 passed

Evidence received 4 October 2026: all three supplemental CertificateDetailPage mocked tests passed in **15.7s**: oversize rejection 5.2s, friendly upstream HTML 413 handling 2.8s, and route/download/atomic renewal/history flow 4.7s. This verifies the shared authentication fixture and subsequent locator/upload/history corrections. Storage cleanup deleted 0 journaled objects (these mocked cases do not write R2 objects); database ams_e2e_20261004160948 was dropped; exit status 0. Go/Newman were intentionally not rerun for this fixture-only correction.

Combined Step 6 evidence: run.u2Zttq passed **170 Go tests, 0 failures/skips**, and Newman; run.6TdGBM passed all three dedicated real-stack Playwright journeys; run.qzL6y5 passed all three changed supplemental mocked cases. **Step 6 implementation and verification are complete.** Detailed Newman assertion counts were not supplied. The user also confirmed the report viewer works. All relevant cleanup gates passed; no more Step 6 reruns are required solely to record these results.

Step 7 is ready but has not started; Steps 7 and 8 remain. This update changes only evidence/status documentation. Dedicated/shared Go/Newman/Playwright files and the runner need no edits, and no live suites were executed by Codex. Automatic failed-report hosting remains enabled. Changes remain uncommitted/unpushed. Suggested documentation commit: `docs(certificates): mark step 6 verified after VPS regression gates`.

### Step 7 recovery and abandonment — verified

Prepared 4 October 2026 on `certgen`; **Step 7 is verified across run.2zwEuQ and run.Xnlhcs**. Step 6's recorded gates remain valid. Step 8 remains and has not started; combined verification evidence is recorded below.

Certificate issuance history now offers **Retry issuance**, **Abandon approval** with explicit confirmation, and **Retry file deletion** when cleanup fails. ACTIVE ADMIN accounts manage their own approvals; SUPER_ADMIN may recover or abandon any approval. ADMIN retries of generated certificates retain the own-account signer restriction. USER, CLIENT and anonymous recovery requests are rejected. Active processing/cleanup leases prevent duplicate work; refresh history when a lease is still active. Stale approvals cannot replace a newer certificate and offer abandonment instead.

Retry uses the approved snapshot, signature version, document identity and reserved number without a preview token. Existing stored bytes are verified and reused without rendering or uploading another copy. Missing external bytes require the exact original file (digest and size verified); dates and signer edits are not accepted during recovery. Abandonment is terminal, leaves the current certificate unchanged, deletes only unissued files, and retains its audit record, number, object reference and immutable abandonment actor/time. Storage or cleanup acknowledgement failures remain recoverable. Completed/current documents, legacy upload references and historical signatures are protected. Expired writers that finish a PUT after abandonment requeue deletion; cleanup generation fencing prevents an older acknowledgement from clearing that obligation.

Migration `000054_certificate_issuance_recovery` adds cleanup failure/generation and abandonment audit fields and constraints; SQLC was regenerated. Recovery POST routes are `/certificate/:certificate_id/issuances/:issuance_id/retry`, `/abandon`, and `/cleanup`. History responses include current-user action flags. The isolated runner supplies a per-run fault secret to Newman and Playwright. Controlled render, before-write, lost-PUT-acknowledgement and deletion faults are accepted only with APP_ENV=test, a valid disposable ams_e2e_ database/storage scope and the correct secret; ordinary authorization remains enforced. Production requests cannot enable them. This adds no test routes and does not change R2 bucket configuration.

Dedicated coverage is delivered in:
- `ams-server/generated_renewal_certificates_integration_test.go`: 12 recovery cases covering rendering/storage failures, byte reuse, stale work, roles/ownership/scope, terminal idempotency, deletion/database failures, reserved-number retention, protected references, active leases and late-writer/cleanup races.
- `ams-server/controllers/generated_renewal_certificates_test.go`: isolated fault guard and history permission cases.
- `tests/regression/api/generated-renewal-certificates.postman_collection.json`: 59 recovery requests added to the self-contained collection; 394 total requests discovered statically.
- `tests/regression/e2e/generated-renewal-certificates.spec.ts`: a real-stack recovery journey added; 4 total journeys discovered. Browser fault injection continues actual HTTP requests with guarded test headers and does not mock server responses.

The runner, shared Go harness/reset, system API smoke, whole-app browser baseline and supplemental CertificateDetailPage mocked cases were reviewed. No reset change is needed because the migration extends an already reset table. Shared baselines need no edits for these additive recovery endpoints; the dedicated files cover the changed states. The feature collection/spec remain in the default broader run. The runner now passes only the guarded fault secret; automatic HTML hosting on failure and scoped storage/database cleanup remain unchanged. After a failed report has been inspected, Ctrl+C allows cleanup to run.

Static validation passed: Go build/vet, compile-only root/controller test binaries, SQLC generation, frontend TypeScript and Vite build, strict feature-spec TypeScript, Playwright discovery, Postman SDK/JSON request-body parsing and script syntax, Bash syntax and diff whitespace. **No test bodies, live stacks, Newman or Playwright executions were run by Codex.** Live migration, Go assertions, API/browser behavior and R2 cleanup require the VPS gate below. No commit, push or VPS synchronization was performed.

After reviewing, committing/pushing and updating the Fedora checkout yourself, run **as ams_test_runner from `/home/pms/ams-testing/asset-management-system`**, without sudo:

```bash
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' \
E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

Verify all Go/Newman/Playwright gates, storage cleanup, dropped isolated database and exit 0. Return actual pass/fail/skip counts, Newman assertions, four browser results and the printed run evidence path. Inspect the recovery PDF attachment and history actions. A storage-backed skip does not satisfy the gate. There is no new PDF layout change in Step 7.

Suggested commit: `feat(certificates): add approved issuance recovery and abandonment`

### Step 7 first VPS gate — shared signer fixture correction

The user supplied run.2zwEuQ on 4 October 2026: **192 Go tests passed, 0 failed/skipped; Newman passed; Playwright passed 3 of 4 journeys**. The new saved-approval recovery journey passed (40.7s), external renewal/history passed (18.5s), and own signing-profile coverage passed (13.0s). SUPER_ADMIN signer management failed because its unrestricted-certificate assertion expected only its two newly signed fixtures, while an additional active signed competent person from the earlier recovery journey remains in the shared disposable database. Competent profiles have no delete API and remain until database cleanup; unrestricted eligibility correctly spans all active, complete, signed people across active categories.

The focused Playwright spec now captures existing unrestricted signer IDs before saving this test's signing images. It verifies all five newly created unsigned fixtures are absent at that point, then expects exactly the baseline plus its eligible and other-category signed people. Restricted-certificate and own-ADMIN assertions remain exact. This fixes the shared-state assumption without relaxing inactive/unsigned/incomplete exclusions or changing production eligibility. Run all four journeys together on rerun, so the same fixture interaction is exercised.

Static checks passed: strict feature-spec TypeScript, discovery of all four journeys, runner Bash syntax and diff whitespace. No live suites were run by Codex. The dedicated Go/Newman files and shared Go/API/whole-app baselines were reviewed and need no changes for this browser assertion correction. The runner was reviewed and remains unchanged; feature selection, scoped cleanup and automatic failed-report hosting remain enabled. Cleanup in the supplied run deleted 69 journaled objects and dropped ams_e2e_20261004170552; exit 130 followed Ctrl+C stopping report hosting. Newman assertion totals were not supplied. Step 7 verification remains pending the browser rerun; retain the passed Go/Newman evidence.

After reviewing/publishing and updating the VPS checkout yourself, run as ams_test_runner from the Fedora repo root:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' bash tests/regression/run-vps-isolated-tests.sh
```

Changes remain uncommitted/unpushed. Suggested commit: `test(certificates): account for existing unrestricted signer fixtures`.

### Step 7 verified — run.Xnlhcs passed all four browser journeys

Evidence received 4 October 2026: run.Xnlhcs passed all four dedicated Playwright journeys in **2.2m**: saved-approval recovery 41.6s, external renewal/history 18.0s, SUPER_ADMIN signer management and own ADMIN issuance 56.3s, and own private signing profile 13.4s. This verifies the shared unrestricted-signer baseline correction with all four journeys running together. Storage cleanup deleted 23 journaled objects; isolated database ams_e2e_20261004173713 was dropped; exit status 0. Go/Newman were intentionally not rerun for the browser-only assertion correction.

Combined Step 7 evidence: run.2zwEuQ passed **192 Go tests, 0 failures/skips**, and Newman; run.Xnlhcs passed all four focused Playwright journeys and cleanup. Newman assertion totals were not supplied. **Step 7 implementation and verification are complete. Step 8 (final hardening and broader regression) remains and has not started.** No additional Step 7 rerun is required solely to record this evidence.

Only evidence/status documentation changed in this update. Dedicated Go/Newman/Playwright files, the shared regression baselines and the runner need no changes. Automatic failed-report hosting remains enabled. No live suites were executed, and no commit, push or VPS synchronization was performed by Codex. Suggested documentation commit: `docs(certificates): mark step 7 verified after VPS regression gates`.

### Step 8 first broad VPS gate — browser fixture corrections

Evidence received 5 October 2026 from run.47x15g: **193 Go tests passed, 0 failed/skipped; Newman passed; Playwright reported 10 passes and 8 failures in 8.3m**. All four dedicated certificate journeys passed, including the new recovery/abandonment preview synchronization (43.7s), external renewal (18.4s), generated issuance/signers (55.1s), and own signing profile (13.5s). The broader failures are across seven other browser spec files. Storage cleanup deleted 74 journaled objects and dropped ams_e2e_20261004195349. Both cleanups passed; exit 130 followed Ctrl+C stopping the failed HTML report. Newman assertion totals were not supplied.

The separate supplemental run.5mSUXv passed all three CertificateDetailPage mock cases in **14.9s** (5.1s oversize rejection, 2.8s friendly HTML 413 handling, 4.8s route/renewal/history actions). It deleted 0 journaled objects, dropped ams_e2e_20261004195154 and exited 0. Go/Newman were intentionally disabled. This supplemental gate is verified and does not need rerunning for the following unrelated browser fixture changes.

The attached output and page snapshots establish these corrections:

| Spec | Cause and correction |
| --- | --- |
| auth-cookie-session (two cases) | Account is a menuitem inside the profile menu, not a sidebar link. The fresh-tab case now opens that menu, navigates to Account and verifies its heading before checking cross-tab logout. The expiry mock previously returned a new authenticated session after every logout/reload; it now retains a fixed expiry, transitions to anonymous after logout, supplies AMS product access, clears a seeded mock cookie and verifies anonymous reload with exactly one logout. |
| client-asset-certificates | The certificate renewal duration field is labeled Renewal. Update the label while retaining the 6-month duration, validity, file-action layout and suspended-access assertions. |
| routine-maintenance and scheduler-management | Fixtures named assigned projects they did not create. Each now creates its own unique active project and removes it after its asset, preserving project-backed maintenance/scheduler coverage. |
| single-asset-equipment and template-catalog | API setup tokens became stale when browser login replaced the same user's stored token. All four setup/browser specs now capture that actual browser login response and use its current token for later API verification/cleanup. Login still returns a token; missing login-token output was ruled out. Cleanup errors are attached separately and do not replace the original failure; failed cleanup still fails otherwise passing tests. Relevant cleanup calls are bounded. |
| template-catalog | Align the create action, dialog, name field, submit action and success message with the current test / certificate type labels. Dropdown options are awaited by role rather than falling back based on an immediate count. |
| whole-app-regression | The certificate detail page starts in Generate mode, which has no upload input. Select Upload external document and target Certificate renewal file before asserting the oversize guard. Creation/edit guards retain their existing file inputs. |

These corrections change browser fixtures/assertions only. Production certificate/auth/project behavior, SQL, Go and Newman files are unchanged. Keep the 193 Go passes and Newman pass, along with the four dedicated browser passes and supplemental gate. The dedicated files remain `ams-server/generated_renewal_certificates_integration_test.go`, `api/generated-renewal-certificates.postman_collection.json` and `e2e/generated-renewal-certificates.spec.ts`; they need no edits for these broader-spec fixes. Shared Go regression and system API smoke were reviewed and need no changes. The whole-app browser baseline is updated for the renewal source selector.

The isolated runner was reviewed and needs no change: its certificates-final profile already selects all affected specs, supplies prerequisites/flags, retains timing artifacts, hosts reports on failure, and performs scoped storage/database cleanup. Strict TypeScript checks passed for all seven touched specs and the dedicated certificate spec; discovery still lists 18 tests across 11 files; Bash syntax and diff whitespace passed. User-run evidence is the reproduction loop. Codex did not execute test bodies, start a stack, or commit/push/synchronize files.

After reviewing/publishing/synchronizing these changes yourself, rerun **all 18 browser tests together**, as ams_test_runner from the Fedora repo root:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
E2E_SPECS='' E2E_PROFILE=certificates-final \
bash tests/regression/run-vps-isolated-tests.sh
```

Return actual browser results, cleanup and exit status, and the run evidence path. No test is removed or skipped to bypass these failures. Preserve automatic failed-report hosting; inspect then Ctrl+C to permit cleanup. The broad browser gate, final timing evidence and PDF sign-off remain pending, so Step 8 is not complete.

The original failed broad run retains certificate timing samples because all four dedicated journeys passed. Its combined summary did not run after the wider Playwright failure. Generate that summary from the existing artifacts, without rerunning requests:

```bash
python3 tests/regression/support/certificate-latency-summary.py \
  --newman-log .vps-test-run/run.47x15g/generated-renewal-certificates.postman_collection.json.log \
  --playwright-dir .vps-test-run/run.47x15g/certificate-timings \
  --output .vps-test-run/run.47x15g/certificate-latency-summary.json
```

Return the printed table or JSON; measured latency values have not yet been supplied. The browser-only rerun produces its own timing summary without Newman samples; keep layer/run provenance when comparing. Final own/competent/long-text/recovered PDF feedback also remains pending. Suggested commit: `test(regression): repair final certificate gate fixtures and selectors`.

### Step 8 second broad browser gate — Dubai calendar fixture correction

Evidence received 5 October 2026: the complete 18-test browser profile now reports **17 passed, 1 failed in 4.2m**. All eight previously failing cases pass, as do all four dedicated certificate journeys. Only the HR/Admin ADMIN product journey failed: its overview fixture displayed **44 days left / Upcoming** instead of **45 days left / Due now**. The supplied output does not include this run's evidence directory, cleanup results or exit status; these remain unrecorded. Retain the earlier 193 Go passes, Newman pass and three supplemental mocked-page passes.

The fixture used UTC today's date while renewal queue SQL compares calendar dates in **Asia/Dubai**. Between 20:00 and midnight UTC, Dubai is already on the following date. The UI correctly classified the resulting 44-day expiry as Upcoming. The browser fixture now derives its calendar date in Asia/Dubai and shares one reference instant for issue/expiry. Its overview assertions target its own unique record row and require the 45-day countdown, record-type policy and Due now state. Production SQL/UI behavior and reminder semantics are unchanged; no timeout increase, skipped case or relaxed status assertion is introduced.

Strict TypeScript checks for the broader specs and dedicated certificate spec passed; Playwright discovery lists both HR/Admin journeys. Runner Bash syntax and diff whitespace checks passed. Codex did not execute test bodies, commit/push or synchronize the VPS. The dedicated Go/Newman/certificate browser files and shared Go/system API/whole-app baselines need no changes for this test fixture correction. The isolated runner already selects HR/Admin and needs no edits; automatic failure report hosting and scoped cleanup remain enabled.

After reviewing/publishing/synchronizing this correction yourself, run **both HR/Admin journeys**, as ams_test_runner from the Fedora repo root. The other 17 browser passes remain valid; Go/Newman do not need repeating for this fixture-only change:

```bash
RUN_GO_REGRESSION=0 RUN_NEWMAN=0 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
E2E_SPECS='../tests/regression/e2e/hr-admin-product.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

Return the two browser results, cleanup summary, exit status and evidence path. Step 8 remains pending this correction's live verification, timing evidence and final PDF feedback. The preceding entry's command can summarize the retained run.47x15g certificate timings without rerunning requests. Suggested commit: `test(hr-admin): align overview expiry fixtures with Dubai dates`.

### Step 8 automated coverage verified — run.VEpZ2d

Evidence received 5 October 2026: **both HR/Admin browser journeys passed in 1.0m**, ADMIN 33.5s and USER/VIEWER 24.4s. This verifies the Dubai-calendar fixture correction. Storage cleanup deleted 0 journaled objects; database ams_e2e_20261004205021 was dropped; exit status 0. Evidence directory: `/home/pms/ams-testing/asset-management-system/.vps-test-run/run.VEpZ2d`. Go/Newman were intentionally not rerun for this fixture-only correction.

Combined Step 8 automated evidence: run.47x15g passed **193 Go tests, 0 failed/skipped**, and Newman; the subsequent full browser profile passed **17 of 18**, including all four dedicated certificate journeys; run.VEpZ2d passes the corrected HR/Admin ADMIN journey and repeats the USER/VIEWER pass; run.5mSUXv passed all **three supplemental CertificateDetailPage mock cases**. Thus all 18 selected browser cases have passing evidence across these runs, not in a single all-green invocation. The 17-of-18 run's evidence path/cleanup/exit summary and detailed Newman assertion totals were not supplied. Earlier interrupted report-hosting runs remain recorded as failed/interrupted rather than relabelled successful.

No further Go/Newman/browser rerun is required solely to record these results. **Step 8 is not yet complete: observed certificate timing evidence and final own/competent/long-text/recovered PDF feedback remain outstanding.** Summarize the retained run.47x15g artifacts using the command above; this reads existing logs/JSON and does not repeat application requests. Return its printed timing table or JSON and final PDF feedback.

This update records evidence only. Dedicated files `ams-server/generated_renewal_certificates_integration_test.go`, `api/generated-renewal-certificates.postman_collection.json`, and `e2e/generated-renewal-certificates.spec.ts`, shared Go/system API/whole-app baselines and the isolated runner need no edits. Failure report hosting and cleanup remain enabled. Codex did not execute live suites, commit/push or synchronize the VPS. The proposed application-wide UTC policy has only been assessed; this result verifies the current Dubai-calendar contract and does not change it. Suggested documentation commit: `docs(certificates): record passing final regression coverage`.

### Step 8 timing evidence received — run.47x15g

The user summarized retained run.47x15g artifacts on Fedora and supplied all four operations in both layers. Evidence: `.vps-test-run/run.47x15g/certificate-latency-summary.json`. The printed output reports 46 successful request samples (17 browser, 29 Newman); controlled faults are excluded. Percentiles use nearest rank. These are observed functional VPS/R2 request timings, not a load benchmark or latency acceptance threshold. Retry samples include completed idempotent retries as well as recovery; different layers remain separate.

| Layer | Operation | Samples | p50 ms | p95 ms | Max ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Browser | External renewal | 2 | 602 | 651 | 651 |
| Browser | Generated issuance | 2 | 808 | 836 | 836 |
| Browser | Generated preview | 10 | 202 | 233 | 233 |
| Browser | Retry | 3 | 547 | 781 | 781 |
| Newman | External renewal | 7 | 587 | 715 | 715 |
| Newman | Generated issuance | 5 | 731 | 863 | 863 |
| Newman | Generated preview | 12 | 186 | 258 | 258 |
| Newman | Retry | 5 | 183 | 710 | 710 |

No operation/layer samples are missing. Minimum values were not included in the pasted table and are not inferred. Together with the preceding combined automated evidence, the timing requirement is satisfied; **final own/competent/long-text/recovered PDF feedback is the only remaining Step 8 item**. No regression rerun is needed solely to record these timings. This update changes documentation only; dedicated Go/Newman/Playwright files, shared Go/system API/whole-app baselines and the runner need no edits. No live suites, commits/pushes or VPS synchronization were performed by Codex. Suggested commit: `docs(certificates): record final regression and latency evidence`.

### Step 8 PDF review started — available local examples

On 5 October 2026, Codex reviewed six existing Downloads PDFs: `examination-preview4.pdf`, `approved-own-examination-preview4.pdf`, `issued-own-examination4.pdf`, `approved-competent-examination-preview4.pdf`, `issued-competent-examination4.pdf`, and `examination-preview-long2.pdf`. These files were downloaded on 4 October between 13:05 and 14:38 local time; no claim is made that they came from the final regression run. The long sample has three pages; the other five have one. All eight pages were rendered with Poppler and visually inspected, with PDF text/image inspection supplementing the visual check. Original PDFs were not altered or re-exported.

The approved logo/rule/title spacing, centered title, dates, equipment/component fields, validity, test/IMCA details, signer/date/signature block, footer and page numbering are consistent in these examples. Removed fields are absent. Accented, Greek and Cyrillic test text renders legibly. Extracted text has no characters outside page bounds; no clipping/overlap was observed. The own-account pair and competent-person pair have matching extracted text except document number; their embedded image stream hashes and positions also match. Own preview `PMS-CE-261004-002-MS1-XX` becomes `...-01`; competent preview becomes `...-02`. These are synthetic test signatures and fixture values, not customer examinations.

One cosmetic observation remains in the older long sample: page 3 shows an empty `REMARKS (continued)` label before Measurements. The trailing newline in the 60-line test remarks produces a final blank paragraph that moves to the next page. All 60 nonempty observations are present, the measurements/signature are readable and the footer is clear. No renderer or template change has been made in this review. Check the latest long attachment before deciding whether this cosmetic detail needs correction.

`recovered-issued-examination.pdf` was not found locally. Its real stored-byte/hash preservation passed the dedicated recovery journey, but its visual inspection remains open. Supply that report attachment and the latest `examination-preview-long.pdf` from a passing certificate journey to finish the outstanding review; if the supplied own/competent pairs differ from the current examples, supply those pairs too. Step 8 is not yet complete. This review changes evidence documentation only; dedicated/shared tests and runner need no edits. No live suites, commits/pushes or VPS synchronization were performed by Codex.

### Step 8 remaining PDFs inspected — 5 October 2026

The user supplied `C:/Users/maisa/Downloads/1examination-preview-long.pdf` (three pages, SHA-256 `857b137af8ec3aa8c149b9fcde05fe2572824c14147d8f56bcf5f933f77d6f69`) and `C:/Users/maisa/Downloads/recovered-issued-examination.pdf` (one page, SHA-256 `7cd9b48e11d8e2d394d34297aa36146d6ea93fc20ca747eebbca0c6ef200ae6a`). All four pages were rendered with Poppler at 110 DPI and visually inspected; text extraction supplemented the review. Original PDFs were not modified. No specific run ID was supplied with these attachments, so their hashes identify the reviewed copies without inferring run provenance.

The recovered document is visually satisfactory: number `PMS-CE-261004-002-R1-01`, issue/signer date 04 Oct 2026, expiry 04 Oct 2027, 12-month validity, D018, `Saved recovery details`, original organization `Porto Marine`, legible synthetic signature/stamp and approved footer. `Changed after approval` is absent, matching the passed recovery journey's approved-snapshot preservation. The attached PDF alone does not prove storage-byte identity; the previously passed real R2 hash/byte assertions supply that evidence. No clipped or overlapping text was observed, and extracted text stays within page bounds.

The new long document uses `PMS-CE-261004-004-MS1-XX` consistently across all three preview pages. All 60 nonempty remarks remain present (17 on page 1, 43 on page 2); measurements and the signer block are readable on page 3. Headers, dates/validity, signature image, footer and page numbering remain consistent. The same cosmetic issue is confirmed: page 3 starts with `REMARKS (continued)` but no nonempty remarks beneath it, because the test's terminal newline adds a blank paragraph after the last observation. No data loss or additional functional failure was found.

Final PDF inspection is now complete, including the recovered document. **The cosmetic continuation-heading disposition and final feature sign-off remain open; Step 8 is not marked complete.** No further attachments are required for the current review. No renderer, template, dedicated Go/Newman/Playwright files, shared Go/system API/whole-app baselines or runner changes were made. No additional live suites, commits/pushes or VPS synchronization were performed by Codex. This is a documentation-only review update, with diff whitespace checked.


### Step 8 empty continuation heading corrected — live verification pending

The user requested removal of the empty Remarks (continued) heading on 5 October 2026. The renderer counted a terminal blank paragraph as a line and paginated it after the last observation. Field rendering now discards only trailing whitespace-only lines before pagination, preserving leading/interior paragraph breaks and the approved snapshot's original text. Stored historical PDF bytes remain unchanged. The approved layout, schema, document numbering, template version, fonts and signature handling are unchanged.

Dedicated Go renderer coverage compares short/long text with LF, CRLF and whitespace-only endings against an unpadded control, and separately protects interior paragraph breaks. The feature Go HTTP/R2 integration case also verifies PDF equality, preserved snapshot whitespace and token validation. Newman adds four requests (400 total), covering clean/padded long previews and token validation. The existing Playwright signer journey performs clean/padded previews through the real UI, asserts PDF equality and unchanged snapshot whitespace, validates the padded token and attaches the corrected examination-preview-long.pdf. All four dedicated browser journeys remain selected; no test is skipped.

Static verification passed: Go compile-only for the renderer and integration packages, go vet, strict dedicated-spec TypeScript, discovery of four browser journeys, collection SDK/JSON parsing and syntax checks of all 404 embedded scripts, runner Bash syntax and diff whitespace. No test bodies or live application/storage requests were executed by Codex. The shared Go harness, system API smoke and whole-app browser baseline were reviewed and need no edits because this change introduces no API or persistence contract. The isolated runner already registers the dedicated suites and retains PDF evidence; it needs no change. Automatic failed-report hosting and scoped cleanup remain enabled.

After reviewing/publishing/updating the VPS checkout yourself, run as ams_test_runner from the Fedora repo root:

```bash
RUN_GO_REGRESSION=1 RUN_NEWMAN=1 RUN_PLAYWRIGHT=1 RECLAIM_TEST_PORTS=0 \
NEWMAN_COLLECTIONS='tests/regression/api/generated-renewal-certificates.postman_collection.json' \
E2E_SPECS='../tests/regression/e2e/generated-renewal-certificates.spec.ts' \
bash tests/regression/run-vps-isolated-tests.sh
```

Return the actual Go/Newman/Playwright results, cleanup/database/exit summary and evidence path, plus the new examination-preview-long.pdf from the passing browser report. Verify there is no empty Remarks (continued) heading before Measurements and that all 60 observations, measurements, signer block and page numbering remain readable. Previous automated/timing evidence stays recorded for the previous renderer; it does not substitute for this correction's live gates. A broader 18-case browser rerun is not required solely for this field-rendering fix. Step 8 remains open until these focused gates and updated PDF review pass. Changes are uncommitted/unpushed; no VPS synchronization was performed. Suggested commit: `fix(certificates): prevent empty PDF continuation headings`.


### Step 8 complete — run.yNbzjh and corrected long PDF verified

Evidence received 5 October 2026: the user ran the focused three-layer gate on Fedora. **194 Go tests passed, 0 failed/skipped; Newman passed; all four dedicated Playwright journeys passed in 2.2m.** Browser durations: saved-approval recovery 43.4s, external renewal/history 18.6s, managed signers/own issuance 55.7s, private own signing profile 13.1s. The supplied output does not include detailed Newman assertion totals; these are not inferred. Storage cleanup deleted 73 journaled objects; database ams_e2e_20261004214142 was dropped; exit status 0. Evidence: `/home/pms/ams-testing/asset-management-system/.vps-test-run/run.yNbzjh`. These passes verify the renderer correction and its updated Go/Newman/browser checks. Earlier broad-profile and supplemental-mock passing evidence remains recorded above; this focused invocation is not described as an all-18 browser run.

The retained `certificate-latency-summary.json` reports 50 successful samples (18 browser, 32 Newman), with all four operations in both layers. Controlled faults are excluded and completed idempotent retries remain included. Nearest-rank percentiles on these small functional-run groups are descriptive, not a load benchmark or SLA.

| Layer | Operation | Samples | p50 ms | p95 ms | Max ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Browser | External renewal | 2 | 513 | 644 | 644 |
| Browser | Generated issuance | 2 | 647 | 790 | 790 |
| Browser | Generated preview | 11 | 189 | 220 | 220 |
| Browser | Retry | 3 | 516 | 919 | 919 |
| Newman | External renewal | 7 | 550 | 620 | 620 |
| Newman | Generated issuance | 5 | 656 | 771 | 771 |
| Newman | Generated preview | 15 | 182 | 269 | 269 |
| Newman | Retry | 5 | 168 | 681 | 681 |

The user supplied `C:/Users/maisa/Downloads/step 8/examination-preview-long.pdf`, SHA-256 `406300e4be9e032e213b48406723a70ba9ed44f3034477d34496c0542743d49b`. Codex rendered all three A4 pages at 110 DPI and visually inspected them, supplementing the review with text extraction. All 60 nonempty observations remain: 17 on page 1, 43 on page 2. Page 2's Remarks (continued) heading correctly precedes actual observations; page 3 begins with Measurements and has no empty Remarks (continued) heading. Applied pressure: 10 bar and the complete signer/date/signature block remain readable. Logo, title, repeated preview number PMS-CE-261004-003-MS1-XX, dates 04 Oct 2026 to 04 Oct 2027, 12-month validity, footer and page numbering are consistent. No clipping/overlap or text outside page bounds was found. The original PDF was not modified. The file was supplied with this run summary; no embedded run identifier is claimed.

**All eight implementation steps and agreed verification are complete.** The final cosmetic finding is resolved, and prior own/competent preview/issued and recovered-document visual reviews remain valid. No further regression rerun or PDF attachment is required solely to record this result. Application-wide UTC policy remains a separate assessed proposal, not an implemented change. Completion here verifies the feature; deployment/merging is not claimed.

This update records evidence only. Dedicated Go (`ams-server/generated_renewal_certificates_integration_test.go` plus renderer `certificateissuance/preview_test.go`), Newman (`api/generated-renewal-certificates.postman_collection.json`) and Playwright (`e2e/generated-renewal-certificates.spec.ts`) coverage needs no further edits. Shared `ams-server/integration_regression_test.go`, `api/system-api-smoke.postman_collection.json` and `e2e/whole-app-regression.spec.ts` need no changes for this result or the final renderer fix. The runner already includes the dedicated suites and retains evidence, so no runner change is required. Automatic failed-report hosting and scoped cleanup remain enabled. Codex did not run live suites, commit/push or synchronize the VPS; evidence documentation remains uncommitted for the user's review. Suggested documentation commit: `docs(certificates): mark final regression and PDF review complete`.
