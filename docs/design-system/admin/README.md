# Admin — Design System

> ⚠️ **v2 is retired.** The admin back-office now runs on **v3**, mounted at
> the canonical `/admin` route (there is **no** `/admin-v3` URL — admin is
> always one; the v3 rebuild is the swappable *implementation* under
> `src/app/admin/(shell)/*` + `src/admin-v3/*`; see [`v3/README.md`](./v3/README.md)).
> The old v2 component tree (`src/components/admin/`) was
> deleted. The shared base stylesheet lives on as `src/app/themes/base/index.css`
> (it backs the staff/kitchen/terminal portals + Core — the login door moved to
> av3, see [`v3/README.md`](./v3/README.md) → Auth door). The component/shell sections
> below describe the **now-deleted v2** set and are pending a cleanup pass —
> treat them as historical until then.

The design language for the **back-office admin** — every `/admin/*` surface
that is *not* one of the Core modules. Core (POS, KDS, Guest = CRM +
Loyalty + Concierge + WhatsApp) is our IP and runs under its own theme — see
the Core theme docs for those surfaces; this doc covers the everything-else
that runs the business behind the till.

> **Floor + Slots are now Core, not admin.** They were merged and rebuilt on
> the Core suite theme as the **Service** surface (`/core/service/{floor,slots}`,
> nested routes; booking moved to `/core/guest/book`); the old `/admin/floor`
> and `/admin/slots` stub pages were deleted. Their anatomy lives under
> the Core theme ([`../core/modules/service.md`](../core/modules/service.md)),
> no longer here.

**Code is the source of truth.** The shell lives at
`src/components/admin/v2/AdminShell.tsx`; nav at
`src/components/admin/v2/nav.config.ts`; tokens at
`src/app/globals.css` (the `[data-admin-theme]` blocks).

## Scope

What this doc covers (the admin back-office):

| Section       | Pages                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Overview      | Dashboard, Orders                                                      |
| Operations    | Menu, Recipes, HACCP log, Waste log, Shift handover (Slots + Floor merged into the Core **Service** surface) |
| Inventory     | Stock, Suppliers, Purchase orders                                      |
| People        | Staff, Schedule                                                        |
| Customers     | Customers, Corporate, Feedback, Pulse surveys                          |
| Finance       | Reports, Cash, Business costs, Calculator                              |
| Growth        | Campaigns, Upsell, Cross-sell, Scheduled bundles, Events & bookings, Integrations |
| Intelligence  | Multi-location, Manage locations, Cohort & CLTV (+ sandbox), LTV / CAC (+ sandbox), Menu engineering (+ sandbox), Insights, Expansion |
| System        | Users & roles, Permission matrix, Compliance, Regulatory disclosures, SOC 2 controls, Audit log, Capabilities, Payments, Currency, Languages, Settings |

What this doc does **not** cover:

