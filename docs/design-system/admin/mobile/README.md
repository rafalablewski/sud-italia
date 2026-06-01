# Admin — mobile shape

> **⚠️ RETIRED + DELETED.** The separate, hand-built phone shell this
> folder describes — `MobileShell` + `BottomNav` + `MoreDrawer` +
> `MobileTopbar` + `MobileCommandPalette` + the ~30 per-page `Mobile*`
> components — has been **deleted from the codebase**. Operators required
> that the mobile admin reflect the desktop admin **1:1**, and a divergent
> phone UI can't guarantee that. `useIsMobile()` and the `forceDesktop`
> toggle are **gone**; `AdminShell` now renders one responsive `v2-shell`
> chrome for every viewport (sidebar → hamburger drawer below 900px, pages
> reflow via their own `@media (max-width: 720px)` rules). The Core surfaces
> (POS / KDS / Guest) reflow their own `.core-suite` / `.kds-core` layouts
> (see [`../../core/theme/README.md`](../../core/theme/README.md#responsive--phone--tablet--web)).
> The only survivors are a few list/page/chip primitives in
> `src/components/admin/v2/mobile/` that back the standalone `/admin/alerts`
> page (`MobileAlerts`, a 1-column notifications list). The sub-docs below
> (`audit.md`, `ux-strategy.md`, `navigation.md`, `tokens.md`,
> `final-review.md`, `next-steps.md`) are kept only as a **historical
> record** of the deleted shape — do not treat them as the current spec.

The mobile shape of the Admin theme. Same theme, same tokens, same
operators — phone-shaped. Not a separate theme: the `AdminShell` *used
to* swap in `MobileShell` (`src/components/admin/v2/mobile/`) below the
breakpoint and these docs describe what changed in that (now retired)
swap.

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
