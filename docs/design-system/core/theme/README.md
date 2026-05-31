# Core theme — tokens, type, material, components

Everything the Core theme owns. **No cross-theme links.** A Core token
change must leave Admin and Homepage visually unchanged.

## Two CSS layers (mid-migration)

The Core theme ships in **two** stylesheets, both loaded only by
`src/app/admin/layout.tsx`:

1. **`src/app/themes/core/suite.css`** — the **current** design, a 1:1
   port of the core-suite mockup (`public/mockups/core-suite/
   system.css` + the per-page layout styles). All rules are scoped under
   **`.core-suite`** so its deliberately-generic class names (`.card` /
   `.btn` / `.badge` / `.seg` / `.stat` / `.shell` / `.prod` / `.conv` /
   …) can't leak into Admin or Homepage. This is what **POS** and the
   **Guest hub** render, inside `<CoreShell>`
   (`src/components/admin/core/CoreShell.tsx`) — the mockup's SI sidebar
   + topbar as a fixed full-viewport layer. Tokens are redeclared on
   `.core-suite` (same warm-neutral / burgundy / platinum values as
   `--cmd-*`, under the mockup's generic names `--bg` / `--fg` /
   `--brand` / `--surface-*`).
2. **`src/app/themes/core/index.css`** — the original `--cmd-*` palette
   at `:root` plus the `.cmd-*` / `.kds-*` / `.ka-*` surfaces. This now
   backs the **KDS** kitchen-wall display (`.kds-atlas`, full-bleed via
   `.kds-bleed`) and **Mobile KDS**. The dead `.pos-*` / `.crm-*` /
   `.cncrg-*` families were pruned when POS/Guest moved to `suite.css`
   (1560 → 680 lines); the surviving non-`.cmd-`/`.kds-` rules are the
   `.wa-console` / `.wa-fa-*` / `.wa-cfg-*` classes for the WhatsApp
   Settings / Broadcast / Funnel dialogs.

- **JS-side token mirror:** `src/app/themes/core/theme.ts` exports the
  `--cmd-*` values as typed constants (for future Recharts / canvas
  code on KDS).
- **Fonts:** loaded in `src/app/admin/layout.tsx` (`--font-admin-body`
  Inter, `--font-admin-display` Fraunces, `--font-admin-mono` JetBrains
  Mono). The **`.core-suite`** surfaces (POS / Guest) **do** use Fraunces
  for display text (KPI values, dish + guest names) per the mockup; the
  **KDS** (`.cmd-*`) surface stays workhorse-Inter — density over flourish
  on the line.

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
- [`typography.md`](./typography.md) — the dense 13px Inter body + JetBrains Mono numerals on KDS; Fraunces display on the `.core-suite` POS / Guest surfaces (KPI values, dish + guest names).
- [`material.md`](./material.md) — the canvas → panel → raised elevation ramp; hairlines; 12px card radius; quiet 160ms motion; no spring on operator stations.
- [`components.md`](./components.md) — Core primitives: shared chrome (header, eyebrow, subbar, segmented, button, chip), KDS ticket + quantity badge + action button, POS tab card + tender pad + course divider, CRM regular row + health gauge, Concierge tool card + allergen matrix, WhatsApp thread card + live thread bubbles.

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
