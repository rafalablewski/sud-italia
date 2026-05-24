# Sud Italia — Mobile Admin UX Strategy

**Date:** 2026-05-17
**Companion docs:** `audit.md`, `navigation.md`, `design-system.md`
**Implementation:** `src/components/admin/v2/mobile/*`, `src/components/admin/mobile/*`

---

## 0. The Strategic Question

> If a manager on a Friday-night rush only has 10 seconds and one hand, what does the dashboard need to show them, and what does it need to do for them?

That is the brief. Everything below cascades from that sentence.

The current desktop admin is excellent for a back-office operator with a 24" monitor and a coffee. It is hostile to a kitchen manager with greasy hands, a phone in a stand, a chef yelling over a fryer, and a refund question from a customer at the counter. Mobile is not a "smaller version" of this product — it is a **different operational mode**.

---

## 1. Operator personas — re-grounded for mobile

### 1.1 The Owner (Rafal)
- On the floor 30% of the time, at home 30%, in transit 40%.
- Wants: daily snapshot in 5 seconds, alert when something breaks, deep dive when something looks interesting.
- Mobile uses: 60% of admin usage **starts** on mobile.
- Pain on current admin: pinching, scrolling, no quick "what changed?" surface.

### 1.2 The Manager-on-shift
- Always on the floor.
- Wants: refunds in 10s, customer lookup in 5s, comp in 8s, schedule swap in 30s.
- Mobile uses: 90% of all dashboard time.
- Pain on current admin: tables don't fit, modal dialogs trap them in awkward layouts, primary actions buried in dropdowns.

### 1.3 The Kitchen lead
- Hands wet, can't touch keys. Has a phone propped at 45° in a Posiflex holder.
- Wants: bump tickets, see prep times, flag 86 items.
- Pain on current admin: KDS columns require pinch-zoom; tap targets too small.

### 1.4 The Driver / Delivery coordinator
- In a car.
- Wants: see active deliveries, next pickup, call customer, mark delivered.
- Pain on current admin: doesn't really have a mobile-suitable driver surface today.

### 1.5 The Off-shift owner / investor
- Wants intelligence, not operations. Reports, cohort, AI insights, expansion.
- Mobile uses: 30%.
- Pain: dense desktop dashboards are unreadable in line at coffee shop.

---

## 2. Mobile information architecture

### 2.1 The "Now / Today / Always / Settings" hierarchy

We restructure the 30+ admin pages into four mental buckets that map to phone-shaped attention:

| Bucket | What lives here | Where in the nav |
|---|---|---|
| **Now** | What needs my attention in the next 60 minutes (orders, KDS, alerts, low stock). | Bottom nav: Home tab + Orders tab + KDS tab |
| **Today** | What I touch every shift (customers, inventory, schedule, cash). | Bottom nav: Stock + (Customers via swap) + Quick FAB |
| **Always** | Configuration that only changes weekly/monthly (menu, suppliers, growth, loyalty, settings). | MoreDrawer → grouped sections |
| **Insight** | Reports, AI, cohort, expansion, capabilities. | MoreDrawer → "Intelligence" section + Home's "Drill in" cards |

This is the same logic as Toast's home/orders/menu structure, the same as Square's home/transactions/items split, but tuned to our 30-page surface.

### 2.2 The bottom nav (5 + 1)

```
┌─────────┬─────────┬───[FAB]──┬─────────┬─────────┐
│  Home   │ Orders  │  Quick   │  Stock  │  More   │
└─────────┴─────────┴──────────┴─────────┴─────────┘
```

Tabs are role-filtered (see `navigation.md` for the matrix). The FAB is **context-aware**:

| Current screen | FAB action |
|---|---|
| Home / Orders | New order |
| KDS | Mark all on this lane bumped |
| Customers | Add customer / SMS broadcast |
| Stock | Quick adjust / Receive PO |
| Schedule | Add shift |
| Menu | Toggle 86 / Edit price |
| Default | "Quick action" sheet with 6 system-wide actions |

### 2.3 Home = Single-screen command center

The Home tab is fundamentally redesigned. Sections (in scroll order):

1. **Pulse strip** — one-line live status: orders open, prep avg, alerts count. Tappable each.
2. **KPI pager** — swipeable hero stats (revenue today, orders, AOV, margin, labour ratio, cancel %, repeat %). Single hero per page, dots indicate position. Replaces desktop's 8-card grid.
3. **Action queue** — prioritized list of things that need a human: low-stock alerts, refund requests, slot pressure, schedule gaps. Each is a swipe-actionable row.
4. **Trend card** — one chart, period segment control above.
5. **By location** — segmented card showing per-location comparison.
6. **Drill in** — sectioned grid linking to deeper analytics (reports, cohort, AI, expansion).

The first 3 sections **must fit above the fold** on a 390×844 iPhone. The owner sees the most actionable signal in one glance.

---

## 3. Reorganized flows (the redesigns)

### 3.1 Refund flow

**Current (desktop):** Orders page → click row → modal → click "Refund" → confirm dialog → reason text → confirm again.

