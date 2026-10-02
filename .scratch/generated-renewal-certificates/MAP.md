# Find the implementation route for generated renewal certificates

Status: open
Labels: wayfinder:map
Assignee: unassigned
Created: 2026-10-02

## Destination

An evidence-backed, implementation-ready route for the finalized generated/uploaded certificate renewal feature, with concrete integration boundaries, PDF inputs, issuance/recovery protocol, and a verified isolated Fedora testing foundation. The map ends when its readiness investigations are resolved; production feature implementation follows the existing implementation plan.

## Notes

- The [design](../../docs/generated-renewal-certificates-design.md) and [implementation plan](../../docs/generated-renewal-certificates-implementation-plan.md) capture the accepted decisions. The user approved the revised PDF layout as-is. Carry these decisions forward; reopen only an evidenced conflict, not routine implementation details.
- The user owns VPS suite execution and will return results. Use their already-configured R2 bucket as authorized, with cleanup limited to test-created objects. Codex needs no SSH details and prepares code/tests/runner handoffs rather than running live suites.
- Use [CONTEXT.md](../../CONTEXT.md) for domain vocabulary and [the ADRs](../../docs/adr/) for accepted trade-offs. This concerns AMS Certificates, not HR/Admin Compliance Records.
- Follow [the authoritative testing guide](../../tests/regression/TESTING_GUIDE.md) and [development rules](../../rules.md). Every feature creates/updates dedicated Go, Newman, and Playwright files; review/update the runner where applicable. Test each completed implementation slice before advancing.
- Work stays on `codex/generated-renewal-certificates`; preserve unrelated changes. No commits, pushes, deployment, or production implementation are part of charting this map.
- The prior grilling session finalized the destination's behavior. Do not restart that interview. Use [wayfinder](C:/Users/maisa/.agents/skills/wayfinder/SKILL.md) each session; consult grilling/domain-modeling only if evidence exposes a new human decision or terminology conflict. Research/prototype tickets name the specialized workflow they need.
- Tracker mechanics and frontier queries: [Local Markdown issue tracker](../../docs/agents/issue-tracker.md). Read the map and current child metadata before selecting/claiming; resolve at most one ticket per later session. Charting resolves none.
- Store investigation notes/prototypes under this effort's `assets/` directory when produced, and link them from the resolving ticket. Do not copy source-of-truth design decisions into multiple issue bodies.

## Decisions so far

- [Validate the branded certificate preview with representative content](./issues/05-review-certificate-preview.md) — The human approved the revised A4 layout as-is; production rendering is verified during implementation.

## Not yet specified

Follow-up investigations depend on observed evidence: baseline failures, legacy-data anomalies, renderer limitations, or a counterexample to the proposed recovery protocol may expose a narrower question. Ticket those findings when they can be stated precisely; do not create speculative remediation or implementation tickets now.

## Out of scope

- Production feature code, production deployment, and broad infrastructure modernization during this planning map.
- Reopening settled business choices, user-to-competent-person linking, pass/fail workflows, structured per-test measurements, multiple certificate templates, or background issuance workers.
- Rebuilding historical documents from current profiles, rewriting existing report generators, or fixing unrelated product architecture and baseline defects without a demonstrated prerequisite.
