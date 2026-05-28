# Core theme — tokens, type, material, components

Everything the Core theme owns. **No cross-theme links.** A Core token
change must leave Admin and Homepage visually unchanged.

## Today

Core surfaces (POS, KDS, Guest = CRM + Concierge + WhatsApp) render at
`/admin/{pos,kds,crm,concierge,whatsapp}` and **inherit the Admin theme
today**. There is no separate `[data-core-theme]` block in
`src/app/globals.css`. Fonts, colours, materials, and the glass-*
components all come from the Admin scope.

## Target

Core gets its own scoped theme block (proposal: `[data-core-theme]` on
the root of each Core surface), its own colour/type/material file set,
its own component primitives, and its own JS mirror for charts. The code
split that creates this lands in subsequent commits — until then, the
files below document **the rules Core overrides on top of the inherited
Admin theme**, not a free-standing token set.

## Core-specific overrides (today)

These rules already apply on Core surfaces even though the underlying
tokens are inherited:

- **Operational clarity outranks brand expression.** In POS/KDS, density
  wins; brand flourishes that are fine in CRM/Admin retreat. See the
  per-module docs in `../modules/` for the specifics.
- **Status hues on the line are reserved for genuine status** — not
  data-viz. The Admin theme uses the same hues for charts; on KDS they
  mean late/pacing/risk and must not be reused decoratively.
- **The coursing model is a Core concept**, not an admin one. It shapes
  POS card layout and KDS ticket grouping; see the per-module docs.

## Per-token docs

- [`philosophy.md`](./philosophy.md) — Core's operating principle: operational clarity outranks brand expression.
- [`color.md`](./color.md) — the `--cmd-*` palette + status hues + the platinum jewellery rule.
- [`typography.md`](./typography.md) — Inter + JetBrains Mono only; the dense 13px body default; the three read-across-the-line numerals.
- [`material.md`](./material.md) — the canvas → panel → raised elevation ramp; hairlines; 12px card radius; quiet 160ms motion; no spring on operator stations.
- `components.md` — Core primitives (tender pad, ticket card, course divider) *(backlog)*

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
