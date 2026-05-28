# Admin — mobile shape

The mobile shape of the Admin theme. Same theme, same tokens, same
operators — phone-shaped. Not a separate theme: the `AdminShell` swaps
in `MobileShell` (`src/components/admin/v2/mobile/`) below the
breakpoint and these docs describe what changes in that swap.

← back to [Admin README](../README.md)

## Read in order

1. [`audit.md`](./audit.md) — what existed before, where mobile broke down
2. [`ux-strategy.md`](./ux-strategy.md) — the strategic shape of mobile admin
3. [`navigation.md`](./navigation.md) — bottom-nav, more-drawer, FAB, role
   filtering
4. [`tokens.md`](./tokens.md) — mobile-specific additions to the admin
   tokens (the `.v2-m-*` namespace)
5. [`final-review.md`](./final-review.md) — adversarial review of the shipped
   redesign
6. [`next-steps.md`](./next-steps.md) — punch-list of what's not yet shipped

Clickable HTML mockups live at `public/mockups/mobile/` — open
`/mockups/mobile/` on any deploy.

## Scope

This folder covers the **mobile shape of the Admin theme** only. Mobile
shapes of the Core theme (POS / KDS / Guest on a phone) and the
Homepage theme (storefront on a phone) are documented inside those
themes' own folders if and when they get dedicated mobile guidance.

## Authority

When this folder and the code disagree, **code wins** — open a PR to
fix the doc.
