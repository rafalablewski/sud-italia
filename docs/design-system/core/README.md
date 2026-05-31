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

The live Core surfaces are being rebuilt 1:1 onto the **core-suite
mockup** design (`public/mockups/core-suite/`):

- **Theme:** `src/app/themes/core/suite.css` — a 1:1 port of the mockup's
  `system.css` (+ per-page layout styles), scoped under `.core-suite`.
  Generic class names (`.card` / `.btn` / `.badge` / `.shell`) live only
  inside that scope. Uses Fraunces (display) + JetBrains Mono via the
  admin next/font vars. `src/app/themes/core/index.css` still backs the
  KDS `.kds-atlas` / `.ka-*` / `.cmd-*` chrome (the kitchen-wall surface).
- **Shell:** `<CoreShell>` (`src/components/admin/core/CoreShell.tsx`)
  renders the mockup's SI sidebar + topbar as a fixed full-viewport layer
  for POS + Guest. KDS is full-bleed with its own dark top bar (no
  sidebar). `AdminShell` steps its chrome aside for `CORE_ROUTES`
  (`/admin/guest`, `/admin/pos`, `/admin/kds`) while keeping the data
  providers.
- **Surfaces:** **POS** (`/admin/pos`, `pos.html`) and the **Guest
  Engagement hub** (`/admin/guest`, three views Inbox · Guests ·
  Concierge — the old `/admin/crm`, `/admin/concierge`, `/admin/whatsapp`
  redirect in) render on the `.core-suite` theme. **KDS** (`/admin/kds`,
  `kds*.html`) is the full-screen kitchen-wall display.
- **Guest hub views:** the cross-view switcher (`<GuestViewNav>`) rides
  the CoreShell topbar `.viewnav`; Inbox = `AdminWhatsApp`, Guests =
  `AdminCrm`, Concierge = `AdminConcierge`, each a body inside one shell.

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc. When Core and Admin rules disagree on a Core surface, **Core
wins** (operational clarity on the line outranks back-office consistency).
