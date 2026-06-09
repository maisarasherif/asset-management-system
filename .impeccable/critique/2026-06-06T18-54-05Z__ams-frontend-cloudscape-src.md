---
target: current workspace UI
total_score: 26
p0_count: 0
p1_count: 3
timestamp: 2026-06-06T18-54-05Z
slug: ams-frontend-cloudscape-src
---
# Impeccable Critique: AMS Frontend Cloudscape Source

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good loading, status, and flash patterns; navigation/help state is visually under-communicated. |
| 2 | Match System / Real World | 3 | Asset and certificate language is mostly concrete; "certificate bridge" and the login headline are weaker fits. |
| 3 | User Control and Freedom | 3 | Major pages have clear escape routes; primary navigation and asset switching are too easy to hide. |
| 4 | Consistency and Standards | 3 | Cloudscape gives a stable base; custom sidebar, login, and status cards diverge from the system. |
| 5 | Error Prevention | 3 | Disabled invalid actions and delete confirmation help; high-risk certificate workflows need stronger next-step guidance. |
| 6 | Recognition Rather Than Recall | 2 | The app relies on a collapsed, unlabeled navigation trigger and hidden asset selector. |
| 7 | Flexibility and Efficiency | 2 | Good direct links, but no visible bulk or power-user path for certificate remediation. |
| 8 | Aesthetic and Minimalist Design | 2 | The dashboard is clean but oversized donut/cards and brand-heavy login dilute task priority. |
| 9 | Error Recovery | 3 | Page retry states exist; login can expose raw transport errors like "Request failed (502)". |
| 10 | Help and Documentation | 2 | Help panel exists, but is hidden behind an unlabeled icon and reads generic rather than task-specific. |
| **Total** | | **26/40** | **Acceptable: solid foundation, significant UX improvements needed before users feel fast and confident.** |

## Anti-Patterns Verdict

**LLM assessment**: This does not look like a generic AI-generated app overall. The Cloudscape base, real domain entities, and asset-first structure give it operational credibility. The AI-ish moments are concentrated in the login page and a few visual patterns: oversized inspirational headline, uppercase eyebrow, huge metric/donut emphasis, repeated bordered cards, and side-accent status treatments.

**Deterministic scan**: The detector found 4 side-tab accent warnings in `ams-frontend-cloudscape/src/styles/app.css`: lines 1033, 1037, 1041, and 1265. The first three are certificate record status accents; the last is the component main-category label. These are not all false positives because they carry semantic state, but the 4px one-side border pattern is still a recognizable visual crutch. Use status chips, full-row tint, icon+label, or a full subtle border instead.

**Visual overlays**: No reliable user-visible overlay is available. Browser mutation preflight failed when attempting to set `document.title`, so detector injection was not possible in this browser surface.

## Overall Impression

AMS has the bones of a serious operational product: asset context, certificate status, readable tables, and Cloudscape conventions. The biggest opportunity is to turn the dashboard/workspace from "shows certificate data" into "directs the user to the next compliance action." Right now the UI presents risk clearly, but does not make risk resolution feel like the center of gravity.

## What's Working

- Asset-first structure is strong. Dashboard, workspace, maintenance, datasheet, and certificates all orbit the selected asset, which matches the product purpose.
- Status indicators use text plus icons, not color alone. That is a good accessibility and scanning choice for certificate validity.
- Empty, loading, and error states are present across pages. The app does not leave users staring at blank tables without explanation.

## Priority Issues

**[P1] Primary navigation is visually hidden and weakly labeled**

Why it matters: On the authenticated desktop view, the main navigation appears collapsed behind a circular hamburger even on a wide viewport, while the DOM still exposes the full nav and selected asset selector. The trigger has no useful accessible name in the browser snapshot. Admin users lose the map of Dashboard, Assets, Templates, Catalog, Scheduler, Client Access, and Administration.

Fix: Make navigation persistent on desktop, with an explicit accessible label for the toggle. Ensure the `brand-sidebar` receives real dimensions when open, and preserve open/closed state intentionally. The asset selector should not disappear as the only way to understand current asset context.

