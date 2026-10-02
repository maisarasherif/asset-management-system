# Establish the isolated certificate regression baseline

Status: open
Labels: wayfinder:task
Assignee: unassigned
Parent: [Find the implementation route for generated renewal certificates](../MAP.md)
Mode: HITL
Blocked by: none

## Question

What currently passes, fails, or skips on the approved Fedora test stack before certificate implementation, and which results affect the planned renewal slices?

Codex supplies the command from [the authoritative guide](../../../tests/regression/TESTING_GUIDE.md); the user executes it on their configured VPS. Explicitly enable all three layers and select relevant existing certificate/client-portal checks beyond default route health. Record the tested commit/diff, commands, selections, counts, R2 paths exercised, failure evidence, and cleanup. The same returned run supplies readiness evidence to the environment ticket. A skip is not renewal coverage.

Resolve with a linked baseline report separating setup failures, existing defects, and feature prerequisites. Do not chase unrelated remediation or claim readiness from the runner's success line alone. If a failure reveals a new planning prerequisite, create its focused ticket rather than silently expanding this one into feature implementation.
