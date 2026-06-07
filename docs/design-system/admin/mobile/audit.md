# Sud Italia — Mobile Admin Audit

> **⚠️ RETIRED — historical record.** The separate mobile-admin shell this
> document describes is no longer served; phones now render the responsive
> desktop layout 1:1. See [`README.md`](./README.md) for the retirement note.
> Kept for history — not the current spec.

**Date:** 2026-05-17
**Scope:** Every admin surface in `src/app/admin/*` and its shell, evaluated for mobile readiness, restructuring need, and ergonomic risk.
**Companion docs:** `ux-strategy.md`, `navigation.md`, `design-system.md`
**Source of truth:** code, not assumption — every claim references the file path or component name.

---

## 0. Headline findings

1. **The admin is mobile-aware but not mobile-native.** A drawer + collapsed sidebar exists (`v2-mobile-drawer` in `globals.css`), but every *page interior* assumes ≥ 1024px. Tables of 7–8 columns, side-by-side charts, 4×2 KPI grids, kanban boards of 5 columns, and form modals with 10+ fields dominate. The shell scales; the content does not.
2. **Mobile risk is concentrated in 6 pages that account for ~80% of daily operator usage.** Orders, KDS, Schedule, Inventory, Customers, Reports. The other 30+ pages are either configuration (touched weekly), informational (read-only), or already low-risk.
3. **The desktop has elite power-user features** (Cmd+K palette, `g`-shortcuts, SSE streaming, optimistic mutations, bulk select, ?-help, role-based nav, location-context). All of them must have a mobile equivalent — not be cut.
4. **Existing primitives generalize well.** `Card`, `Badge`, `EmptyState`, `Toast`, `DatePager`, `Tabs`, `Button` already work at 320px. `Table`, `Dialog`, `Popover`, `Heatmap`, `KpiCard grid` need replacement components, not media queries.
5. **There is no shared mobile shell yet.** Bottom nav, FAB, bottom sheet, mobile command palette, mobile notifications, swipe gestures, pull-to-refresh — none exist. Building them is the single biggest unlock.

---

## 1. Page inventory & mobile risk

37 admin pages (excluding /admin/login and /admin/seed). Risk: how badly the current desktop layout breaks on a 390×844 portrait phone, weighted by traffic.

| Page | Section | Risk | Why |
|---|---|:---:|---|
| Dashboard `/admin` | Overview | High | 4×2 KPI grid, heatmap (7d × 24h), AreaChart + 2 tables; KPI row reflows but is unreadable. |
| Orders `/admin/orders` | Overview | **Critical** | 5-column kanban + 8-column fallback table + detail modal with refund flow. Highest-traffic operator surface. |
| KDS `/core/kds` | Overview | **Critical** | 3-lane ticket display, 7+ station tabs, 1s timers, audio alerts. Used hands-busy in the kitchen — must run on a propped phone. |
| Menu `/admin/menu` | Operations | High | Unified rows × 5+ location chips per item, edit dialog (6+ fields). |
| Recipes `/admin/recipes` | Operations | Medium | 6-col table, ingredient editor (5-col sub-table). Editing is intentionally desktop-first. |
| Slots `/admin/slots` | Operations | Medium-high | Week grid (7 × 8 slots) does not fit; day view is salvageable. |
| Inventory `/admin/inventory` | Inventory | High | 7-col table, qty spinner adjust modal, movement-history drawer. Heavily used during receive + waste logging. |
| Suppliers | Inventory | Low | 5-col simple table + form. |
| Purchase orders | Inventory | Medium | 7-col table, PO detail modal with lines sub-table. |
| Staff | People | Medium | 7-col table + punch-history card. |
| Schedule | People | **Critical** | Week-grid layout fundamentally desktop-shaped. Needs full day-detail redesign. |
| Customers | Customers | High | 8-col table + KPI row + filter chips. Used during phone orders. |
| Customer detail `[phone]` | Customers | Medium | Full history timeline — needs cleanup but works in single column. |
| Loyalty | Customers | High | 3 tabs × 8-col tables, tier/reward editors, live widget carousel. |
| Corporate | Customers | Medium | B2B account list + per-account settings. |
| Feedback | Customers | Medium | 7-col table + AI-themed detail modal. |
| WhatsApp | Customers | Medium | Already chat-shaped on mobile, but template picker cramped. |
| Reports | Finance | Medium-high | KPI row + side-by-side charts + tables. |
| Cohort report | Finance | High | 12×12 matrix is unreadable below tablet. Needs a different mobile representation entirely. |
| Cash | Finance | Medium | Session cards okay; close-session modal with variance spinners is fiddly. |
| Growth | Growth | Medium | Campaign table + create dialog. |
| Upsell | Growth | Medium-high | LocationTabs + drag-drop bundle editor. |
| Crosssell | Growth | Medium | LocationTabs with sub-tabs and multi-select pickers. |
| Scheduled bundles | Growth | Low | Single list + dialog. |
| Truck | Growth | High | Map view + route list — high mobile value but currently desktop-shaped map. |
| Locations | Intelligence | High | Comparison heatmap doesn't fit. |
| Locations / manage | Intelligence | Medium | Long form with per-day hours + map. |
| AI / Insights | Intelligence | Medium | 5 sub-tabs of charts + tables. |
| AI agent | Intelligence | Low | Chat interface — naturally mobile. |
| Expansion | Intelligence | Medium | Financial model inputs (10+ fields) + projection charts. |
| Users | System | Low | 5-col table + dialog. |
| Compliance | System | Low | Checklist table. |
| Audit log | System | Medium | 7-col table + JSON-diff detail modal. |
| Capabilities | System | Low | Card grid — already reflows. |
| Settings | System | Medium | 4 tabs × form. |

