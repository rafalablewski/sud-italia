# Core theme — tokens, type, material, components

Everything the Core theme owns. **No cross-theme links.** A Core token
change must leave Admin and Homepage visually unchanged.

## What ships today

- **CSS:** `src/app/themes/core/index.css` — declares the canonical
  `--cmd-*` palette at `:root` and the `.cmd-*` / `.kds-*` / `.ka-*` /
  `.pos-*` / `.crm-*` / `.cncrg-*` / `.wa-*` surfaces. Loaded only by
  `src/app/admin/layout.tsx` (Core modules live at `/admin/{pos,kds,
  crm,concierge,whatsapp}`).
- **JS-side token mirror:** `src/app/themes/core/theme.ts` exports the
  same values as typed constants. No JS consumers today; the file
  exists so future Recharts / canvas / inline-SVG code on a Core
  surface imports from one place instead of hardcoding hex.
- **Fonts:** Core inherits the admin fonts loaded in
  `src/app/admin/layout.tsx` (`--font-admin-body` /
  `--font-admin-display`). Core has no display-serif use — `.cmd-*`
  surfaces are workhorse-Inter throughout.

## Core-specific rules

- **Operational clarity outranks brand expression.** In POS/KDS,
  density wins; brand flourishes retreat. See the per-module docs in
  `../modules/`.
- **Status hues are reserved for genuine status** — never decoration.
  The `--cmd-firing` / `--cmd-warn` / `--cmd-late` / `--cmd-ready` /
  `--cmd-risk` colours mean what they say on a Core surface; reusing
  them for branding would be a worse bug than no brand at all.
- **The coursing model is a Core concept**, not an admin one. It
  shapes POS card layout and KDS ticket grouping; see the per-module
  docs.

## Per-token docs

- [`philosophy.md`](./philosophy.md) — Core's operating principle: operational clarity outranks brand expression.
- [`color.md`](./color.md) — the `--cmd-*` palette + status hues + the platinum jewellery rule.
- [`typography.md`](./typography.md) — Inter + JetBrains Mono only; the dense 13px body default; the three read-across-the-line numerals.
- [`material.md`](./material.md) — the canvas → panel → raised elevation ramp; hairlines; 12px card radius; quiet 160ms motion; no spring on operator stations.
- [`components.md`](./components.md) — Core primitives: shared chrome (header, eyebrow, subbar, segmented, button, chip), KDS ticket + quantity badge + action button, POS tab card + tender pad + course divider, CRM regular row + health gauge, Concierge tool card + allergen matrix, WhatsApp thread card + live thread bubbles.

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
