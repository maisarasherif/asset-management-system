# Project recap and release assessment

Assessment date: 2026-09-13. Assessed branch: `hr`, commit `f0895468d471527f51c9a544399a532612cd88a5`.

The project has substantial implemented functionality and passes frontend/backend builds. Treat it as a candidate for release validation in staging. Production readiness is not established: frontend lint fails, the documented independent product-access model is only partially enforced, and there is no fresh full regression or deployment verification in this assessment.

This is a source/history review with build and static checks, not a complete security audit or an inspection of the deployed application.

## Where development stopped

- Latest code commit: July 10, 2026, `f089546` ("Enhanced Logging"). This specifically adds diagnostic logging around template configuration.
- Current working branch: `hr`. A live `git ls-remote --heads origin` check confirmed that GitHub has the same commit.
- `main` is still at March 29, 2026, `931f63b`. There are 92 commits reachable from `hr` that are not on `main`. Releasing `main` as it stands would omit this later work.
- No local release tags were found. The frontend package version is still `0.1.0`; that alone does not indicate functional maturity.
- June 21–July 3: HR/Admin backend, UI, document uploads, reminder configuration, and product workflows.
- July 6–8: repeated database/display-ID fixes, followed by the centralized allocator refactor and regression fixture fixes.
- A local architecture map was generated July 24. It is more current than the original architecture document and was already untracked when this review began.

The July 8 handoff in `temp/display-id-allocator-wbs-handoff.md` describes work that later landed in commit `048fc04`. Do not restart that refactor from the handoff: migration 49, allocator query calls, and boundary/concurrency tests are already present.

The underlying incident involved human-readable IDs above 999 being truncated by fixed-width padding, causing collisions. Migration 48 fixed formatting; migration 49 centralized allocation and drift repair. Source inspection found no remaining `next_display_id(...)` or `LPAD(...)` calls in active SQL query/generated-query files. Actual deployed migration state remains unverified.

## What is implemented

“Implemented” below means the relevant UI, backend, and/or persistence code exists. It does not mean the workflow passed a fresh end-to-end test today.

| Area | Current implementation |
| --- | --- |
| AMS Product | Asset directory/dashboard, asset workspaces, components, certificates, status/expiry tracking, document uploads/downloads, PDF certificate sheets |
| Templates and catalog | Configurable asset templates, component/test generation, scoped categories, test types, competency rules, equipment types, standalone equipment |
| Operations | Projects, warehouse/unassigned assets, working hours, routine-maintenance completion and reminders |
| Client access | Project-assigned read-only client asset/certificate views |
| HR/Admin Product | Persons, departments, vehicles, companies, compliance record types, versioned renewal records, documents, archive workflows, overview/renewal queue |
| HR/Admin reminders | Reminder policies, product notification configuration, scheduled expiry scans, delivery/failure views |
| Platform | Cookie-first authentication with bearer fallback, database-validated sessions, password change/reset, user administration, product access APIs, shared notification delivery |
| Background work | PostgreSQL-backed River jobs, email and ClickUp delivery, retry/audit infrastructure, scheduler administration |
| Operations visibility | Structured logs, request IDs, token-protected metrics, basic HTTP health endpoint |

The actual stack is React/TypeScript/Vite with Cloudscape, a Go/Gin API, PostgreSQL with sqlc queries, River workers, and Cloudflare R2 storage. SMTP and ClickUp support delivery integrations. There are 49 forward application migrations.