**Mobile redesigned:**
- Orders list → swipe row right → "Refund" action revealed → tap → bottom sheet with refund preset (full / item / amount) → optional reason chips → "Refund 42.50 zł" sticky button → swipe down to dismiss / Undo toast for 10s.
- 3 taps. No modal. Reversible.

### 3.2 KDS bump flow

**Current:** Click ticket → modal pops up → click "Mark ready" → modal closes.

**Mobile redesigned:**
- Ticket card visible in lane → swipe right to bump → haptic + animation → optimistically removed → Undo for 5s.
- 1 gesture. No modal. Recoverable.

### 3.3 Inventory adjustment flow

**Current:** Stock page → find item → click row → modal → type new quantity → save.

**Mobile redesigned:**
- Stock list → tap row → expands inline → stepper `– N +` → keypad option for big changes → barcode scan icon for batch receive → auto-save on blur with Undo.
- 0 modals. Always-visible quick-adjust.

### 3.4 Comp / discount flow

**Current:** Find order → modal → comp item / amount → reason → confirm.

**Mobile redesigned:**
- Long-press order row → menu → "Comp" → bottom sheet → segment (item / amount / %) → keypad → reason chips ("Wrong order", "Slow", "Goodwill") → "Apply" → Undo.

### 3.5 Schedule swap flow

**Current:** Schedule page → grid view → find employee → click cell → modal → pick new staff.

**Mobile redesigned:**
- Schedule day view → tap shift card → bottom sheet shows shift detail + "Swap / Drop / Edit" → tap Swap → list of eligible staff sorted by availability → tap to commit.

### 3.6 Customer lookup flow

**Current:** Customers page → search box → results table → click → detail page.

**Mobile redesigned:**
- Quick-action FAB → "Lookup customer" or `Cmd-K` opens command palette → type 3+ chars (or phone digits) → instant matches → tap → full-screen detail with primary actions stuck to bottom (Call / Text / View orders / Adjust points).

### 3.7 Order ahead / phone order flow

**Current:** Doesn't exist as a streamlined flow — staff use the customer site.

**Mobile added:**
- FAB → "New order" → mobile order builder (menu sheet + cart drawer + 3-step checkout) → assigns to current location.
- A genuine new capability for staff phone orders.

---

## 4. Adaptive component strategy

A page does **not** simply re-flow on mobile. It swaps components. Concretely:

| Desktop component | Mobile component | Reasoning |
|---|---|---|
| `<Table>` (multi-column) | `<MobileList>` (one row, 2 lines) | Tables ≥ 4 cols don't survive 390px. |
| KPI grid (4-up or 8-up) | `<StatRow>` swipeable pager | One hero stat per glance beats 8 squashed tiles. |
| Sidebar | `<BottomNav>` + `<MoreDrawer>` | Bottom nav is thumb-reachable; sidebar isn't. |
| Filter bar | `<FilterSheet>` + chip strip | Filter bar consumes vertical space; sheet doesn't. |
| `<Dialog>` | `<BottomSheet>` | Modals from the bottom are easier to dismiss. |
| `<Popover>` | `<BottomSheet>` or inline | Popovers don't position well on small screens. |
| Heatmap | `<HeatmapStrip>` | Two-axis heatmaps require width. |
| Multi-line chart | Single-line chart + segment switcher | Mobile screens fit one series cleanly. |

**Rule of thumb:** if a desktop component requires ≥ 600px to read, it gets a mobile-specific replacement, not a media query.

---

## 5. Gesture system

| Gesture | Where | Action |
|---|---|---|
| Tap | Everywhere | Primary action |
| Long-press | List rows | Enter multi-select; or contextual menu |
| Swipe left | Order/customer/stock row | Reveal destructive action (Cancel / Archive / Delete) |
| Swipe right | Same | Reveal primary action (Refund / Bump / Receive) |
| Swipe up on FAB | Anywhere | Reveals action sheet of 6 system actions |
| Swipe down on sheet | Sheets | Dismiss |
| Pull-to-refresh | All list views | Reload page data |
| Two-finger pinch | Charts | Zoom into time range |
| Edge swipe back | iOS | Back navigation |

We never **require** a gesture for a feature — every gesture has a visible UI fallback (a button, a menu item, a chip).

---

## 6. Command palette mobile adaptation

The desktop palette is great. On mobile, it becomes:

- **Trigger:** Top-bar search icon, or shake-to-search (capability-detected), or `/` on a Bluetooth keyboard.
- **Layout:** Full-screen sheet, search field large at top under a status bar.
- **Voice:** Mic icon for Web Speech API where available.
- **Suggested:** Top section shows recent actions and popular jumps for the current page.
- **Search:** Same `/api/admin/search` endpoint — orders, customers, menu, ingredients.
- **Actions:** Below jumps, actions like "Refund order #1234", "Adjust stock for Caprese", "Set 86 on Margherita". Same engine as the FAB action sheet.

---

## 7. Notifications

Mobile-native expectations:

