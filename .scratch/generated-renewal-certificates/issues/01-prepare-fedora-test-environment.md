# Prepare isolated Fedora and certificate-storage testing

Status: open
Labels: wayfinder:task
Assignee: maisa (Codex/root; user-run verification)
Parent: [Find the implementation route for generated renewal certificates](../MAP.md)
Mode: HITL
Blocked by: none

## Question

Does the user's configured VPS environment support the agreed per-step Go/Newman/Playwright runs with disposable PostgreSQL and their existing R2 bucket, as evidenced by their returned results?

The user will run the script themselves and has configured the R2 bucket. Codex does not require SSH details, remote access, or another bucket. Keep credentials private. Supply the exact command and collect environment evidence from the user's run rather than requesting remote provisioning.

Follow [the guide](../../../tests/regression/TESTING_GUIDE.md) to review reported checkout/version, dependencies, migration/login behavior, PostgreSQL permissions, available test ports, and test-owned R2 upload/read/delete cleanup. The user authorized their configured bucket as-is; do not change shared configuration or delete unrelated objects.

Resolve from a linked user-run readiness/baseline report without secrets. The user's configuration statement is accepted; it is not a claim that every storage path or suite has already passed.

## 2 October 2026 preparation

Step 1 runner/storage isolation and dedicated three-layer baseline coverage are delivered in [the handoff](../../../docs/generated-renewal-certificates-step-1.md). Local build/compile/syntax checks passed; user-run VPS evidence remains pending. Keep this issue open until returned results establish readiness.
