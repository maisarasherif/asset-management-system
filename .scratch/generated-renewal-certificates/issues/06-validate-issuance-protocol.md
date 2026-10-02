# Validate the approval, publication, retry, and abandonment protocol

Status: open
Labels: wayfinder:research
Assignee: unassigned
Parent: [Find the implementation route for generated renewal certificates](../MAP.md)
Mode: AFK
Blocked by: [Establish the isolated certificate regression baseline](./02-establish-regression-baseline.md), [Trace renewal, signer, and history integration boundaries](./03-trace-renewal-integration.md)

## Question

Can a concrete PostgreSQL/R2/token protocol implement the accepted issuance lifecycle under duplicate/concurrent approvals and rendering, storage, publication, or cleanup failures, using the verified existing integration boundaries?

Consult official PostgreSQL/pgx, JWT-library, and R2/S3 documentation alongside the integration/baseline findings. Specify transaction boundaries, typed snapshot/source-version checks, preview-token separation, per-component/date sequence uniqueness, processing ownership/fencing, stable object identity/digest, publication version guards, and retry/abandon terminal states. Keep the agreed synchronous processing and short transactions; do not hold a database transaction across rendering/storage.

Resolve with a cited protocol note and a transition/failure matrix that makes each invariant testable: approval allocates once, retries retain numbers, saved PDFs are reused after publication failure, stale work cannot overwrite a newer renewal, failed work preserves the current certificate, cleanup is idempotent, and completed history/signatures remain immutable. Include the corresponding dedicated Go/Newman/Playwright assertions, necessary test failure controls, runner changes, and vertical-slice ordering. Produce planning contracts/pseudocode rather than production schema/code.

After resolution, update the implementation plan only where evidence refines its routine interfaces. Reopen a human decision only for a demonstrated contradiction with the finalized design.
