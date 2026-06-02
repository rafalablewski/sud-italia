# Core — the proprietary operating system

The productised IP. Three customer-facing surfaces the truck actually
runs on:

- **POS** (`/core/pos`) — cashier order-entry with the coursing model + tab rail
- **KDS** (`/core/kds`) — kitchen display, role triad, coursing-aware tickets
- **Guest** — the unified guest hub: CRM (customer book), Loyalty (member
  roster + wallets + redemptions), Concierge (AI capability layer + EU-14
  allergen matrix), WhatsApp (inbox + funnel)
- **Service** (`/core/service`) — the merged Floor + Slots surface, on the
  Core suite shell. Three views: **Book** (dine-in slot + table in one step),
  **Floor** (live room + twin), **Slots** (capacity + demand). The old
  `/admin/floor` and `/admin/slots` redirect in (`?view=floor|slots`).

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
    ├── loyalty.md     ← module under Guest
    ├── concierge.md   ← module under Guest
    ├── whatsapp.md    ← module under Guest
    ├── service.md     ← the merged Floor + Slots surface
    └── receipt-printer.md  ← ESC/POS receipt printing + go-live guide
```

## What ships today

The live Core surfaces are being rebuilt 1:1 onto the **core-suite
mockup** design (`public/mockups/core-suite/`):

- **Theme:** `src/app/themes/core/suite.css` — a 1:1 port of the mockup's
  `system.css` (+ per-page layout styles), mostly scoped under
  `.core-suite`. Generic class names (`.card` / `.btn` / `.badge` /
  `.shell`) live only inside that scope. Uses Fraunces (display) +
  JetBrains Mono via the admin next/font vars. `suite.css` **also** holds
  the rebuilt **desktop KDS** (`.kds-core` — Fleet / Floor / Chef).
  `src/app/themes/core/index.css` now backs **only the Mobile KDS**
  (`.kds-atlas` / `.ka-*`) plus the WhatsApp dialog `.wa-*` chrome.
- **Shell:** `<CoreShell>` (`src/components/admin/core/CoreShell.tsx`)
  renders the mockup's SI sidebar + topbar as a fixed full-viewport layer
  for POS + Guest. KDS is full-bleed with its own dark top bar (no
  sidebar). The suite owns the top-level `/core/*` segment
  (`/core/guest`, `/core/pos`, `/core/kds`, `/core/service`); its own
  `src/app/core/layout.tsx` loads the Admin + Core theme CSS and
  `CoreProviders` (`src/app/core/CoreProviders.tsx`) supplies the data
  providers (location, toast, shell context). There is no admin chrome to
  step aside — unlike the old `/admin/*` placement, where AdminShell did.
- **Surfaces:** **POS** (`/core/pos`, `pos.html`) and the **Guest
  Engagement hub** (`/core/guest`, four views Inbox · Guests · Loyalty ·
  Concierge — the old `/admin/crm`, `/admin/loyalty`, `/admin/concierge`,
  `/admin/whatsapp` redirect in) render on the `.core-suite` theme.
  **KDS** (`/core/kds`, `kds*.html`) is the full-screen kitchen-wall
  display.
- **Guest hub views:** the cross-view switcher (`<GuestViewNav>`) rides
  the CoreShell topbar `.viewnav`; Inbox = `AdminWhatsApp`, Guests =
  `AdminCrm`, Loyalty = `AdminLoyalty`, Concierge = `AdminConcierge`, each
  a body inside one shell.

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc. When Core and Admin rules disagree on a Core surface, **Core
wins** (operational clarity on the line outranks back-office consistency).
