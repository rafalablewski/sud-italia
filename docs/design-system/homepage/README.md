# Homepage — public storefront theme

The customer-facing web surface — the guest ordering experience at the
project root: `/`, `/menu`, `/checkout`, `/order/[id]`, the location
sub-routes, the loyalty pages.

Homepage is a **separate theme**. It does not inherit from Core or Admin,
and changes to those themes must not leak into Homepage. The doctrine
is the WordPress model: each theme is a self-contained instance — change
a font here and only the storefront moves.

## Layout

```
homepage/
├── README.md          ← you are here
├── theme/             ← Homepage-only tokens: color, type, material, components
└── pages/
    ├── home.md        ✅ landing — hero, locations grid, bundles, about, loyalty, CTA
    ├── menu.md        ✅ /locations/[slug] — hero, menu sections, info, floating cart
    ├── checkout.md    ✅ cart drawer flow — review, slot, address, identity, Stripe
    ├── order.md       ✅ /order-confirmation — receipt, live tracker, points, feedback
    └── loyalty.md     ✅ /rewards — tier card, rewards grid, challenges, referral
```

## Storefront rules (universal — apply to every page)

These come from CLAUDE.md and apply to every Homepage surface:

1. **Zero-friction ordering** — no registration walls, no passwords,
   phone-based auto-enrol for loyalty (rule 6).
2. **Discoverable placement** — new user-facing features go in prominent
   locations, never buried below 20 menu items (rule 5).
3. **Portal every modal + overlay** — `createPortal(node, document.body)`
   (rule 4). Same rule as Admin, for the same stacking-context reasons.
4. **Toggle = saved** — persist on change, no separate Save button
   (rule 7).

## Today vs target

**Target:** Homepage renders under its own theme scope, owns its own
CSS file, owns its own font loading, and a change to the Admin or Core
theme leaves the storefront visually unchanged.

**Today:** Homepage tokens currently live in the `@theme inline` block
of `src/app/globals.css` (the Tailwind v4 token surface). That file is
shared with Admin and Core, so token bleed is possible. Fonts come from
the single `src/app/layout.tsx`. Until the code split lands, "Homepage
theme" is documented intent, not enforced reality — see
`../README.md#today-vs-target` for the gap list.

Mockups live at `public/mockups/` — open `/mockups/` on any deploy.
