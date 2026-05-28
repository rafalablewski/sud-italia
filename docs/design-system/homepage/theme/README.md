# Homepage theme — tokens, type, material, components

Everything the Homepage theme owns. **No cross-theme links.** A Homepage
token change must leave Core and Admin visually unchanged.

## What ships today

- **Tokens:** `src/app/themes/homepage/tokens.css` — the `@theme
  inline` block declaring `--color-italia-*` plus the
  `--animate-delivery-*` family. `@import`-ed by `globals.css` (~50
  lines, ships globally) because Tailwind v4 only generates utilities
  for `@theme` blocks reachable from the entry CSS's `@import` chain.
  Edit the `bg-italia-*` / `text-italia-*` source-of-truth here.
- **Custom CSS:** `src/app/themes/homepage/index.css` — `.pub-*` form
  elements, `body { ... }` styling, the `delivery-*` keyframes.
  JS-imported by `src/app/(public)/layout.tsx` and route-scoped (does
  not ship on admin / kitchen / franchisee routes).
- **JS-side token mirror:** `src/app/themes/homepage/theme.ts` exports
  the same values as typed constants. No JS consumers today; future
  Recharts / canvas / inline-SVG code on the storefront imports from
  here.
- **Fonts:** `src/app/(public)/layout.tsx` loads Inter + Fraunces
  independently of every other layout, exposed as
  `--font-homepage-body` + `--font-homepage-heading`. A storefront
  font change can't move admin.

## Homepage-specific rules

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
- [`material.md`](./material.md) — cream/white elevation alternation; the single brand-tinted shadow (FloatingCartButton); spring physics allowed on one-shot celebrations; 12/16/24px radius ladder; generous padding rhythm.
- [`components.md`](./components.md) — `.pub-*` form primitives; shared `<Button>` / `<Sheet>` / `<Container>` / `<StarRating>` / `<CurrencySwitcher>`; landing sections; item card; `<CartDrawer>` and `<FloatingCartButton>`; `<DeliveryProgress>`; `<LoyaltyCard>`; `<OrderTracker>`.

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
