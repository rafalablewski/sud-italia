# Admin — Design System

The design language for the **back-office admin** — every `/admin/*` surface
that is *not* one of the Core modules. Core (POS, KDS, Guest = CRM +
Concierge + WhatsApp) is our IP and runs under its own theme — see the
Core theme docs for those surfaces; this doc covers the everything-else
that runs the business behind the till.

**Code is the source of truth.** The shell lives at
`src/components/admin/v2/AdminShell.tsx`; nav at
`src/components/admin/v2/nav.config.ts`; tokens at
`src/app/globals.css` (the `[data-admin-theme]` blocks).

## Scope

What this doc covers (the admin back-office):

| Section       | Pages                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Overview      | Dashboard, Orders                                                      |
| Operations    | Menu, Recipes, Slots, Floor                                            |
| Inventory     | Stock, Suppliers, Purchase orders                                      |
| People        | Staff, Schedule                                                        |
| Customers     | Customers, Loyalty, Corporate, Feedback                                |
| Finance       | Reports, Cash, Business costs, Calculator                              |
| Growth        | Campaigns, Upsell, Cross-sell, Scheduled bundles, Truck ops            |
| Intelligence  | Multi-location, Manage locations, Cohort & CLTV, LTV / CAC, Menu engineering, Insights, Expansion |
| System        | Users & roles, Compliance, Regulatory disclosures, Audit log, Capabilities, Currency, Languages, Settings |

What this doc does **not** cover:

- **Core modules** (POS, KDS, CRM, Concierge, WhatsApp) — the productised
  IP, documented under the Core theme. Operator-pressure surfaces with
  their own density rules.
- **Public storefront** (the guest ordering site) — documented under the
  Homepage theme.
- **Shared foundations** — there are none in the target architecture. Each
  theme owns its own colour, typography, material, and components. See
  the design-system root README for the three-theme doctrine.

## Shell

Every admin page renders inside `AdminShell` (`src/components/admin/v2/AdminShell.tsx`).
The shell owns:

- **Sidebar** — nav grouped by section per `nav.config.ts`. Sections are the
  taxonomy; do not invent new ones in-page.
- **Topbar** — page title, location switcher, theme toggle, command-palette
  trigger, notification bell, help.
- **Command palette** (`⌘K`) — keyboard-first navigation; every nav item
  appears here. New pages must add a `shortcut` letter where the section
  warrants it (single-key, lowercase).
- **Notification panel** — operator-facing alerts; never marketing.
- **Shortcuts help** (`?`) — auto-generated from `nav.config.ts`.
- **Mobile shell** — switches to `MobileShell` below the breakpoint; admin
  pages must work in both. Mobile-specific patterns live in
  [`mobile/`](./mobile/).

Login (`/admin/login`) is the only bare route — it renders without the shell.

## Theme + glass tokens

The admin runs under `[data-admin-theme="dark"]` (default) or
`[data-admin-theme="light"]`. The theme block defines `--bg`, `--surface-1`,
`--surface-2`, `--fg`, `--fg-muted`, `--border`, `--brand`, status colours,
and the command-palette tokens. JS/Recharts mirror lives in
`src/components/admin/v2/theme.ts`.

The glassmorphism utilities (`glass-card`, `glass-input`, `glass-btn`,
`admin-text`) are admin-scoped and read straight from `[data-admin-theme]`
tokens — never hard-code colours in a page.

## The portal rule (do not skip)

`.admin-bg > *` sets `position: relative; z-index: 1` on every direct child,
which creates a stacking context that **traps fixed-position elements**.
Every modal, drawer, popover, toast, or dropdown menu in admin must mount
via `createPortal(node, document.body)`. Relying on `z-index` alone will
silently break in production.

## Capabilities — the source of truth

`/admin/capabilities` (`src/app/admin/capabilities/page.tsx`) lists every
shipped feature with its env-var status (`live` / `needs-config` /
`disabled`). **Every new admin page, integration, or scheduled job must
register an entry in the same commit it ships in.** A feature that is not
listed there is invisible to operators — treat the missing entry as a bug.

## Page conventions

- **One `<h1>` per page**, set via the Topbar title prop — not in the page
  body.
- **Toggle = saved.** Toggles persist via `saveSettings()` on change; no
  separate "Save" button.
- **Glass cards group related controls;** never nest glass-cards.
- **Filters live at the top of the page**, never inside a card.
- **Empty states tell the operator what to do next**, not just "no data".
- **Tables**: sticky header, right-aligned numerics, hairline rows, no
  zebra striping.
- **Destructive actions** require a confirmation dialog (portalled).
- **Server data** is fetched via API routes — never import server modules
  in admin pages that are `"use client"` (`fs`, `next/headers`, Neon
  driver, etc.). See CLAUDE.md rule 3.

## Per-section design notes

Each admin section has its own design doc under [`sections/`](./sections/).
Progress:

- [`sections/operations.md`](./sections/operations.md) — menu, recipes (chain-wide rule), slots, floor, HACCP log, waste log, shift handover
- [`sections/inventory.md`](./sections/inventory.md) — stock, suppliers, POs, low-stock alerts during service
- [`sections/people.md`](./sections/people.md) — staff, schedule, role-gated visibility
- [`sections/customers.md`](./sections/customers.md) — customers, loyalty, corporate, feedback
- [`sections/finance.md`](./sections/finance.md) — reports, cash, business costs, calculator
- [`sections/growth.md`](./sections/growth.md) — campaigns, upsell, cross-sell, scheduled bundles, truck ops
- [`sections/intelligence.md`](./sections/intelligence.md) — multi-location, manage-locations, cohort/CLTV, menu engineering, AI insights, expansion
- [`sections/system.md`](./sections/system.md) — users & roles, compliance, regulatory disclosures, audit log, capabilities, currency, languages, settings

## Authority

When this doc and the code disagree, **the code wins** — open a PR to fix
the doc. When this doc and a Core-module rule disagree, the Core-module
rule wins inside that module's surface (POS/KDS density beats admin
density).
