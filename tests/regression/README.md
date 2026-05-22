# AMS Regression Suite

This folder keeps the maintained regression assets together:

- `api/` contains Newman/Postman API collections.
- `e2e/` contains Playwright browser/API specs.
- `fixtures/` contains files used by regression collections.
- `support/` contains local helper servers and targeted runner scripts.

Together they cover auth/session handling, user permissions, catalog/template CRUD, assets/components/certificates, uploads/reporting, routine maintenance, client portal access, single-asset equipment, admin/client-access screens, competencies, equipment types, scheduler audit APIs, and whole-app route health.

## Collections

```text
system-api-smoke.postman_collection.json
admin-surface-regression.postman_collection.json
routine-maintenance.postman_collection.json
client-asset-certificates.postman_collection.json
single-asset-equipment.postman_collection.json
fixtures/sample-certificate.pdf
```

Do not add old manual or legacy collections to the automated VPS suite until they are checked against the current API contract.

## Run Via Isolated VPS Runner

From the repository root:

```bash
bash tests/regression/run-vps-isolated-tests.sh
```

API-only:

```bash
RUN_PLAYWRIGHT=0 bash tests/regression/run-vps-isolated-tests.sh
```

One collection:

```bash
RUN_PLAYWRIGHT=0 \
NEWMAN_COLLECTIONS="tests/regression/api/system-api-smoke.postman_collection.json" \
bash tests/regression/run-vps-isolated-tests.sh
```

The runner injects:

```text
baseUrl
adminEmail
adminPassword
```

from the isolated API and `ams-server/.env`, so separate Postman environment files are not required for the automated VPS flow.