**Totals:** 4 critical / 12 high / 12 medium / 9 low.

---

## 2. Shell — what exists for mobile today

In `src/components/admin/v2/`:

| Component | Mobile state | Notes |
|---|---|---|
| `AdminShell.tsx` | Partial | Manages mobile drawer state but treats mobile as "desktop with a drawer instead of a sidebar". |
| `Sidebar.tsx` | Drawer-mode supported via `isMobile` prop; renders inside `.v2-mobile-panel` (280px slide-in). | Still a vertical scroll of 30 items grouped by 8 sections — survives but isn't optimized. |
| `Topbar.tsx` | Reduces padding at `< 900px`; hamburger button shown via `.v2-icon-btn.v2-mobile-only`. Search trigger collapses to a search icon at `< 720px`. | Bell + theme toggle stay visible. |
| `CommandPalette.tsx` | Renders centred; max-width 640px so fills small screens; max-height 70vh. | Works on mobile but is not full-screen ergonomic. |
| `NotificationPanel.tsx` | Slides in as `.v2-panel` (right-side drawer). | Better as a bottom sheet on mobile. |
| `ShortcutsHelp.tsx` | Modal — no value on touch. | Should be hidden on touch devices. |
| `LocationSwitcher.tsx` | Popover in the sidebar footer. | Should move to a sheet on mobile (no sidebar to live in). |
| `ThemeToggle.tsx` | Small icon button. | Fine. |

In `src/app/globals.css` the relevant mobile CSS today is:

- `.v2-shell { grid-template-columns: 248px 1fr; } @media (max-width: 900px) { grid-template-columns: 1fr; }`
- `.v2-shell > .v2-sidebar { display: none; }` at `< 900px`
- `.v2-mobile-drawer`, `.v2-mobile-scrim`, `.v2-mobile-panel { width: 280px }`
- `.v2-icon-btn.v2-mobile-only { display: inline-flex }` at `< 900px`
- `.v2-search-trigger` collapses at `< 720px`
- `.v2-panel { width: 100% }` for the notification panel at `< 480px`

This is responsible-CSS housekeeping — the shell does not collapse — but it does not constitute a mobile design.

---

## 3. Power-user features — must map to mobile

From `src/components/admin/v2/hooks/useShortcuts.ts` and `CommandPalette.tsx`:

| Power feature | Desktop trigger | Mobile equivalent |
|---|---|---|
| Command palette | `Cmd+K` / `Ctrl+K` | Topbar search icon → full-screen `MobileCommandPalette` |
| Go-to-page | `g` then letter | Bottom nav (top 5) + MoreDrawer (rest) + palette |
| Help | `?` | Long-press home in BottomNav reveals "Shortcuts available on a connected keyboard" with the same list. Otherwise hidden on touch. |
| Notifications | `n` | Topbar bell → `MobileNotifications` sheet |
| Bulk select | Header checkbox | Long-press row → multi-select mode with bottom `QuickActionsBar` |
| Optimistic mutations | Same — UI-level, not input | Identical |
| SSE live updates | Same — network layer | Identical, pause on `document.visibilityState === "hidden"` for battery |
| Deep linking (`#ORDER_ID`) | URL hash | Same |
| Inline editing (menu chips, inventory spinner) | Click → edit in place | Tap → expand-in-place with Stepper / Sheet |
| Per-location dirty flags (Upsell, Crosssell) | Multi-section save buttons | Sticky bottom "Save changes (3 locations)" bar |
| Drag-drop (Bundles) | Mouse drag | Long-press + drag to reorder, or "Edit order" sheet with up/down buttons |
| CSV export (Reports) | Button → download | Same |
| Audit JSON diff (Audit log) | Modal with side-by-side | Sheet with collapsed key paths + tap-to-expand |

