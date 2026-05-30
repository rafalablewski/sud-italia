# Sud Italia — Mobile Navigation Architecture

> **⚠️ RETIRED — historical record.** The separate mobile-admin shell this
> document describes is no longer served; phones now render the responsive
> desktop layout 1:1. See [`README.md`](./README.md) for the retirement note.
> Kept for history — not the current spec.

**Date:** 2026-05-17
**Companion:** `design-system.md`, `ux-strategy.md`
**Implementation:** `src/components/admin/v2/mobile/BottomNav.tsx`, `MoreDrawer.tsx`, `MobileTopbar.tsx`, `QuickActionSheet.tsx`

---

## 1. Levels of navigation

Mobile uses **four** levels. Desktop has three (sidebar / breadcrumb / page-tabs). The fourth on mobile is the **gesture/contextual** layer (long-press, swipe, FAB-action).

```
Level 0 — Shell
  ├── MobileTopbar (page title + search + bell)
  └── BottomNav   (Home · Orders · [FAB] · Stock · More)

Level 1 — Page
  ├── PageHeader (subtitle, period switcher)
  └── StickyToolbar (filter chips, segment control)

Level 2 — Within-page sub-nav
  ├── Tabs (segment control or scrollable tabs)
  └── In-page sections + drill-in cards

Level 3 — Contextual
  ├── Swipe row actions
  ├── Long-press multi-select
  ├── FAB action sheet
  └── Bottom sheet detail / edit
```

---

## 2. BottomNav — the 5 + 1

```
┌─────────┬─────────┬───[FAB]──┬─────────┬─────────┐
│  Home   │ Orders  │  Quick   │  Stock  │  More   │
└─────────┴─────────┴──────────┴─────────┴─────────┘
```

Height: 64px (+ safe-area-inset-bottom). Each tab is a 56×64 hit area with icon (22px) + 11px label. Active tab uses a brand-soft pill background and brand-coloured icon.

### 2.1 Per-role mapping

The bottom nav adapts per `AdminRole` (from `/api/admin/me`). The four roles in `src/lib/admin-roles.ts` map as follows:

| Role | Tab 1 | Tab 2 | FAB | Tab 3 | Tab 4 |
|---|---|---|---|---|---|
| **owner** | Home (`/admin`) | Orders (`/admin/orders`) | Quick | Stock (`/admin/inventory`) | More |
| **manager** | Home | Orders | Quick | Stock | More |
| **staff** | Home | Orders | Quick | Customers (`/admin/customers`) | More |
| **kitchen** | KDS (`/admin/kds`) | Orders | Quick | Stock | More |

Tab choices follow the role's *primary daily action*. The "More" tab opens `MoreDrawer` listing every other nav item, grouped by section (same groups as the desktop sidebar).

The FAB is **the same widget for every role** — it opens `QuickActionSheet`. Its 6 actions are context-aware (see §4).

### 2.2 Pinning

Long-press any item in `MoreDrawer` → "Pin to bottom nav" → replaces the role's most-recently-pinned tab (excluding Home/More). Persisted to `localStorage` (`sud-admin-bottom-nav-pin`). This lets a manager who spends their day in Schedule pin it instead of Stock.

### 2.3 Active state rules

- Exact match for `/admin` → Home active.
- Prefix match for everything else (e.g., `/admin/orders` or `/admin/orders/x` both highlight Orders).
- More tab is active when the route is in MoreDrawer.

---

## 3. MoreDrawer — everything else

A bottom sheet ⅔ height. Search field at top, then sections (same groupings as `NAV_SECTIONS` in `nav.config.ts`), each section collapsible.

Order matches `nav.config.ts`. Section labels: Overview / Operations / Inventory / People / Customers / Finance / Growth / Intelligence / System.