- Full-height sheet, **not** a desktop dropdown.
- Each notification is a row with: icon (color-coded by type), title, time, and a single right-side action (View / Mark read / Dismiss).
- Swipe left to dismiss, swipe right to mark read.
- A "Filter" chip strip at top (All / Orders / Slots / Alerts).
- Pull-to-refresh re-fetches `/api/admin/notifications`.
- A "Mark all read" pill in the header.

The unread badge follows you across every screen (top-bar bell).

---

## 8. Loading, error, empty philosophy

| State | Mobile rule |
|---|---|
| **Loading first paint** | Skeleton that matches the final layout. No spinners. |
| **Reloading existing data** | Inline shimmer on the data band. No full-screen lock. |
| **Empty** | Friendly state with one action ("Add first supplier", "Connect WhatsApp"). Reuse `EmptyState`. |
| **Error** | Banner at the top of content area + retry button. No alerts. Never a stack trace. |
| **Optimistic action** | Apply immediately, show Undo toast for 8s. If failed, rollback and toast the error. |
| **Slow network** | After 2s, show a single non-blocking shimmer. After 8s, replace skeleton with "Still loading…" + Cancel button. |

---

## 9. Operator-first ergonomic rules

1. **Primary action lives in the thumb zone.** Bottom of screen, never top.
2. **Destructive on the left, productive on the right.** Mirrors RTL muscle memory across iOS / Android.
3. **Numeric input gets a real keypad.** Not the QWERTY-with-numbers row.
4. **Forms split into stages.** A 12-field form becomes a 3-step wizard.
5. **Defaults are pre-selected.** "Refund full" should be the default, not blank.
6. **Reasons are chips, not free text.** Free text is the escape hatch, not the default.
7. **Long actions are reversible.** No "are you sure?". Use Undo.
8. **Currency is locale-aware.** `zł` in Polish locale, with tabular numerics.
9. **Time is relative on lists, absolute on detail.** "3m ago" in a row; "12:42, May 17" in detail.
10. **Status is a chip + icon + label.** Color alone never communicates state.

---

## 10. Visual identity continuity

Mobile **must not** look like a different product. The continuity is enforced by:

- Same color tokens (`--brand`, `--surface-1`, status colors).
- Same Inter font, same JetBrains Mono for numbers.
- Same chart palette and curve weights.
- Same iconography (lucide-react throughout).
- Same micro-radius / shadow rhythm (just one notch tighter).
- Same "SI" brand mark in the topbar.
- Same dark-default ethos with light opt-in.

Where mobile diverges intentionally is **density** (denser type, tighter padding) and **rhythm** (bigger touch targets for tappable surfaces, smaller for content).

---

## 11. The metrics that matter

We will judge the mobile admin against:

| Metric | Target | Why |
|---|---|---|
| Time-to-first-meaningful-paint | < 1.4s on 4G | The owner glances at it 40× a day. |
| Time-to-refund | < 12s end-to-end | Toast benchmark is ~15s. |
| Time-to-bump (KDS) | < 1.5s per ticket | Faster than desktop click-modal-confirm. |
| Time-to-customer-lookup | < 8s | From "I want to find Anna" to her profile. |
| Tap count for top 5 actions | ≤ 3 taps | Refund, bump, comp, lookup, adjust. |
| Operator error rate | < 1.5% | Misclicks resulting in a wrong action. |
| Daily-active mobile sessions / total | > 70% | Mobile-first means mobile is the primary surface. |
| Lighthouse mobile performance | ≥ 90 | We measure it. |
| Mobile Lighthouse accessibility | 100 | Non-negotiable. |

We do not ship a feature that misses these targets for the top 5 actions.

---

## 12. What does **not** belong on mobile

Not every feature deserves a mobile UI. The following are **desktop-only** (mobile shows an "Open on desktop" banner with a deep link):

- Menu image editor (heavy editing UX)
- Recipe builder (drag-drop ingredient lists)
- Schedule full-grid edit mode (use day-detail flow on mobile)
- Cohort analysis matrix (data density too high for 390px)
- Capabilities page (system-status, low ergonomic value on the go)

Mobile users **can read** these screens, but the editing affordance is gated to a desktop with a helpful suggestion to switch.

---

## 13. Sequencing

| Phase | Scope | Status |
|---|---|---|
| **0** | Mobile shell (BottomNav, MobileTopbar, MoreDrawer, useIsMobile, page padding tokens). | Implemented in this branch. |
| **1** | Mobile Home, Orders, KDS, Stock, Customers. | Implemented in this branch. |
| **2** | Mobile Reports, Loyalty, Schedule, Cash, Feedback, Inventory deep view. | Foundation ready; remaining pages auto-inherit shell. |
| **3** | Mobile-specific power features: voice command palette, barcode receive, offline KDS queue. | Hooks in place, capability-gated. |
| **4** | Driver app surface (`/admin/truck`) — geo + push. | Out of scope for this PR. |
| **5** | Native shell (Capacitor) for push + biometric — only after Phase 1 metrics validate the redesign. | Future. |