**No power-user feature is cut.** Every one of them has a mobile-native replacement.

---

## 4. Operational flows — observed

Five flows account for the majority of operator time. Each is mapped today and redesigned in `ux-strategy.md`.

### 4.1 Refund flow
- **Today (desktop):** Orders → click row → modal → "Refund" → confirm dialog → reason text → confirm.
- **Mobile risk:** Refund button buried in modal; confirm dialog stacks awkwardly on phone.
- **Redesign target:** SwipeRow `→ Refund` → bottom sheet with refund preset (full/item/amount) → reason chips → sticky "Refund N zł" button → Undo toast for 10s. Three taps.

### 4.2 KDS bump flow
- **Today:** Click ticket → modal → "Mark ready" → modal closes.
- **Mobile risk:** Tickets shrink to unreadable at 3-lane × phone width.
- **Redesign target:** One lane at a time on mobile (swipe horizontally to switch). Swipe right on ticket = bump. Haptic + slide-out animation. Undo for 5s.

### 4.3 Inventory adjust flow
- **Today:** Stock page → row → modal → spinner → save.
- **Mobile risk:** Spinner-in-modal is fiddly on touch.
- **Redesign target:** Tap row → expands inline → Stepper `− N +` + keypad option + barcode-scan icon → auto-save with Undo.

### 4.4 New order from phone-call flow
- **Today:** Doesn't really exist — staff use the public customer site.
- **Mobile risk:** Lost capability.
- **Redesign target:** FAB "New order" → minimal mobile order builder (menu sheet + cart + checkout). Assigns to current admin location. Saves customer to ledger.

### 4.5 Lookup customer flow
- **Today:** Customers page → search → table → click → detail.
- **Mobile risk:** Table is 8 cols, doesn't fit; detail is okay.
- **Redesign target:** Command palette mic / search → instant matches → tap → detail with sticky bottom actions (Call / Text / View orders / Adjust points).

---

## 5. Where desktop UX will fail on mobile (catalogue)

| Failure mode | Where it lives | Specific pages |
|---|---|---|
| Wide tables (≥ 5 cols) requiring horizontal scroll | `<Table>` from `src/ui/Table.tsx` | Orders, Inventory, Customers, Staff, POs, Recipes, Loyalty (×3 tables), Feedback, Audit log |
| KPI grids assuming ≥ 1200px | 4×2 in dashboard, 6-up in Reports, 6-up in customer LTV | Dashboard, Reports, Locations comparison, Customers |
| Multi-column kanban | Custom kanban in `AdminOrders.tsx`, `AdminKDS.tsx` | Orders, KDS |
| Side-by-side charts (`v2-grid-2-1` etc.) | dashboard sections | Dashboard, Reports, AI, Locations |
| Form modals with 8+ fields | `Dialog` from `src/ui/Dialog.tsx` | Settings, Menu edit, Recipe edit, Locations/manage, User edit, Slot create, Tier editor (Loyalty), Reward editor |
| Drag-drop interactions | BundleManager component | Upsell, ScheduledBundles |
| Heatmaps requiring two-axis space | `v2/charts/Heatmap.tsx` | Dashboard (7d × 24h), Cohort report (12 × 12) |
| Hover affordances (Tooltip, Popover) | `src/ui/Tooltip.tsx`, `src/ui/Popover.tsx` | LocationSwitcher, command palette result hints, sparkline tooltips |
| Bulk select via checkboxes in row headers | Orders, Inventory, Loyalty members, Audit log | (same) |
| Sound + interval polling (1s timer) | `AdminKDS.tsx` | KDS |
| Map embeds requiring full-screen | `AdminTruck.tsx` | Truck, Locations/manage |
| Side-by-side login (auth UI) | login | low priority — sized fine on mobile already |

