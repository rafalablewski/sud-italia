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
    └── whatsapp.md    ← module under Guest
```

## Today vs target

**Target:** Core renders under its own theme scope, owns its own CSS file,
owns its own font loading, and a change to the Admin theme leaves Core
visually unchanged.

**Today:** Core surfaces live at `/admin/pos`, `/admin/kds`,
`/admin/crm`, `/admin/concierge`, `/admin/whatsapp` and render under the
Admin theme (`[data-admin-theme="dark"|"light"]` in
`src/app/globals.css`). Fonts come from the single
`src/app/layout.tsx`. Until the code split lands, "Core theme" is
documented intent, not enforced reality — see
`../README.md#today-vs-target` for the gap list.

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc. When Core and Admin rules disagree on a Core surface, **Core
wins** (operational clarity on the line outranks back-office consistency).