Suggested command: `$impeccable adapt ams-frontend-cloudscape/src/components/layout/AppShellLayout.tsx`

**[P1] Certificate risk is visible but not actionable enough**

Why it matters: The dashboard shows 3 expired certificates and the workspace table lists validity, but the next action is left to user interpretation. Expired rows are mixed with valid rows in the workspace, and there is no overdue-days column, owner, remediation action, or "resolve expired certificates" path.

Fix: Create a risk-first certificate queue: expired first, expiring soon next, valid last. Add days overdue/days remaining, component context, and a primary action for the next certificate task. In the dashboard, let the urgent certificate table carry more weight than the donut.

Suggested command: `$impeccable polish ams-frontend-cloudscape/src/features/dashboard/DashboardPage.tsx`

**[P1] Mobile authenticated flows overload the top of the screen**

Why it matters: At mobile width, primary actions stack as large pill buttons before the user reaches the status summary. This is workable for three actions but fragile as flows grow, and it pushes the compliance signal downward. The nav and help icons remain icon-only.

Fix: Keep one primary action visible, move secondary actions into an overflow menu, and label the nav/help controls. On mobile, put the most urgent certificate/risk signal above secondary operational controls.

Suggested command: `$impeccable adapt ams-frontend-cloudscape/src/features/dashboard/DashboardPage.tsx`

**[P2] Login page has brand ceremony that delays the task**

Why it matters: The login page is visually polished, but the "Where Innovation Meets Depth" hero reads like marketing. On mobile the brand panel takes about 805px before the sign-in form, so the task starts below the first viewport. For an operational app, that is too much ceremony at the front door.

Fix: Keep Porto Marine identity, but shorten the brand panel and move login higher on mobile. Replace the inspirational headline with a direct system/category headline such as "Porto Marine AMS" or "Asset certification workspace."

Suggested command: `$impeccable quieter ams-frontend-cloudscape/src/features/auth/LoginPage.tsx`

**[P2] Detail cards and status accents flatten the hierarchy**

Why it matters: Many sections use the same white card, border, and rounded treatment. The detector flagged side accent borders, and the dashboard donut visually dominates the more actionable urgent certificate table.

Fix: Reserve cards for real grouped modules, reduce repeated card chrome, make urgent tables visually primary, and replace side-tab accents with full-row state language or compact status chips.

Suggested command: `$impeccable layout ams-frontend-cloudscape/src/styles/app.css`

## Persona Red Flags

**Alex (Power User)**: Alex can jump through links, but there is no obvious bulk action path for expired certificates. The workspace requires row-by-row inspection and "View file" repetition. Hidden navigation slows lateral movement between Scheduler, Catalog, and Administration.

**Sam (Accessibility-Dependent User)**: The nav toggle and help trigger appear as unnamed buttons in snapshots. The hidden navigation is still present in the accessibility tree at times, which can create a mismatch between what Sam hears and what is visually available. Status indicators include icons and text, which is good.

**Casey (Distracted Mobile User)**: Casey reaches three stacked actions before the dashboard summary and must scroll through a large donut before details and tables. The login form is below a long brand panel on mobile, delaying the most basic task.

## Minor Observations

- "Download Certification Tracker" is long for a mobile button. "Download tracker" is enough in context.
- "Certificate bridge" is internal language. Use "Linked certificate record" or "Certificate reference" if that is the actual concept.
- Disabled "Open datasheet" controls are clear, but could explain absence via tooltip or nearby text when datasheet is important.
- The login contact email is useful, but should not be the visual endpoint of the form card on mobile if it pushes the layout taller.

## Questions to Consider

- What should an admin do first when an asset has expired certificates: view a file, edit a certificate, notify someone, or schedule remediation?
- Should the dashboard be a status report, or a work queue?
- Is the sidebar meant to be a persistent navigation map for operators, or a temporary drawer?
- What would the client portal hide that internal users need, and what would it make more prominent?