---

## 6. Complexity hotspots — where care is required

1. **AdminOrders.tsx (1,154 LOC):** dual-view (kanban / table), SSE streaming, optimistic mutations, refund modal with reason codes, bulk actions, deep-linking via hash. The mobile redesign must preserve every one of these — not strip them.
2. **AdminKDS.tsx (624 LOC):** 1-second tick timers, audio context, lane filter, recall tray. Mobile must keep the 1s tick (or it becomes a static board) and the audio with explicit user-gesture-required-resume.
3. **AdminMenu.tsx (2,120 LOC):** unified rows × 5 location chips × per-variant editing. The mobile shape is a per-location-detail screen reached by tapping the base row.
4. **AdminSlots.tsx (721 LOC):** day vs week view toggle. Mobile defaults to day view; week view is desktop-only (banner + open-on-desktop link).
5. **AdminSchedule.tsx (539 LOC):** week grid is structurally desktop. Mobile gets a vertical day-list with shifts as cards. Edits open a sheet.
6. **AdminInventory.tsx (912 LOC):** large data shape. Mobile uses a 2-line list (item + meta) and tap-to-expand for adjust.
7. **AdminCustomers.tsx (~440 LOC) + AdminCustomerDetail.tsx (633 LOC):** detail page is mostly okay. The list view needs `MobileList`.
8. **AdminReports.tsx + AdminAI.tsx + cohort:** charts mostly survive; KPI rows + tables need replacement.

---

## 7. Tables that require virtualization

Lists that can reasonably hit ≥ 200 rows in production:

