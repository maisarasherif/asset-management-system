# Newman API Regression

These are the maintained Postman collections used by the isolated VPS regression runner.

## Collections

```text
system-api-smoke.postman_collection.json
routine-maintenance.postman_collection.json
client-asset-certificates.postman_collection.json
fixtures/sample-certificate.pdf
```

The older `postman/` folder is kept as a reference/archive area for manual or legacy collections. Do not add those collections to the automated VPS suite until they are checked against the current API contract.

## Run Via Isolated VPS Runner

From the repository root:

```bash
bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

API-only:

```bash
RUN_PLAYWRIGHT=0 bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

One collection:

```bash
RUN_PLAYWRIGHT=0 \
NEWMAN_COLLECTIONS="tests/api/postman/system-api-smoke.postman_collection.json" \
bash ams-frontend-cloudscape/tests/e2e/run-vps-isolated-tests.sh
```

The runner injects:

```text
baseUrl
adminEmail
adminPassword
```

from the isolated API and `ams-server/.env`, so separate Postman environment files are not required for the automated VPS flow.
