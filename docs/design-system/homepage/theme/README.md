# Homepage theme — tokens, type, material, components

Everything the Homepage theme owns. **No cross-theme links.** A Homepage
token change must leave Core and Admin visually unchanged.

## Today

Homepage tokens live in the `@theme inline` block of
`src/app/globals.css` (the Tailwind v4 token surface — variables like
`--background`, `--foreground`, `--brand-red`, the public radii and
spacing scale). The same file holds the `[data-admin-theme]` blocks
that Admin and Core use, so token *bleed* is possible if names collide
between blocks.

Fonts come from the single `src/app/layout.tsx` via `next/font` and are
applied to the body — they cover every theme, not just Homepage.

## Target

Homepage gets its own CSS file (proposal: `src/app/themes/homepage.css`),
its own font loading scoped to the storefront route group, its own
colour/type/material file set, and its own component primitives. The
code split that creates this lands in subsequent commits.

## Homepage-specific rules (today)

These rules apply even before the code split:

- **Zero-friction ordering** — no registration walls, no passwords,
  phone-based auto-enrol for loyalty (CLAUDE rule 6). Component shapes
  follow: phone-first inputs, optional email, no password fields anywhere
  on the storefront.
- **Discoverable placement** — prominent loyalty/rewards in the nav and
  on dedicated pages, never buried (CLAUDE rule 5).
- **Portal every modal + overlay** — `createPortal(node, document.body)`
  (CLAUDE rule 4). Same rule as Admin, same stacking-context reason.
- **Toggles persist immediately** — `saveSettings()` on change, no
  separate Save button (CLAUDE rule 7).
- **No mock/fake data anywhere** — every visible price, item, slot,
  loyalty balance comes from the real store (CLAUDE rule 1).

## Per-token docs

- [`philosophy.md`](./philosophy.md) — Homepage's operating principle: hospitality outranks density; beauty earns its keep.
- [`color.md`](./color.md) — `--color-italia-*` palette; burgundy-as-brand vs status; warm cream canvas; gold as editorial accent.
- [`typography.md`](./typography.md) — Fraunces (display, brand voice) + Inter (workhorse) + JetBrains Mono (codes); 16px body default; sentence case headings; price callout rules.
- `material.md` — Homepage surface rules (hero, item card, slot picker) *(backlog)*
- `components.md` — Homepage primitives (location card, item card, cross-sell rail, slot grid, address form) *(backlog)*

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
