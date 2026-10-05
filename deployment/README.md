# Fedora production deployment — certificate generation

Prepared against the operator's supplied Makefile, aliases and production service output on 5 October 2026. Production database is clean at version **49**. Release `certgen` adds **50–54**. The feature passed 194 Go tests, Newman, four dedicated Playwright journeys and isolated cleanup in `run.yNbzjh`; final PDF inspection also passed. Production deployment has not been executed by Codex.

## Files and production paths

Install `Makefile`, `deploy.sh` and `ams-aliases.sh` together at `/home/pms/ams-deploy`, outside the Git checkout. Retain this README there for recovery instructions. Defaults match the supplied setup:

| Item | Value |
| --- | --- |
| Checkout / branch | `/home/pms/asset-management-system` / `certgen` |
| systemd service / user | `ams-server` / `ams` |
| Working directory / environment | `/opt/ams-server` / `/opt/ams-server/.env` |
| Backend executable | `/opt/ams-server/ams-server` |
| Frontend / owner | `/var/www/ams` / `nginx:nginx` |
| Vite API base | `/api` (existing nginx proxy mapping retained) |
| Migration connection | `postgres://ams@/ams_db?host=/var/run/postgresql&sslmode=disable` as OS user `ams` |
| Backup directory | `/home/pms/ams-deploy/backups/release-<UTC timestamp>.<suffix>` |
| Backend health | `http://127.0.0.1:<PORT>/v1/health`, automatically read from the service environment; fallback 8080 |

Preflight reads only the service's `PORT` to select the local health URL, falling back to the application default 8080 when absent/empty. Other values are never displayed. An explicit `HEALTH_URL` override is available if needed.

## Installation and deployment

1. Review the files; commit/push them yourself if you want them versioned. Copy the four deployment files from this directory to a temporary folder in your remote VS Code session, for example `/home/pms/ams-deploy/incoming`. Alternatively upload the supplied `certgen-deploy.zip` there and run `unzip certgen-deploy.zip` from that incoming directory. Keep both tool files together: the Makefile invokes its adjacent helper. Installing tools does not fetch code, migrate or restart the app. The feature commit must already be published to origin/certgen; deployment tools can be installed directly outside the checkout without publishing them first.

```bash
mkdir -p /home/pms/ams-deploy/incoming
# Upload Makefile, deploy.sh, ams-aliases.sh and README.md into incoming.
cd /home/pms/ams-deploy
tool_backup="tools-before-certgen-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$tool_backup"
for file in Makefile deploy.sh ams-aliases.sh README.md; do
  if [ -f "$file" ]; then cp -p "$file" "$tool_backup/"; fi
done
install -m 0644 incoming/Makefile Makefile
install -m 0755 incoming/deploy.sh deploy.sh
install -m 0644 incoming/ams-aliases.sh ams-aliases.sh
install -m 0644 incoming/README.md README.md
source /home/pms/ams-deploy/ams-aliases.sh
ams help
```

2. Run as `pms`, **without sudo around `ams`/`make`**. Preflight checks service identity, configured environment names (without showing values), tools and a clean schema in 49–54. It does not fetch, build, migrate or stop the service.

```bash
ams preflight
ams migration-status
```

If Git/npm files are still owned by root from the old sudo-based deployment, fix ownership of the **production checkout only**, then rerun. First verify `readlink -f /home/pms/asset-management-system` names the intended checkout. `sudo chown -R pms:pms /home/pms/asset-management-system` is a one-time repair when needed; do not change `/opt/ams-server/.env` or the regression checkout's test-account ownership.

3. Deploy the reviewed release during a brief maintenance window. The current reviewed feature commit is `52b9e9444aeb051c5f029a1e68d11039de294523` (local `certgen` at preparation time). After committing deployment documentation/tools, use the full SHA of the reviewed remote branch tip instead. `EXPECTED_COMMIT` is optional but recommended: it stops before checkout/build/publication if the fetched branch tip differs. It is a full hash, not an abbreviated hash.

```bash
ams deploy BRANCH=certgen EXPECTED_COMMIT=<full-reviewed-remote-commit-sha>
```

Sequence: preflight → fetch branch/select commit → build Go and frontend → stop backend → backup binary/environment/frontend/database → migrate to 54 → install binary/frontend → restore Fedora SELinux contexts when available → start backend → check clean version 54, active service and health JSON. The database dump's archive list is checked before migrations; this is not a full restore rehearsal. `npm ci` uses the committed lockfile. Git/Go/npm run as pms; sudo is reserved for service, database and publication operations. Local ignored settings/files are preserved; tracked local edits stop deployment and conflicting untracked files are left for Git to reject. No `git reset --hard` or `git clean` is run.

