# Validate the branded certificate preview with representative content

Status: closed
Labels: wayfinder:prototype
Assignee: maisa (Codex session /root)
Parent: [Find the implementation route for generated renewal certificates](../MAP.md)
Mode: HITL
Blocked by: none

## Question

What visual arrangement, typography, spacing, and overflow presentation should the single branded certificate template use, and does the human approve the concrete layout proposal?

Produce a disposable PDF sample, separate from production feature code, using synthetic records and the existing company branding. Show the `XX` preview number, required content groups, optional remarks/measurements, and the saved signature/stamp area. Extract text and visually inspect the sample. Propose overflow rules without silently treating an untested long-content case as verified.

Obtain the human's feedback on the artifact as an embodiment of the accepted template. Resolve with links to the sample and feedback, layout/overflow rules, any bounded input constraints, and concrete implementation implications. Do not introduce new business options or claim a production end-to-end workflow has been implemented.

## Comments

### 2026-10-02 — Layout review started

The user explicitly requested agreement on the PDF layout before implementation. A document-only visual proposal can proceed with synthetic data without waiting for the integration audit or pinned gopdf inputs. The claim and removed blockers apply to layout review only: production rendering, Unicode/image behavior, and overflow verification still depend on those investigations. A ReportLab layout mockup does not change the accepted gopdf production renderer. This ticket remains open pending human feedback.

### 2026-10-02 — First visual proposal

Created [Certificate layout proposal](../../../output/pdf/certificate-layout-proposal.pdf) and [Layout notes](../assets/certificate-layout-notes.md). The one-page A4 mockup uses the real logo, synthetic details, the `XX` number, and a signature/stamp placeholder. Content extraction confirmed the required fields and A4 page size, and rendered-page inspection found no clipping or overlaps. Proposed overflow behavior is documented separately and is not yet a tested gopdf result. Await the human's layout feedback; no resolution is recorded.

### 2026-10-02 — Requested layout revision

Applied the human's header, field, and footer instructions to the same sample. [Layout notes](../assets/certificate-layout-notes.md) contain the current printed-field rules and the sample's date/validity interpretations. The new rendered page was visually inspected and remains a single A4 page. Keep this ticket open for review of the revised artifact; field removal from the PDF does not change the accepted authorization or numbering rules.

### 2026-10-02 — Resolution: revised layout approved

The human explicitly confirmed: "PDF layout is approved as is." Use the revised [sample](../../../output/pdf/certificate-layout-proposal.pdf) and [layout notes](../assets/certificate-layout-notes.md) as the visual reference, including the competent-person issue date. The accepted production renderer remains gopdf. Real signature transparency, Unicode, and long-text/page-break behavior still require implementation verification. The visual decision is resolved; no production feature code or live suite results are implied.
