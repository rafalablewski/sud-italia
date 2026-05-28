# Mobile — Design System

The mobile shape of the admin. Same brand, same tokens, same operators —
mobile-shaped. Not a separate theme, not a stripped-down "lite" admin: a
parallel set of components that the `AdminShell` swaps in below the
breakpoint via `MobileShell` (`src/components/admin/v2/mobile/`).

**Read this folder in order:**

1. [`audit.md`](./audit.md) — what existed before, where mobile broke down
2. [`ux-strategy.md`](./ux-strategy.md) — the strategic shape of mobile admin
3. [`navigation.md`](./navigation.md) — bottom-nav, more-drawer, FAB, role
   filtering
4. [`tokens.md`](./tokens.md) — mobile tokens, primitives, ergonomic
   patterns (the `.v2-m-*` namespace)
5. [`final-review.md`](./final-review.md) — adversarial review of the shipped
   redesign
6. [`next-steps.md`](./next-steps.md) — punch-list of what's not yet shipped

Clickable HTML mockups live at `public/mockups/mobile/` — open
`/mockups/mobile/` on any deploy.

## Scope

This is the **mobile admin** — the back-office on a phone. The mobile
shape of the Core modules (POS, KDS, CRM, Concierge, WhatsApp) inherits
the same patterns documented here. Public-facing storefront mobile lives
under `../web/`.

## Authority

- **Foundations** (color, type, material, motion) come from the design-system
  root — mobile inherits, never forks.
- **Admin conventions** (AdminShell anatomy, glass tokens, portal rule,
  capabilities source-of-truth) come from [`../admin/`](../admin/) — mobile
  inherits these too; the only differences are layout, navigation, and
  touch-target sizing documented here.
- When this folder and the code disagree, **code wins** — open a PR to
  fix the doc.
