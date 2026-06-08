# Core — the proprietary operating system

The productised IP. Three customer-facing surfaces the truck actually
runs on:

- **POS** (`/core/pos`) — cashier order-entry with the coursing model + tab rail
- **KDS** (`/core/kds`) — kitchen display, role triad, coursing-aware tickets
- **Guest** — the unified guest hub: CRM (customer book), Loyalty (member
  roster + wallets + redemptions), Concierge (AI capability layer + EU-14
  allergen matrix), WhatsApp (inbox + funnel)
- **Service** (`/core/service`) — the merged Floor + Slots surface, on the
  Core suite shell. Two nested routes: **Floor** (`/core/service/floor`, live
  room + twin) and **Slots** (`/core/service/slots`, capacity + demand). The
  Book console moved to the Guest hub (`/core/guest/book`); the old
  `/admin/floor` and `/admin/slots` stub pages were deleted.

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
- **Shell:** `<CoreShell>` (`src/core/shell/CoreShell.tsx`)
  renders **one unified chrome shared by all four surfaces** (POS, KDS,
  Guest, Service) as a fixed full-viewport layer — **no sidebar**. Core is
  a separate entity from `/admin`: the shell renders none of the admin
  shell (no `.app-sidebar`, no `nav.config`, no `/admin` links). Its header
  is two rows — row 1 = brand + the primary `<CoreNav>` switcher
  (POS · KDS · Guest · Service, with emoji glyphs — 🧾 · 🍳 · 🙋 · 🍽️ — the
  same emoji language as the POS category rail) + global
  actions; on the Guest hub those actions are `<GuestHeaderActions>`
  (WhatsApp live/off status badge + Funnel · Settings · Broadcast, routing to
  the Inbox where the dialogs live); row 2 = an eyebrow + the
  surface's `viewnav` sub-tabs + that surface's own controls. KDS rides the
  same shell with its **dark wall body** (`.kds-core.in-shell`) under the
  light header; its fullscreen kiosk still drops the chrome for the bare
  wall. The suite owns the top-level `/core/*` segment (`/core/guest`,
  `/core/pos`, `/core/kds`, `/core/service`); its own
  `src/app/core/layout.tsx` loads the Admin + Core theme CSS and
  `CoreProviders` (`src/app/core/CoreProviders.tsx`) supplies the data
  providers (location, toast, shell context).
- **Surfaces:** **POS** (`/core/pos`, `pos.html`) and the **Guest
  Engagement hub** (`/core/guest`, five nested-route views Inbox · Guests ·
  Loyalty · Concierge · Book — the old `/admin/crm`, `/admin/loyalty`,
  `/admin/concierge`, `/admin/whatsapp` stub pages were deleted) render on the
  `.core-suite` theme.
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
