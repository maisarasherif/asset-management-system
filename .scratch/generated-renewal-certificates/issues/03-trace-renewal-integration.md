# Trace renewal, signer, and history integration boundaries

Status: open
Labels: wayfinder:task
Assignee: unassigned
Parent: [Find the implementation route for generated renewal certificates](../MAP.md)
Mode: AFK
Blocked by: none

## Question

Where exactly does the finalized renewal workflow join the existing application, and which existing schema/API contracts must the implementation preserve?

Perform a read-only integration audit, starting with `ams-server/controllers/certificateController.go`, certificate routes/middleware, `db/queries/certificates.sql`, users/competency/component queries and migrations, `utils/storage.go`, and `ams-frontend-cloudscape/src/features/assets/CertificateDetailPage.tsx`. Trace the real upload-then-date-update flow, account/competent-person/category eligibility, product/asset access guards, component display IDs, legacy upload references, and supported file/date validation.

Resolve with a linked integration note naming concrete file/symbol/query seams, verified schema constraints, authoritative snapshot inputs/source-version markers, thin controller/module boundaries, and proposed migration/API touchpoints. Distinguish observed contracts from proposed changes. Preserve the finalized design, legacy evidence, and existing access rules; surface only concrete conflicts. This is planning evidence, not a production refactor.

## Step 1 integration evidence

The [Step 1 handoff](../../../docs/generated-renewal-certificates-step-1.md) records observed upload/date/audit boundaries, UUID/display-ID allocation, current access/category guards, legacy evidence limits, storage contracts, and proposed migration/preview fences. Detailed source-version implementation remains part of the later preview slice.
