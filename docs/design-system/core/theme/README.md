# Core theme — tokens, type, material, components

Everything the Core theme owns. **No cross-theme links.** A Core token
change must leave Admin and Homepage visually unchanged.

## Two CSS layers (mid-migration)

The Core theme ships in **two** stylesheets, both loaded only by
`src/app/admin/layout.tsx`:

1. **`src/app/themes/core/suite.css`** — the **current** design, a 1:1
   port of the core-suite mockup (`public/mockups/core-suite/
   system.css` + the per-page layout styles). Most rules are scoped under
   **`.core-suite`** so its deliberately-generic class names (`.card` /
   `.btn` / `.badge` / `.seg` / `.stat` / `.shell` / `.prod` / `.conv` /
   …) can't leak into Admin or Homepage. This is what **POS** and the
   **Guest hub** render, inside `<CoreShell>`
   (`src/components/admin/core/CoreShell.tsx`) — the mockup's SI sidebar
   + topbar as a fixed full-viewport layer. Tokens are redeclared on
   `.core-suite` (same warm-neutral / burgundy / platinum values as
   `--cmd-*`, under the mockup's generic names `--bg` / `--fg` /
   `--brand` / `--surface-*`). **`suite.css` also carries the rebuilt
   desktop KDS** — the `.kds-core` kitchen-wall surface (its own dark
   `body.kds` token block, *not* `.core-suite`) with `.cmdbar` / `.truck`
   / `.mt` (Fleet), `.kds-board` / `.tk` (Floor) and `.kds-chefstrip` /
   `.kds-queue` / `.ct` (Chef). See [`../modules/kds.md`](../modules/kds.md).
2. **`src/app/themes/core/index.css`** — the original `--cmd-*` palette
   at `:root` plus the legacy `.cmd-*` / `.kds-atlas` / `.ka-*` surfaces.
   Its only renderer — the phone `MobileKDS` — was **deleted** in the
   mobile-shell cleanup, so that `.kds-atlas` / `.ka-*` KDS chrome is now
   dead (its desktop replacement is `suite.css` `.kds-core`, layer 1;
   `KdsTicketCard` lingers only to export the shared `Ring`). The still-live
   rules in this file are the `.wa-console` / `.wa-fa-*` WhatsApp dialog
   classes. The dead `.pos-*` / `.crm-*` / `.cncrg-*` families were
   pruned when POS/Guest moved to `suite.css` (1560 → 680 lines); the
   surviving non-`.cmd-`/`.kds-` rules are the `.wa-console` / `.wa-fa-*`
   / `.wa-cfg-*` classes for the WhatsApp Settings / Broadcast / Funnel
   dialogs.

- **JS-side token mirror:** `src/app/themes/core/theme.ts` exports the
  `--cmd-*` values as typed constants (for future Recharts / canvas
  code on KDS).
- **Fonts:** loaded in `src/app/admin/layout.tsx` (`--font-admin-body`
  Inter, `--font-admin-display` Fraunces, `--font-admin-mono` JetBrains
  Mono). The **`.core-suite`** surfaces (POS / Guest) **do** use Fraunces
  for display text (KPI values, dish + guest names) per the mockup, and so
  does the rebuilt **`.kds-core`** desktop KDS for **dish names only**
  (`.tk-nm` / `.ct-nm`); everything else on the line — labels, timers,
  ids — stays Inter / JetBrains Mono. The legacy **`.cmd-*` / Mobile KDS**
  surface stays workhorse-Inter throughout.

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

## Responsive — phone / tablet / web

The desktop layouts are the design source of truth (the mockups are
desktop), and — per the **retired mobile shell** (`useIsMobile()` is now a
hardwired desktop shim; see
[`../../admin/mobile/README.md`](../../admin/mobile/README.md)) — phones get
the **same layout, reflowed 1:1**, not a separate `Mobile*` screen. The
`Mobile*` components are dead code pending a cleanup PR; **do not add new
ones or wire `useIsMobile` swaps** on Core surfaces.

- **Phone (< 900px)** — the `.core-suite` / `.kds-core` desktop surface
  renders and the `suite.css` media tiers below reflow it: panes collapse to
  one column, side rails become horizontal scrollers, headers `flex-wrap`.
  Core routes own the viewport (no admin chrome), so the **CoreShell sidebar
  collapses to a 52px icon rail** (never hidden — it's the only way to
  navigate out); KDS keeps its in-header "Admin" back link.
- **Tablet / narrow desktop (900–1280px)** — the full desktop surfaces
  render; the same media tiers thin the multi-pane layouts down.

| Breakpoint | POS | Guest | KDS (`.kds-core`) |
|---|---|---|---|
| ≤ 1200 | rails 72px, menu 2-col, KPIs 4-col | — | — |
| ≤ 1100 | — | Inbox drops profile (`.ctx`) | `.cmdbar` 4-col, trucks 1-col |
| ≤ 1024 | ticket pane 320px | Inbox 2-pane, Concierge 1-col | — |
| ≤ 1000 | — | — | board 1-col |
| ≤ 900 | sidebar → 52px icon rail | CRM 1-col, Inbox 1-pane | header wraps |
| ≤ 820 | — | — | cmdbar 2-col, stats 3-col, capmeter full |
| ≤ 680 | stacks: cat-rail scrolls top, ticket below | — | — |
| ≤ 560 | — | — | viewswitch on its own row, queue 1-col |

Reflow is CSS-only (no JS layout branching) — flex/grid columns collapse,
side rails become horizontal scrollers, headers `flex-wrap`. The viewswitch
(`Fleet / Floor / Chef`) stays pinned in the sticky `.kds-top` at every
width.

## Per-token docs

- [`philosophy.md`](./philosophy.md) — Core's operating principle: operational clarity outranks brand expression.
- [`color.md`](./color.md) — the `--cmd-*` palette + status hues + the platinum jewellery rule.
- [`typography.md`](./typography.md) — the dense 13px Inter body + JetBrains Mono numerals on KDS; Fraunces display on the `.core-suite` POS / Guest surfaces (KPI values, dish + guest names).
- [`material.md`](./material.md) — the canvas → panel → raised elevation ramp; hairlines; 12px card radius; quiet 160ms motion; no spring on operator stations.
- [`components.md`](./components.md) — Core primitives: shared chrome (header, eyebrow, subbar, segmented, button, chip), KDS ticket + quantity badge + action button, POS tab card + tender pad + course divider, CRM regular row + health gauge, Concierge tool card + allergen matrix, WhatsApp thread card + live thread bubbles.

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
