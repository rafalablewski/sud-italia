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
├── theme/             ← Homepage-only tokens: color, type, material, components, extend
└── pages/
    ├── home.md        ✅ landing — hero, locations grid, bundles, about, loyalty, CTA
    ├── menu.md        ✅ /locations/[slug] — hero, menu sections, info, floating cart
    ├── checkout.md    ✅ cart drawer flow — review, slot, address, identity, Stripe
    ├── order.md       ✅ /order-confirmation — receipt, live tracker, points, feedback
    └── loyalty.md     ✅ /rewards — tier card, rewards grid, challenges, referral
```

## What ships today

- **Tokens:** `src/app/themes/homepage/tokens.css` (`@theme inline`
  block — ~50 lines, @import-ed by `globals.css` so Tailwind v4
  generates the `bg-italia-*` / `text-italia-*` utilities).
- **Custom CSS:** `src/app/themes/homepage/index.css` (`.pub-*` forms,
  the liquid-glass material — `--glass-*` vars, the `body::before` aurora,
  the `.v8-surface` / `.v8-sheen` primitives + `@supports` fallback —
  `html` / `body` canvas, delivery keyframes). JS-imported by
  `src/app/(public)/layout.tsx` so it ships only on storefront routes.
- **JS-side mirror:** `src/app/themes/homepage/theme.ts` — typed
  constants for future Recharts / canvas / inline-SVG.
- **Fonts:** `(public)/layout.tsx` loads its own `Lora` + `Cormorant
  Garamond` (V8 Trattoria editorial-serif duo) as
  `--font-homepage-body` / `--font-homepage-heading`. A storefront
  Lora weight change can't move admin.

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

Mockups live at `public/mockups/` — open `/mockups/` on any deploy.