Existing runtime configuration is retained: `DATABASE_URL`, `SECRET_KEY`, `R2_S3_ENDPOINT`, `R2_S3_REGION`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY` and `R2_S3_BUCKET` must be populated in `/opt/ams-server/.env`. Keep the current signing secret; no rotation/new bucket is required. Isolated-test settings are rejected in the production environment. Fonts/logo are embedded in the Go binary; gopdf requires no separate server renderer/browser. No nginx configuration or systemd unit change is required by this feature.

4. Confirm production manually after the health check:

```bash
ams verify
ams status
sudo journalctl -u ams-server --since '10 minutes ago' --no-pager -n 100
```

Open the normal application URL and verify login, existing certificate/history reads, SUPER_ADMIN signature management, own ADMIN signing profile and a generated preview with number ending `XX`. Check the PDF layout. The new signing-profile tables initially have no profiles/images: SUPER_ADMIN must assign the needed ADMIN competency category, and the ADMIN uploads their own signature and organization in Account; SUPER_ADMIN uploads competent-person signatures through their management screen. Satisfy any competency restrictions already configured on the test type. Legacy attachments do not become signature images automatically. Use a real authorized successful examination if issuing a production certificate; do not create disposable test issuances or run isolated Go/Newman/Playwright suites against production. Also check an existing external uploaded document still opens. The local backend health check does not test the external nginx route, browser permissions, or R2 document reads/writes; these manual checks cover the production integration.

## Migrations and existing commands

| Version | Change |
| --- | --- |
| 50 | Private immutable signature versions and own-account signing profiles |
| 51 | Competent-person signing profiles |
| 52 | Issuance snapshots, component/date counters and renewal-version tracking |
| 53 | External-document metadata and issuance-linked upload audit |
| 54 | Recovery/abandonment cleanup state and immutable abandonment audit |

Use full `ams deploy` for the initial upgrade. `deploy-backend`/`deploy-frontend` require clean version 54 and intentionally do not fetch or migrate. `ams build` builds the current checkout without publishing. `ams pull` only fetches/selects the requested commit. The alias now forwards all arguments, so configuration overrides work.

The equivalent migrate commands are:

```bash
sudo -u ams migrate -path /home/pms/asset-management-system/ams-server/db/migrations -database 'postgres://ams@/ams_db?host=/var/run/postgresql&sslmode=disable' version
# The deployment helper runs this after successful builds, stopping and backup:
sudo -u ams migrate -path /home/pms/asset-management-system/ams-server/db/migrations -database 'postgres://ams@/ams_db?host=/var/run/postgresql&sslmode=disable' goto 54
```

`up 1` from 49 only reaches 50. `up 5` reaches 54 only when the starting version is exactly 49. The helper checks clean numeric version bounds before using `goto 54`, so it never uses that command to downgrade a newer database. See the [official migrate CLI commands](https://github.com/golang-migrate/migrate/blob/master/cmd/migrate/README.md#usage). It never runs `down`, `force`, or database restore automatically.

## Failure and recovery

Build/preflight failures leave the current service running. After the maintenance phase starts, any failure leaves the backend stopped and prints the backup path. Inspect the error, `ams migration-status` and service logs before restarting. Backups contain `ams-server`, `service.env`, `frontend.tar`, `database.dump`, `database-contents`, `database-version`, `checkout-before` and `new-commit`; the checkout-before hash identifies the checkout before the attempt, not independently the installed binary's provenance. Backups have private permissions and are not auto-deleted. The environment backup is retained for recovery and is never printed.

If schema is still clean 49 and publication has not started (for example backup failed), the old deployment remains installed: resolve the backup error, then restart the old service or retry full deployment. If a migration is dirty, leave the service stopped and inspect the failing SQL; do not use `force 54` to hide the failure.

For an application-publication failure with a clean schema 54, retain the schema and restore the saved application files if needed, using the **actual printed backup path**:

```bash
backup='/home/pms/ams-deploy/backups/<printed-release-directory>'
sudo systemctl stop ams-server
sudo install -o root -g root -m 0755 "$backup/ams-server" /opt/ams-server/ams-server
restore_dir=$(mktemp -d /home/pms/ams-deploy/.frontend-restore.XXXXXX)
tar -C "$restore_dir" -xpf "$backup/frontend.tar"
sudo rsync -a --delete --chown=nginx:nginx --chmod=D755,F644 "$restore_dir/" /var/www/ams/
sudo restorecon /opt/ams-server/ams-server
sudo restorecon -R /var/www/ams
sudo systemctl start ams-server
ams verify
```

The new schema is additive to the old application; keep version 54 rather than dropping newly introduced records. After any production issuance, schema downgrade/database restoration can lose issued-document history, signature references and sequence counters, while R2 objects remain independent. A database restore therefore needs a separately coordinated recovery decision. Keep the dump and restore folder until recovery is confirmed; no automatic data deletion or R2 cleanup is provided by deployment.

## Verification scope

Only deployment tooling/instructions change here. Application behavior, migrations, dedicated Go/Newman/Playwright files, shared regression baselines and isolated runner are unchanged; the passing `run.yNbzjh` feature evidence remains valid. Bash syntax checks for the helper/alias, Makefile dry-run/help, embedded Python syntax, LF line endings, migration inventory, build/backup ordering and diff whitespace checks passed. No live application tests or deployment commands were executed. Static checks do not establish that production deployment passed. Return the deployment result, migration version, health/status and any manual production integration findings. Codex leaves these files uncommitted/unpushed and does not synchronize or restart the production server.