- **Core modules** (POS, KDS, CRM, Loyalty, Concierge, WhatsApp) — the
  productised IP, documented under the Core theme. Operator-pressure
  surfaces with their own density rules. (Loyalty moved here from the
  admin Customers section — it's now the 4th Guest-hub view.)
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
- **Access gating** — the sidebar filters items by the session's effective
  permissions (`filterNavForPermissions` for owners + custom-grant users;
  `filterNavForRole` for role-default users), and the shell runs a client
  page guard that bounces a custom-grant user away from a surface they
  lack. Both read `/api/admin/me` and mirror the server gate in
  `withAdmin`. The full granular-permission model — the 70-key catalog
  (`src/lib/permissions.ts`), role-default presets, owner-only granting,
  and the call-site defence-in-depth gates — lives in
  [`sections/system.md`](./sections/system.md#granular-permissions-action-level-rbac).
- **Responsive shell (one layout, all viewports)** — the `v2-shell` chrome is
  served on **every** screen size. Below 900px the sidebar collapses into the
  hamburger drawer (`Topbar` → `v2-mobile-drawer`) and pages reflow via their
  own `@media (max-width: 720px)` rules; there is no separate phone UI. Admin
  is **1:1 across phone / tablet / desktop**. The old divergent `MobileShell`
  (bottom-nav + per-page `Mobile*` components) has been **deleted** —
  `useIsMobile()` is gone and `AdminShell` renders one chrome for every width.
  See [`mobile/`](./mobile/) for the historical shape + the deletion note.

Login (`/admin/login`, the owner-only admin door) is the only bare route
*inside* the admin shell — it renders without the chrome. The universal team
door `/login`, the PIN `/terminal`, the `/manager` portal and the `/franchisee`
portal are separate top-level routes outside the AdminShell, but they are
**still admin-themed**: each ships its own `layout.tsx` that loads the Admin
theme CSS + admin fonts and wraps children in a single
`<div id="admin-portal-root" className="… admin-bg">` (the same pattern as
`/kitchen`), so the shared `LoginForm`, the PIN keypad and the portal
dashboards render with the real glass tokens rather than unstyled (see System →
Login surfaces). **The `id="admin-portal-root"` is load-bearing, not just a
portal mount:** these layouts carry no theme-boot script, so `<html>` never
gets `[data-admin-theme]` and the `--font-ui` / `--font-display` tokens only
re-resolve from the element's `--font-admin-*` next/font vars at the
`#admin-portal-root` scope (see [theme → typography](./theme/typography.md) /
`themes/base/index.css`). Drop the id and `.admin-bg` falls back to its generic
`var(--font-ui, "Inter", …)` stack — the bundled Inter / Fraunces never load.

The `/admin` HQ dashboard is **owner-only** (gated server-side in
`src/app/admin/page.tsx`): a non-owner who reaches it is redirected to their own
home via `landingPathForRole`. A **manager** lands on `/manager` — a scoped
overview (today's revenue / orders / covers / who's on shift, derived live from
real orders + shifts) with quick links into the operational pages their
permissions grant. The wall is only around the HQ root; managers keep their
permission-scoped tools.

### Role-prefixed back-office URLs

The admin pages live once under `src/app/admin/*`, but each role navigates them
under **its own URL prefix** so the path reads as *their* space, not "admin":
the owner stays on `/admin/*`, a manager sees `/manager/*`, a franchisee
`/franchisee/*`. `/manager/:path+` and `/franchisee/:path+` are **Next.js
rewrites** onto `/admin/:path+` (`next.config.ts`) — one source of truth, only
the visible URL changes (the `/manager` + `/franchisee` *portal* pages, exact
paths, are not rewritten). The contract lives in **`src/lib/admin-base.ts`**
(`adminBaseForPath` / `adminBaseForRole` / `withAdminBase`) + the client hook
`src/components/admin/v2/useAdminBase.ts`:

- The **shell** re-roots every link onto the current prefix — `useNavSections`
  (sidebar items), `Sidebar` (brand), `CommandPalette` (page + search jumps),
  `Topbar` breadcrumbs, the `g`-then-key shortcuts, and every intra-page
  navigation (customer / order / menu links, notification deep-links). So a
  manager who opens an order stays on `/manager/orders#…`, never `/admin`. The
  `/admin/capabilities` ledger (a server component) re-roots its links the same
  way, from the role server-side (`adminBaseForRole(user.role)`).
- `permissionForAdminPage` **normalises** any prefix back to `/admin` before the
  permission lookup, so the gate is prefix-agnostic.
- `AdminShell` runs a **convergence redirect** as the safety net: a non-owner who
  still lands on a canonical `/admin/*` URL (a typed URL, an old bookmark, the
  full nav on a `/core` surface) is re-rooted onto their own prefix. Owner is a
  no-op. The pages are identical either way (same rewrite target).

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
via `createPortal`. Relying on `z-index` alone will silently break in
production.

**Portal target: `#admin-portal-root`, not `<body>`.** The shared v2 overlays
(`Dialog` / `ConfirmDialog` / `InfoButton` / `Popover` / `Tooltip` / `Toast`)
use the `adminOverlayTarget()` helper (`src/ui/portal.ts`), which returns the
admin layout wrapper `#admin-portal-root` and falls back to `<body>`. That
wrapper is an *ancestor* of `.admin-bg` (so overlays still escape the trap)
**and** the element that carries the `--font-admin-*` next/font vars. It also
repairs the font tokens (in `themes/base/index.css`) so the admin subtree
renders in the right typefaces. Why repair is needed: `--font-ui` /
`--font-display` are declared up on `[data-admin-theme]` (`<html>`) as
`var(--font-admin-body|display), …`, but the `--font-admin-*` vars only exist on
`#admin-portal-root`, and a `var()` inside a custom property resolves at the
element where it's *declared* — so the tokens compute **empty** on `<html>` and
inherit down empty, making every `font-family: var(--font-ui)` /
`var(--font-display)` rule silently fall back to the browser-default serif. The
fix re-declares both tokens on `#admin-portal-root` (so consumers like the shell
and the sidebar brand wordmark resolve — wordmark → Fraunces, body → Inter) and
*also* sets `font-family: var(--font-admin-body), …` directly on the wrapper, so
overlays portaled in (siblings of `.v2-shell`, with no `--font-ui` rule of their
own) inherit Inter. Portaling to `<body>`
escapes the trap but lands *outside* the admin font scope, so the overlay
renders serif. Use the helper for any new admin overlay. (Mobile's
`BottomSheet` / `MobileCommandPalette` mount inside `MobileShell`, which is
itself in-scope.)

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

- [`sections/operations.md`](./sections/operations.md) — menu, recipes (chain-wide rule), HACCP log, waste log, shift handover (slots + floor merged into the Core Service surface — `../core/modules/service.md`)
- [`sections/inventory.md`](./sections/inventory.md) — stock, suppliers, POs, low-stock alerts during service
- [`sections/people.md`](./sections/people.md) — staff, schedule, role-gated visibility
- [`sections/customers.md`](./sections/customers.md) — customers, corporate, feedback, Pulse surveys (NPS board) (loyalty moved to the Core Guest hub — see `../core/modules/loyalty.md`)
- [`sections/finance.md`](./sections/finance.md) — reports, cash, business costs, calculator
- [`sections/growth.md`](./sections/growth.md) — campaigns, upsell, cross-sell, scheduled bundles, events & bookings
- [`sections/intelligence.md`](./sections/intelligence.md) — multi-location, manage-locations, cohort/CLTV, menu engineering, AI insights, expansion
- [`sections/system.md`](./sections/system.md) — users & roles, compliance, regulatory disclosures, audit log, capabilities, currency, languages, settings

## Authority

When this doc and the code disagree, **the code wins** — open a PR to fix
the doc. When this doc and a Core-module rule disagree, the Core-module
rule wins inside that module's surface (POS/KDS density beats admin
density).
