# Core — the proprietary operating system

The productised IP. Three customer-facing surfaces the truck actually
runs on:

- **POS** (`/admin/pos`) — cashier order-entry with the coursing model + tab rail
- **KDS** (`/admin/kds`) — kitchen display, role triad, coursing-aware tickets
- **Guest** — the unified guest hub: CRM (customer book), Concierge (AI
  capability layer + EU-14 allergen matrix), WhatsApp (inbox + funnel)

Core is a **separate theme**. It does not inherit from Admin or Homepage,
and changes to those themes must not leak into Core. The doctrine is the
WordPress model: each theme is a self-contained instance.

## Layout

```
core/
├── README.md          ← you are here
├── theme/             ← Core-only tokens: color, type, material, components
└── modules/
    ├── pos.md
    ├── kds.md
    ├── guest.md       ← the unified Guest hub
    ├── crm.md         ← module under Guest
    ├── concierge.md   ← module under Guest
    ├── whatsapp.md    ← module under Guest
    └── receipt-printer.md  ← ESC/POS receipt printing + go-live guide
```

## What ships today

- **CSS:** `src/app/themes/core/index.css` (1,443 lines). JS-imported
  by `src/app/admin/layout.tsx` so it ships only on `/admin/*` routes,
  not on the storefront.
- **JS-side mirror:** `src/app/themes/core/theme.ts` exposes the
  `--cmd-*` palette as typed constants (no JS consumers today; future
  Recharts / canvas code imports from here).
- **Fonts:** inherited from `admin/layout.tsx` (`--font-admin-body` /
  `--font-admin-display`). Core surfaces don't use Fraunces — the
  display serif is admin / homepage territory.
- **Surfaces:** POS, KDS, CRM, Concierge, WhatsApp all live at
  `/admin/{module}` but render the Core CSS, not admin chrome,
  because their wrapping divs use `.kds-atlas` / `.pos-tabs` /
  `.crm-atlas` / `.cncrg-atlas` / `.wa-atlas` (all scoped to the
  Core block).

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc. When Core and Admin rules disagree on a Core surface, **Core
wins** (operational clarity on the line outranks back-office consistency).
