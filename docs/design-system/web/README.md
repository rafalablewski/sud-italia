# Web — Design System

The public-facing storefront — the guest ordering experience at the
project root (`/`, `/menu`, `/checkout`, `/order/[id]`, the location
sub-routes, the loyalty pages).

**Status:** placeholder. Per-page design notes will land here as the
storefront gets a dedicated review. Until then:

- **Foundations** ([`../foundations/`](../foundations/)) — color, type,
  material, motion are shared with admin and the Core modules. The public
  `@theme inline` block in `src/app/globals.css` is the storefront's
  surface of those tokens (the `[data-admin-theme]` blocks are admin-only).
- **Components** ([`../components.md`](../components.md)) — buttons,
  badges, inputs, cards, dialogs apply to the storefront too.
- **Storefront rules from CLAUDE.md** that apply universally:
  - Zero-friction ordering — no registration walls, no passwords,
    phone-based auto-enrol for loyalty (rule 6).
  - Place new user-facing features in prominent, discoverable locations
    — not buried below 20 menu items (rule 5).
  - All modals + overlays use `createPortal(node, document.body)`
    (rule 4) — same rule as admin.

## Backlog

- `home.md` — landing, hero, location picker
- `menu.md` — category navigation, item card, cross-sell rail
- `checkout.md` — slot picker, address, payment, identity capture
- `order.md` — live order tracking, ETA, KDS reflection
- `loyalty.md` — points, rewards, referral

Mockups live at `public/mockups/` — open `/mockups/` on any deploy.
