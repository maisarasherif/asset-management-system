# UI Lessons Learned

This project is an internal asset-management and certificate-compliance workspace for offshore marine and diving operations. The UI should feel precise, operational, calm, and polished enough for executive review while staying efficient for admins, operators, read-only users, and clients.

## Product Direction

- Prioritize operational clarity over marketing polish inside the app. Users need to know what needs attention, where to act, and what changed.
- Keep the tone marine-industrial and calm: restrained colors, clear hierarchy, low visual noise, and confident spacing.
- Use product language that maps to real workflows. Prefer labels like "Certificate action queue", "Open workspace", "Download tracker", and "Certificate reference" over vague or system-internal wording.
- The login page can carry brand emotion. The slogan should be "Where Innovation Meets Depth" and should remain prominent.
- Do not store or document user credentials in UI notes, source comments, or design docs.

## Navigation

- On desktop, the main dashboard sidebar should be persistent. If navigation cannot be collapsed, remove the collapse control so the UI does not imply an unavailable action.
- Preserve mobile drawer behavior separately from desktop persistence. A persistent desktop sidebar should not remove the mobile open/close pattern.
- Label Cloudscape AppLayout regions with explicit aria labels so navigation, notifications, and tools are understandable to assistive technology.
- Active navigation should be visible without relying on thin side stripes alone. Use background, text color, and icon color together.

## Dashboard

- Put urgent work before overview charts. Compliance users first need the action queue, then the summary.
- Certificates should be sorted by risk first: expired, expiring soon, pending, then valid. Within the same risk band, sort by nearest expiry.
- Show timing in plain language: "12 d overdue", "Due today", or "45 d remaining". Dates alone make users do mental math.
- Pair risk counts with direct actions. A certificate-risk summary should lead to "Review certificates" or the relevant workspace.
- Keep chart sizing restrained so dashboards feel like tools, not decorative reports.

## Tables And Mobile

- Dense certificate tables work on desktop, but mobile needs a purpose-built list layout.
- Avoid horizontal table overflow for priority workflows. For mobile action queues, show certificate name, component, expiry, status, and timing as stacked fields.
- Header actions should compress on mobile: keep the primary action visible and move secondary actions into a dropdown.
- Stable column widths matter for certificate data. Do not add new columns without checking desktop fit at normal widths.

## Login Experience

- On mobile, show the form before the brand panel so returning staff can sign in quickly.
- Keep the login card compact, with moderate radius and shadow. The page should feel premium without becoming decorative.
- Hero type must fit comfortably across desktop and mobile. Avoid aggressive negative letter spacing that can crowd words or hurt readability.
- Preserve accessible text spacing when splitting a visual title across spans or lines.

## Visual System

- Avoid overusing left-border accents. Repeated side stripes in cards, nav, grouped labels, and records make the interface feel busy.
- For status records, prefer full-border color plus subtle background tint over a strong one-sided stripe.
- Keep page sections unframed where possible; reserve cards and containers for actual grouped content.
- Use Cloudscape primitives consistently, but override carefully where product-specific polish is needed.
- Shadows should be quiet and functional. Heavy elevation made the UI feel less operational.
- Letter spacing should generally be zero in compact labels and operational surfaces.

## Copy And IA

- Use precise, action-oriented labels. "Urgent certificates" became clearer as "Certificate action queue".
- Prefer user-facing domain terms over implementation terms. "Certificate bridge" became "Certificate reference"; "equipment bridge" became "equipment context".
- Button labels should be short but specific. "Download tracker" is easier to scan than a long formal label in a crowded header.
- Descriptions should explain ordering or state when it helps users trust the page, such as "sorted by highest compliance risk first."

## Verification Habits

- After UI changes, check desktop and mobile behavior in the browser, not only with static code inspection.
- For this app, useful URLs are:
  - Login: `http://127.0.0.1:5173/login`
  - Dashboard: `http://127.0.0.1:5173/dashboard`
  - Asset workspace: open from the dashboard with `Open workspace`
- Use realistic authenticated data when reviewing certificate-risk UI.
- Run `npm run lint` and `npm run build` before handoff for non-trivial UI changes.
- Run the Impeccable detector after broad polish work to catch known visual anti-patterns.