## Checks performed on September 13

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm.cmd run build` | PASS | TypeScript project build and Vite production bundling succeed using installed dependencies |
| `go build ./...` | PASS | Backend packages compile |
| `go vet ./...` | PASS | Go static checks report no errors |
| `npm.cmd run lint` | FAIL | 2 errors and 2 warnings |
| Remote branch comparison | PASS | GitHub `hr` matches the local assessed commit |
| Go unit/integration, Newman, Playwright | NOT RUN | No fresh behavioral result is claimed |
| Deployed version, database migration level, external services, restore test | NOT CHECKED | Live operational readiness remains unknown |

Lint errors:

- [AppDatePicker.tsx](ams-frontend-cloudscape/src/components/shared/AppDatePicker.tsx#L52): synchronous state update in an effect (`react-hooks/set-state-in-effect`). Two additional Fast Refresh warnings occur in this file.
- [HRAdminRecordsPage.tsx](ams-frontend-cloudscape/src/features/hr-admin/HRAdminRecordsPage.tsx#L280): synchronous state update in an effect (`react-hooks/set-state-in-effect`).

These are verified lint failures, not proof that the pages fail at runtime. The build also emitted a plugin timing warning, but completed successfully.

Repository [rules.md](rules.md) says: “Do not start local servers, browser sessions, Playwright runs, Newman/Postman runs, or integration regression runs unless explicitly requested.” This assessment therefore used builds and static inspection without launching the application or running those suites.

The saved frontend `.last-run.json` says `passed` and is dated July 3. It predates the July 8 allocator/test fixes and July 10 commit. Its small summary does not establish which suites ran or tie a result to the current commit.

## Release gates and unresolved evidence

1. **Make lint pass.** Resolve the two effect/state errors and review the warnings, then rerun lint and the frontend build.
2. **Resolve the product-access mismatch.** [CONTEXT.md](CONTEXT.md) defines independent product access and roles. HR/Admin routes enforce that model, but AMS routes still use global `AdminMiddleware`/`StaffMiddleware`. [GetPlatformProducts](ams-server/controllers/platformController.go#L46) advertises active AMS access to all non-client users irrespective of their AMS access row. Suspending or deleting an AMS product-access assignment therefore does not govern AMS access through those routes. This is a source-confirmed contract gap; runtime reproduction was not performed. Enforce independent access before releasing that promise, or explicitly scope the release to AMS being available to all internal users.
3. **Record fresh isolated regression results for the release commit.** The runner covers Go, six maintained Newman collections, and two default Playwright specs (whole app and HR/Admin). Go regression is OFF by default. Use `RUN_GO_REGRESSION=1` when running the full release validation. Review skipped tests and separately select relevant focused specs, including password-reset coverage, rather than assuming the default run executes every spec.
4. **Rehearse database upgrades.** Confirm the target migration level and validate both a clean database and an upgrade of a disposable copy of existing data through migration 49. Include IDs above 999, allocator drift, concurrent creation, and template configuration. A clean-database regression run alone does not establish upgrade safety for existing records.
5. **Verify operational dependencies in staging.** Exercise document upload/download with designated test storage, password-reset delivery, expiry/reminder delivery, retries, and permissions using representative accounts. The isolated runner disables ordinary real notification delivery; its success alone does not prove SMTP/ClickUp configuration is working.
6. **Make the release reproducible and recoverable.** Choose the actual release commit/branch, document the deployment procedure and required configuration, and verify database plus document recovery. No tracked CI workflow or current deployment/restore runbook was found in this checkout. A local database dump exists, but its existence is not evidence of a successful restore. Infrastructure may exist outside this repository and was not inspected.

The `/v1/health` route only returns a static success response; it does not check database or worker readiness. Keep that limitation in mind when deciding what operational checks constitute a healthy deployment.

## Suggested restart order

Start with the existing `hr` branch and a short stabilization pass: fix lint and settle the AMS access contract. Then run the full isolated suite and migration rehearsal, address observed failures, verify staging integrations, and record the validated release commit. Avoid deriving a “percentage complete” from file counts or the package version; feature scope and release evidence are different measures.

For orientation, open the existing [architecture map](docs/architecture/app-architecture-map.html), read [CONTEXT.md](CONTEXT.md) for terminology, and use the [isolated testing guide](tests/regression/ISOLATED_TESTING_GUIDE.md) for verification. [ARCHITECTURE.md](ARCHITECTURE.md) is stale: it still describes MongoDB and older authentication behavior.

This review did not change application source, migrations, or tests. Pre-existing `.gitignore`, `.codegraph/daemon.pid`, and untracked architecture-map changes were preserved. The generated tracked TypeScript build cache changed by the build was restored to its original state.