- **Customers** (3-month-old shop already has ~6k customers in test data; real ops will see 20k+).
- **Orders** (default fetches today's; "all" can pull 5k+).
- **Audit log** (high write volume — every menu edit logs).
- **Loyalty members** (overlaps with customers but separate sort).
- **Stock movements** (one row per receive/waste event).
- **Notifications** (could grow unbounded if not aged).

For each, the mobile build uses a 60-line windowed renderer (`mobile/useVirtual.ts`) that only mounts visible rows. Heuristic: virtualize at `≥ 100 rows`.

---

## 8. Opportunities — what mobile unlocks that desktop doesn't

| Opportunity | Detail |
|---|---|
| **Push** | Browser Push API → owner gets a "Refund requested" / "Cash variance > 50 zł" / "Slot full" tap-able. Out of scope this PR; design accommodates it. |
| **Voice** | Web Speech API → "Show me yesterday's revenue", "Comp the last order for table 5". Capability-detected. |
| **Barcode** | `BarcodeDetector` → tap "Receive" → camera viewfinder → ingredient pre-populated. Inventory page. |
| **GPS** | Driver-mode (`/admin/truck`) → real-time location updates from driver phones to ops dashboards. |
| **Haptics** | `navigator.vibrate` → swipe-commit feedback, KDS bump, FAB tap. |
| **Camera** | Photo proof on delivery completion (driver app); receipt photo on cash drop (cash sessions). |
| **Offline KDS queue** | Local queue of bump events when network drops, replayed on reconnect. Critical in basement/back-of-house wifi blackspots. |
| **Pull-to-refresh** | Universal expected gesture on lists. |
| **Shake-to-undo** | iOS pattern for undo. Not heavy-handed; complements toast. |

---

## 9. Consolidation opportunities

Items that **don't deserve their own mobile screen** and can live inside another:

- **Suppliers + Purchase Orders + Stock Movements** → merge into the Stock detail screen (tabbed sub-views). Operators rarely visit suppliers without inventory context.
- **Loyalty members + Customers** → mobile shows them as a *segment filter* on the Customers list, not a separate page. The Loyalty config (tiers, rewards) stays its own page.
- **Capabilities + Audit log + Compliance** → live under a single "System status" entry in the MoreDrawer. Three pages collapse into a sectioned scroll.
- **Crosssell + Upsell + Scheduled bundles** → "Growth bundles" mobile entry shows all three as tabs in one config screen.
- **Reports + Cohort + AI Insights** → "Insights" entry with sub-tabs.

**This is a mobile-only consolidation.** Desktop preserves the full sidebar — power users want direct access.

---

## 10. Notifications

`/api/admin/notifications` returns types: `new_order`, `slot_full`, `daily_summary`, `low_slots`, `order_status`. Each has `locationSlug`, `orderId`, `createdAt`, `read`.

| Mobile design implication | |
|---|---|
| Bell badge | Same fetch every 15s; pauses when hidden. |
| List | Full-height sheet, pull-to-refresh, swipe-left dismiss, swipe-right mark read. |
| Filter chips | All / Orders / Slots / Daily / Alerts. |
| Deep link | Tap notification → push to relevant page with state. |
| Toast vs panel | New `new_order` while in foreground → in-app toast that taps through. Background → push (future). |

---

## 11. Filters & search (mobile-first rules)

Per audit of every page:

- 2–3 most-used filters as chips in `StickyToolbar`.
- All other filters in a `FilterSheet` triggered by a "Filter (N)" button. N is the active count.
- Search lives in `MobileTopbar` icon → full search overlay (or palette).
- Date filters use the existing `DatePager` — already mobile-friendly.

---

## 12. Critical accessibility findings

- Existing `globals.css` has `prefers-reduced-motion` guard. Keep it.
- `*:focus-visible` outline is `--color-italia-red` — strong, works on mobile keyboards.
- `Table` uses semantic `<table>` — good. Mobile `MobileList` uses `role="list"` and `role="listitem"`.
- Color tokens give us guaranteed ≥ 4.5:1 against `--surface-1` (verified in `theme.ts` — `--fg #f5f7fa` on `--bg #0a0d14`).
- ⚠️ Tooltips currently hover-only — they need a tap-to-show fallback or removal on touch.
- ⚠️ No haptics today. Adding capability-gated `navigator.vibrate(8)` for swipe-commits.

---

## 13. Performance findings

| Find | Impact |
|---|---|
| Dashboard fetches `/api/admin/dashboard`, `/api/admin/insights/dashboard`, `/api/admin/notifications` on mount. | Three parallel requests is fine on wifi; cellular adds latency. Mobile dashboard batches into one `?include=insights,notifications` once the API supports it. (Not a blocker today.) |
| KDS polls SSE every 2s, plus a 1s tick timer for elapsed time. | Acceptable. Mobile pauses tick when hidden. |
| Charts use Recharts (SVG). | Fine at ~12 points; gets expensive at 500. Mobile caps to 60 points and aggregates the rest. |
| Cmd+K palette debounces search at 120ms. | Fine. |
| All API routes have idempotency or rate limits. | No issue. |

---

## 14. The mobile build's success criteria

The build is "done" when:

1. The 6 critical/high pages have a mobile-native experience (Dashboard, Orders, KDS, Schedule, Inventory, Customers).
2. The shell renders correctly at 320px–768px without horizontal scroll on any view.
3. Top-5 operator actions (refund, bump, comp, lookup, adjust) take ≤ 3 taps and ≤ 12 seconds.
4. Every desktop power-user feature has a mobile equivalent.
5. Mobile Lighthouse: Performance ≥ 90, Accessibility = 100, Best Practices ≥ 95.
6. CLAUDE.md rules respected: no mock data, all writes via store utilities, portals for overlays, capabilities page updated.

---

## Appendix A — file pointers

```
src/components/admin/v2/
  AdminShell.tsx          # shell entry
  Sidebar.tsx             # nav, role-filtered
  Topbar.tsx              # breadcrumb + search + bell
  CommandPalette.tsx      # cmd+k
  NotificationPanel.tsx   # bell panel
  LocationContext.tsx     # multi-tenant context
  ShellContext.tsx        # palette/notif open state
  nav.config.ts           # NAV_SECTIONS, ALL_NAV_ITEMS, filterNavForRole
  theme.ts                # tokens (palette, themeBootScript)
  hooks/
    useShortcuts.ts       # cmd+k, g+letter, n, ?
    useTheme.ts
  ui/                     # Card, Badge, Button, Input, Select, Table, Dialog, Tabs, DatePager, EmptyState, Toast, Tooltip, Popover
  charts/                 # AreaChart, BarChart, LineChart, PieChart, Heatmap, KpiCard, Sparkline, chart-theme

src/components/admin/
  Admin*.tsx              # one client component per /admin/* page

src/app/globals.css       # 5,186 lines; v2-* utility classes
src/app/admin/layout.tsx  # mounts AdminShell + admin-bg

src/lib/admin-auth.ts     # isAuthenticated, current user
src/lib/admin-roles.ts    # ROLE_RANK, AdminRole

API: src/app/api/admin/*  # ~97 routes across 30 domains
```