A pinned star icon on each row toggles `Pin to bottom nav`. The currently-pinned tab is grayed out (can't pin twice).

The MoreDrawer also has a footer with: Location switcher (segmented), Theme toggle, Log out. This replaces the desktop sidebar's footer.

---

## 4. FAB & QuickActionSheet

Floating Action Button position: above bottom nav, right-aligned at 16px gutter, 56px round. Brand-coloured fill, brand-fg icon (`Plus` by default).

### 4.1 Context-aware default action

Tapping the FAB performs a context-appropriate **single action** when one obvious primary exists:

| Context | FAB single-action | Icon |
|---|---|---|
| Home | New order | `Plus` |
| Orders | New order | `Plus` |
| KDS | Bump all on current lane | `Check` |
| Stock | Quick adjust | `PackagePlus` |
| Customers | Add customer | `UserPlus` |
| Schedule | Add shift | `CalendarPlus` |
| Menu | Toggle 86 | `Power` |
| Suppliers / POs | New PO | `FileText` |
| Cash | Open till / drop | `Wallet` |
| Settings (etc.) | (none — FAB hidden) | — |

### 4.2 Swipe-up on FAB → QuickActionSheet

Universal 6-action sheet:

1. **New order** — opens mobile order builder
2. **Refund order** — opens command palette pre-filtered to orders
3. **Comp / discount** — opens command palette pre-filtered to orders
4. **Adjust stock** — opens stock sheet pre-filtered by recent items
5. **Reach customer** — opens command palette pre-filtered to customers + voice icon
6. **Open till** — cash session start (manager+)

Items respect `AdminRole`: staff don't see Open till; kitchen see only New order + Adjust stock + Reach customer.

---

## 5. MobileTopbar

48px tall. Sticks via `position: sticky; top: 0` so it disappears on scroll-down and returns on scroll-up (Tailwind `intersection-observer` polyfill via the existing `hooks` directory).

Layout:

```
┌───────────────────────────────────────────────┐
│  [Back / Logo]   Page title          🔍  🔔  │
└───────────────────────────────────────────────┘
```

- **Left:** Back button on a detail page (replaces logo). Logo "SI" mark on a list page (taps → Home).
- **Center:** Page title — auto-derived from `nav.config.ts` label, overridable via `PageHeader`'s `title` prop.
- **Right:**
  - Search icon → opens `MobileCommandPalette` full-screen.
  - Bell icon → opens `MobileNotifications` bottom sheet. Badge for unread (existing API `/api/admin/notifications?count=true`).

The location-switcher and theme-toggle move into `MoreDrawer` to keep the topbar at 2 right-side icons (thumb-zone math: a 6-icon topbar puts edge taps out of reach on a 6.7" phone).

---

## 6. Page-level navigation

### 6.1 PageHeader

Below the topbar (under the toolbar), each `MobilePage` may render a `<PageHeader>` with:

- Title (already in topbar at small scale — `PageHeader` is the larger billboard)
- Subtitle / context
- Right slot (e.g., DatePager, Refresh button)

When the user scrolls past the `PageHeader`, the topbar takes over the title (via an IntersectionObserver — the `PageHeader` sets `data-stuck` and the topbar swaps in the title).

### 6.2 StickyToolbar

Holds filter chips + segment controls. Sticks below the topbar at `top: 48px`. On scroll, it can collapse via `data-collapsed` (height 0 → reveal handle).

### 6.3 Sub-tabs

Mobile prefers `SegmentControl` (iOS-style) for ≤ 4 tabs. For more, `Tabs` (existing `v2/ui/Tabs`) is horizontally scrollable. Tab state persists in URL via query string (consistent with desktop).

---

## 7. Within-page actions

| Pattern | Where it lives |
|---|---|
| Primary action button | Sticky to bottom-right (FAB) or sticky to bottom of viewport (action bar in detail screens) |
| Secondary actions | Long-press → contextual menu OR overflow `⋯` in row trailing slot |
| Bulk actions | `QuickActionsBar` appears at bottom on multi-select. Shows count + 1–3 actions + "More" |
| Row-level destructive | Swipe-left reveals "Delete / Archive" with confirm-tap |
| Row-level primary | Swipe-right reveals "Refund / Bump / Receive" |
| Detail-screen actions | Sticky bottom action bar with 1–2 primary buttons + overflow |

---

## 8. Back-navigation rules

- **System back** (Android hardware back, iOS edge-swipe) — always pops the route.
- **Topbar back** button — present on **detail** screens (e.g., `/admin/customers/[phone]`, `/admin/menu/[baseSlug]`), absent on **list / home** screens.
- **Bottom sheets** — close on:
  - Tap on scrim
  - Drag-down past 40% of sheet height
  - Tap the X handle
  - System back

- **MoreDrawer** — close on tap on backdrop, drag-down, or system back. No back-stack entry created.

---

## 9. Deep links & state in URL

All existing query/hash patterns are preserved so a deep link works identically on mobile:

| Pattern | Effect |
|---|---|
| `/admin/orders#ORD_123` | Pushes detail sheet for order 123 |
| `/admin/orders?status=preparing&loc=krakow` | Filters list, chips reflect state |
| `/admin/menu/margherita` | Mobile menu detail screen |
| `/admin/customers/+48555111000` | Customer detail screen |

The mobile shell injects nothing into the URL it doesn't on desktop.

---

## 10. Search hierarchy

Three search surfaces:

1. **MobileCommandPalette** — global, all entities (`/api/admin/search`)
2. **In-page search** — embedded in `StickyToolbar`, scoped to the current list
3. **Notification search** — embedded at top of `MobileNotifications` sheet

The global palette is opened from the topbar search icon. The in-page search is a chip-style trigger that expands to an input field inline.

---

## 11. Stacked navigation pattern (list → detail)

Mobile uses **push navigation** (full-screen overlays) for detail screens, not in-place panes. Concretely:

- Tap a row in `MobileList` → router pushes the detail route (which renders a `MobilePage` with a Back button).
- Detail screens are real routes — they preserve back-stack semantics.
- Bottom sheets are *not* routes; they're transient overlays for edit/quick-action.

Rule of thumb: if it has data of its own and survives a refresh, it's a route. If it's a quick edit, it's a sheet.

---

## 12. Drawer vs sheet vs modal vs palette

| Surface | When | Examples |
|---|---|---|
| **MoreDrawer** | Listing nav items only | Reached from More tab |
| **BottomSheet** | Form / detail / picker, supports drag-down | Refund, comp, filter sheet, picker for select |
| **MobileCommandPalette** | Global search + jump | Reached from topbar search |
| **MobileNotifications** | Notification list | Reached from topbar bell |
| **Toast** | Transient feedback with Undo | After mutation |
| **Banner** | Persistent page-level alert | Offline mode, version-mismatch warning |
| **(Full-screen route)** | Anything else that needs scroll | Order detail, customer detail, menu detail |

We deliberately **do not** ship a generic `<Modal>` on mobile. Anything that would be a modal on desktop is either a route or a sheet.

---

## 13. Header / footer safe-area handling

```css
.v2-m-topbar     { padding-top: var(--m-safe-top); }
.v2-m-bottom-nav { padding-bottom: var(--m-safe-bottom); }
.v2-m-sheet      { padding-bottom: max(var(--m-pad-md), var(--m-safe-bottom)); }
.v2-m-fab        { bottom: calc(64px + 16px + var(--m-safe-bottom)); }
```

This handles iPhone notch + home indicator + Android nav bar in one ruleset.

---

## 14. Animation budgets

| Transition | Duration | Easing |
|---|---|---|
| Bottom sheet open | 220ms | iOS spring |
| Bottom sheet close | 180ms | ease-out |
| Tab change | 0 (instant) | — |
| Page push | 240ms slide-right | iOS spring |
| Page pop (back) | 200ms slide-left | iOS spring |
| FAB rotate (state change) | 200ms | iOS spring |
| Topbar hide/show on scroll | 180ms | ease |
| Pull-to-refresh ring fill | matches drag distance, 200ms snap on release | — |

All gated by `prefers-reduced-motion`.

---

## 15. Keyboard support (when a Bluetooth keyboard is attached)

Mobile + external keyboard → desktop shortcuts still work. `useShortcuts` is shell-level, so:

- `Cmd+K` opens `MobileCommandPalette` instead of the desktop palette (same content).
- `g + letter` shortcuts route into the mobile shell (same effect).
- `n` opens `MobileNotifications`.
- `?` shows a sheet listing shortcuts (only visible on mobile when a keyboard is attached, capability-detected).

---

## 16. Adoption matrix

Per-page mapping of how each route is reached on mobile:

| Route | Path to it |
|---|---|
| `/admin` | Home tab |
| `/admin/orders` | Orders tab |
| `/admin/kds` | KDS tab (kitchen role) or More → Overview → KDS |
| `/admin/menu` | More → Operations → Menu |
| `/admin/recipes` | More → Operations → Recipes |
| `/admin/slots` | More → Operations → Slots |
| `/admin/inventory` | Stock tab |
| `/admin/suppliers` | Stock screen → Suppliers sub-tab |
| `/admin/purchase-orders` | Stock screen → POs sub-tab |
| `/admin/staff` | More → People → Staff |
| `/admin/schedule` | More → People → Schedule |
| `/admin/customers` | More → Customers → Customers (or Customers tab if staff) |
| `/admin/loyalty` | More → Customers → Loyalty |
| `/admin/corporate` | More → Customers → Corporate |
| `/admin/feedback` | More → Customers → Feedback |
| `/admin/whatsapp` | More → Customers → WhatsApp |
| `/admin/reports` | More → Finance → Reports |
| `/admin/cash` | More → Finance → Cash |
| `/admin/growth` | More → Growth → Campaigns |
| `/admin/upsell` | More → Growth → Upsell |
| `/admin/crosssell` | More → Growth → Cross-sell |
| `/admin/scheduled-bundles` | More → Growth → Scheduled bundles |
| `/admin/truck` | More → Growth → Truck ops |
| `/admin/locations` | More → Intelligence → Multi-location |
| `/admin/locations/manage` | More → Intelligence → Manage locations |
| `/admin/reports/cohort` | More → Intelligence → Cohort |
| `/admin/ai` | More → Intelligence → Insights |
| `/admin/expansion` | More → Intelligence → Expansion |
| `/admin/users` | More → System → Users (owner) |
| `/admin/compliance` | More → System → Compliance |
| `/admin/audit-log` | More → System → Audit log |
| `/admin/capabilities` | More → System → Capabilities |
| `/admin/settings` | More → System → Settings |

Plus: command palette from anywhere reaches every route.
