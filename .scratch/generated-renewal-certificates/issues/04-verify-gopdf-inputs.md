# Verify gopdf fonts, branding, and signature-rendering inputs

Status: open
Labels: wayfinder:research
Assignee: unassigned
Parent: [Find the implementation route for generated renewal certificates](../MAP.md)
Mode: AFK
Blocked by: none

## Question

Which pinned gopdf version and bundled font/logo/image inputs can reliably render the agreed certificate content without external runtime asset downloads?

Use official gopdf documentation/source and authoritative font/asset licensing information; inspect the repository's existing branding. Verify the Go compatibility, font/glyph coverage, image formats/alpha/proportions, long-text/page handling, and practical decoded-image bounds. Keep gopdf as the accepted renderer; this investigation validates its concrete inputs rather than reopening the library choice.

Use the research workflow to save a cited summary under this effort's `assets/` directory. Resolve with verified asset/version/license choices, rendering constraints, and cases the prototype must exercise. If findings contradict an accepted requirement, state the conflict explicitly rather than selecting a new product behavior.
