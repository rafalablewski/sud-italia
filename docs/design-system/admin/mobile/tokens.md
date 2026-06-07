# Sud Italia — Mobile Admin Design System

> **⚠️ RETIRED — historical record.** The separate mobile-admin shell this
> document describes is no longer served; phones now render the responsive
> desktop layout 1:1. See [`README.md`](./README.md) for the retirement note.
> Kept for history — not the current spec.

**Date:** 2026-05-17
**Scope:** Mobile-only design tokens, primitives, patterns, ergonomics
**Foundation:** Extends `src/components/admin/v2/` (theme.ts, ui/*, charts/*) — does NOT replace the desktop system
**Implementation:** `src/components/admin/v2/mobile/*` + `.v2-m-*` CSS namespace

---

## 0. Design Principles

| # | Principle | Translation into code |
|---|---|---|
| 1 | **Operator over visitor** | Density wins over whitespace. Every screen optimizes "next action" not "wow factor". |
| 2 | **Thumb-first, one-hand** | Primary actions live in the bottom 1/3 of the viewport. Secondary actions can be pulled into the thumb zone via swipe. |
| 3 | **Survives the rush** | Hit targets ≥ 44×44pt. No "are you sure?" on cancellable actions (use Undo toast). State changes have haptic-style micro-animations under 200ms. |
| 4 | **Kitchen-safe** | High-contrast surfaces, no thin lines, no hover states. KDS view runs fine through grease film on a propped-up phone. |
| 5 | **Preserve identity** | Same brand red (`#c8102e`), same dark glass surfaces, same chart palette, same Inter/JetBrains Mono pairing. No "mobile" theme — it's the same admin, mobile-shaped. |
| 6 | **Power-user equality** | Every desktop power-user feature (bulk actions, filters, command palette, shortcuts) has a mobile-native equivalent — no second-class mobile. |
| 7 | **Adaptive, not responsive** | Mobile gets different *components*, not just narrower columns. The desktop `<Table>` becomes a `<MobileList>`. Filters become a bottom sheet. KPIs become a swipeable pager. |
| 8 | **Glance-able** | The dashboard answers "what's wrong right now?" in the first 6 seconds. Color, motion, and one bold number — never a paragraph. |

---

## 1. Tokens

All mobile components inherit `[data-admin-theme]` tokens from `globals.css`. The mobile namespace adds the following:

### 1.1 Spacing — 4px grid, mobile rhythm

```css
--m-pad-xs: 6px;
--m-pad-sm: 10px;
--m-pad-md: 14px;        /* default card padding */
--m-pad-lg: 18px;        /* page padding */
--m-pad-xl: 24px;        /* hero / large card */
--m-gap-xs: 6px;
--m-gap-sm: 10px;
--m-gap-md: 14px;
--m-gap-lg: 18px;

--m-page-pad-x: 16px;    /* horizontal page gutter */
--m-page-pad-top: 12px;
--m-page-pad-bottom: 96px; /* clears bottom nav (64) + safe area */

--m-safe-bottom: env(safe-area-inset-bottom, 0px);
--m-safe-top:    env(safe-area-inset-top, 0px);
```

### 1.2 Touch — Apple HIG + Material safety net

```css
--m-touch-min:       44px;  /* never smaller */
--m-touch-default:   48px;  /* primary actions */
--m-touch-comfy:     56px;  /* FAB, KDS cards */
--m-thumb-bottom:    88px;  /* "thumb zone" floor */
```

### 1.3 Surfaces — same dark palette, mobile-tuned elevation

```css
--m-card-bg:       var(--surface-1);
--m-card-bg-soft:  var(--surface-2);
--m-card-border:   var(--border);
--m-card-radius:   14px;        /* tighter than desktop's 16 */
--m-sheet-radius:  20px 20px 0 0;
--m-fab-radius:    18px;
--m-pill-radius:   var(--radius-pill);

--m-elev-1: 0 1px 2px rgba(0,0,0,.25);
--m-elev-2: 0 4px 14px rgba(0,0,0,.35);
--m-elev-3: 0 12px 40px rgba(0,0,0,.50);
--m-elev-sheet: 0 -8px 32px rgba(0,0,0,.45);
```

### 1.4 Type ramp — denser than desktop

Mobile uses one notch smaller than desktop for body text (we have less width to play with) but **larger** for KPI hero numbers (they're the focal point).

| Token | px | Usage |
|---|---|---|
| `--m-text-2xs` | 11 | meta, microcopy |
| `--m-text-xs`  | 12 | secondary labels |
| `--m-text-sm`  | 13 | body, table cells |
| `--m-text-base`| 14.5 | default UI text |
| `--m-text-md`  | 16 | item titles, list rows |
| `--m-text-lg`  | 18 | section heads |
| `--m-text-xl`  | 22 | page title |
| `--m-text-hero`| 32 | single hero KPI |
| `--m-text-mega`| 44 | KDS ticket number |

### 1.5 Motion — fast, on-purpose

```css
--m-dur-instant: 80ms;   /* taps, toggles */
--m-dur-fast:    160ms;  /* sheets opening */
--m-dur-base:    220ms;  /* page transitions */
--m-dur-slow:    320ms;  /* hero entries */
--m-ease:        cubic-bezier(0.32, 0.72, 0, 1);   /* iOS spring */
--m-ease-out:    cubic-bezier(0.22, 0.61, 0.36, 1); /* exit */
```

All motion respects `prefers-reduced-motion`. Sheets and FABs collapse to instant fade.

### 1.6 Z-index ladder

```css
--m-z-content:    1;
--m-z-sticky:     5;
--m-z-fab:        20;
--m-z-bottom-nav: 30;
--m-z-topbar:     40;
--m-z-sheet:      60;
--m-z-toast:      70;
--m-z-palette:    80;
--m-z-modal:      100;
```

All overlays use `createPortal(node, document.body)` per CLAUDE.md Rule #4.

---

## 2. Component Inventory

### 2.1 Shell

| Component | File | Role |
|---|---|---|
| `MobileShell` | `mobile/MobileShell.tsx` | Replaces AdminShell on `< 900px`. Renders MobileTopbar + content + BottomNav. Wraps with LocationProvider/Toast/etc. |
| `MobileTopbar` | `mobile/MobileTopbar.tsx` | 48px tall. Page title + 2 right actions (search, bell). Hides on scroll-down, returns on scroll-up. |
| `BottomNav` | `mobile/BottomNav.tsx` | 5 tabs + center "Quick" FAB. Tabs are role-filtered. Active state with brand pill. |
| `QuickActionSheet` | `mobile/QuickActionSheet.tsx` | Bottom sheet from FAB. 6 context-aware actions (New order, Refund, Adjust stock, Comp, Open till, Reach customer). |
| `MoreDrawer` | `mobile/MoreDrawer.tsx` | Slide-up sheet listing all nav items not pinned to bottom nav, grouped by section, searchable. |
| `MobileCommandPalette` | `mobile/MobileCommandPalette.tsx` | Full-screen on mobile. Voice button. Recent + suggested + searchable. |
| `MobileNotifications` | `mobile/MobileNotifications.tsx` | Full-height sheet. Pull-to-refresh. Swipe to dismiss. |

### 2.2 Layout primitives

| Component | Purpose |
|---|---|
| `MobilePage` | Sets page padding, scrollable content area, sticky page header. |
| `PageHeader` | Page title + optional subtitle + right slot. Falls back to MobileTopbar's title when stuck. |
| `StickyToolbar` | Sticks below MobileTopbar. Holds filter chips + segment control. Animates with topbar. |
| `Section` | Section header with optional action link. |
| `EmptyState` | Reuses `src/ui/EmptyState` — already mobile-friendly. |

### 2.3 Data display

| Component | Replaces | Notes |
|---|---|---|
| `MobileList` | `<Table>` | Vertical, one row per item, 2-line layout (title + meta). Supports swipe actions left/right. |
| `MobileListRow` | `<tr>` | The atom. Title, subtitle, trailing metric, status chip, leading icon. |
| `MobileCard` | `<Card>` | Slightly tighter padding, no hover transform. |
| `StatRow` | KPI grid (desktop has 8-up) | Horizontal swipeable pager of KPIs. Dots indicate position. Single KPI per page is hero-sized. |
| `Stat` | atom | One KPI: label + value + delta + sparkline. |
| `MetricStack` | summary | Vertical 1×3 or 2×2 grid for at-a-glance triplets. |
| `AdaptiveChart` | `AreaChart`/`BarChart` | Forces 220px height, hides axes when crowded, taps to reveal point. |
| `MicroChart` | Sparkline | 36px tall, used inside list rows. |
| `HeatmapStrip` | Heatmap | Time-only band, single row of 24 hours. |

### 2.4 Input & forms

| Component | Notes |
|---|---|
| `MobileInput` | `font-size: 16px` (prevents iOS zoom). Pill or block variant. |
| `MobileSelect` | Opens a native-style bottom sheet picker, not OS dropdown. |
| `Stepper` | `–  N  +` 56px control for quantity / portion / discount %. |
| `SegmentControl` | iOS-style two-to-four option segment, used for tabs/filters. |
| `Chip` | Filter chip — toggleable, removable, count badge. |
| `FilterSheet` | Bottom sheet holding all filters for a list view. Apply / Reset footer. |
| `DatePager` | Reuse existing `DatePager` — already touch-friendly. |
| `SearchField` | Inline or as the topbar's full-width replacement when active. |
| `KeypadField` | Numeric keypad for cash / discount / quantity. |

### 2.5 Actions & feedback

| Component | Notes |
|---|---|
| `PrimaryFab` | Round 56px floating action button. Position: bottom-right above BottomNav. |
| `QuickActionsBar` | Sticky bottom toolbar replacing per-row actions during bulk selection. Shows count + 1–3 primary actions + "more". |
| `SwipeRow` | Reveals left (destructive) + right (primary) actions on swipe. Threshold 35% commits. |
| `LongPressMenu` | Long-press a row → contextual popover with up to 5 actions. |
| `Toast` | Reuse `src/ui/Toast`. Bottom-positioned with Undo affordance. |
| `Banner` | Inline page-level alert. Dismissible. |
| `ConfirmSheet` | Replaces ConfirmDialog. Slides up with hero text and a single destructive button. |

### 2.6 KDS-specific

| Component | Notes |
|---|---|
| `KdsTicket` | Tall card. Order #, time-in (counts up), table/customer, item list, prep timer. Swipe right = bump (mark ready). Swipe left = recall. |
| `KdsLane` | Horizontal lane of tickets, sticky lane title, count chip. |
| `KdsTimerRing` | Circular progress around prep time vs target. Red after target. |
| `KdsAisle` | Mobile mode: only one lane shown at a time, swipe horizontally to change lane. |

### 2.7 Charts & viz — adaptive

| Existing chart | Mobile behavior |
|---|---|
| `AreaChart` / `LineChart` | Height drops to 200, axes auto-collapse, X-axis shows only first/last/peak when 7+ points. |
| `BarChart` | Rotates to **horizontal** bars on mobile (labels are wider than heights). |
| `PieChart` | Becomes a stacked 1-px bar by default; tap to expand to true pie sheet. |
| `Heatmap` | Switches to a strip view: average per hour, single row. Tap a column to expand to full day. |
| `KpiCard` | Width: 100%. Stacks label / hero value / delta / hint vertically. |
| `Sparkline` | Embedded in list rows at 36px height. |

---

## 3. Patterns

### 3.1 Navigation pattern: 5+1 bottom nav

The **5 tabs** are role-derived. The **+1 center FAB** is contextual:

- Owner / Manager: `Home · Orders · KDS · Stock · More` + Quick
- Staff: `Home · Orders · Customers · Stock · More` + Quick
- Kitchen: `KDS · Orders · Stock · More` + Quick (4 tabs, FAB recenters)

The "More" tab opens the MoreDrawer holding all other items grouped by section. Long-press a nav item to "pin" it to the bottom nav, displacing the previously-pinned item.

### 3.2 List-detail pattern (no master-detail panes on mobile)

Lists push a full-screen detail. Detail uses iOS-style back gesture + back button. Detail screens have a sticky bottom action bar with the 1–2 primary actions (Refund, Mark ready, etc).

### 3.3 Filter pattern

- **Chips inline** in the StickyToolbar for the 2–3 most common filters (Status, Location, Time).
- **All other filters** live in a FilterSheet behind a "Filter (N)" button — N reflects active count.
- Applied chips appear in the toolbar with an `×` to clear.

### 3.4 Bulk-action pattern

- Long-press any list row enters multi-select.
- Selected count + clear in the topbar.
- Action bar appears at bottom: "3 selected · Mark ready · Refund · …".
- Swipe up on action bar to see more.

### 3.5 KPI pattern — pager not grid

Mobile dashboard shows **one hero KPI** at a time in a horizontal swipeable pager. Position dots below. This is intentional: glance-ability beats density on a 390px screen. Operators get the cluster of 8 stats by tapping "All metrics" to open a sheet.

### 3.6 Sheet-everything

Modals → bottom sheets. Dialogs → bottom sheets. Picker dropdowns → bottom sheets. The only exception is the command palette (full-screen) and the notifications panel (full-height sheet).

Sheets have a top "grab handle" + title row + scrollable body + sticky bottom action row. They support drag-down-to-dismiss, with a velocity threshold.

### 3.7 Pull-to-refresh

Every primary list view supports PTR. Visual: a single colored ring filling as you pull, snapping into a spinner once threshold is crossed. Tied to the page's existing data-fetch hook.

### 3.8 Offline + flaky-network UX

- Network state observed via `navigator.onLine`.
- A subtle banner ("Offline — actions will sync") appears at the topbar when offline.
- Last-known data is rendered with an "as of HH:MM" stamp.
- Mutating actions are queued locally and replayed on reconnect (for KDS bumps and order status changes specifically).

### 3.9 Voice + barcode (capability detection)

- Command palette mic icon uses Web Speech API where available.
- Inventory adjust has a barcode-scan button using `BarcodeDetector` (capability-detected; falls back gracefully).

---

## 4. Accessibility

| Concern | Implementation |
|---|---|
| Touch target | All interactives ≥ 44×44, primary ≥ 48. |
| Contrast | Body text ≥ 4.5:1 on every surface. Brand red verified on `--bg`, `--surface-1`, `--surface-2`. |
| Focus | Visible focus ring via existing `--border-focus`. Keyboard users can navigate the bottom nav with arrow keys. |
| Screen reader | Bottom nav is a `<nav aria-label="Primary">` with `<button role="tab" aria-current>`. Sheets are `role="dialog" aria-modal="true"`. |
| Motion | All motion gated by `prefers-reduced-motion`. Animations collapse to opacity-only. |
| Font size | Respects iOS / Android system text size. Body uses `rem`, no `px` for content text. |
| Color-only | Status uses chip + icon + color (never color alone). |
| Haptics | `navigator.vibrate(8)` on long-press, swipe-commit, and FAB tap (capability-gated). |

---

## 5. Performance

| Constraint | Mitigation |
|---|---|
| Bundle | `MobileShell` is statically imported by `AdminShell` and conditionally rendered when `useIsMobile()` matches `(max-width: 900px)`. |
| Render | Long lists virtualized with a windowed component (custom 60-line hook, no library). |
| Network | Same APIs as desktop, but mobile views use `next/cache` `revalidate: 30s` for KPI summaries, SWR for hot lists. |
| Images | All chart paint uses `<canvas>` (recharts SVG fallback for ≤ 12 points). Card icons inline SVG, never `<img>`. |
| Battery | Polling pauses on `document.visibilityState !== "visible"`. KDS reduces to 10s on background, 1s on focus. |
| Animations | `transform`/`opacity` only — no top/height transitions. GPU-friendly. |

---

## 6. Dark / light support

Mobile components consume `[data-admin-theme]` tokens — both themes work without changes. Light theme is opt-in (per existing theme.ts boot script). Most operators stay on dark; the system supports it without flicker.

---

## 7. Drop-in usage

A page can opt-in to mobile by importing the mobile shell's helpers:

```tsx
import { useIsMobile } from "@/components/admin/v2/mobile/useIsMobile";
import { MobileDashboard } from "@/components/admin/mobile/MobileDashboard";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export function ResponsiveDashboard() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileDashboard /> : <AdminDashboard />;
}
```

The mobile shell auto-mounts when viewport is `< 900px` (matches existing `@media (max-width: 900px)` rules) — pages don't have to do anything for the shell itself.

---

## 8. Anti-patterns (do not ship)

- ❌ Stacked desktop tables (just `display: block` on `<tr>`) — feels lazy, scrolls forever.
- ❌ Floating action button for "back" — back belongs in the topbar.
- ❌ Hamburger as the only nav — bottom nav is faster and discoverable.
- ❌ "Are you sure?" dialogs on cancellable actions — use Undo.
- ❌ Tiny pencil/trash icons in rows — use SwipeRow.
- ❌ 8-column KPI grids on a phone — use StatRow pager.
- ❌ Long forms in a modal — push to a full-screen route.
- ❌ Toast on top — bottom-anchored above the bottom nav.
- ❌ Hover-only affordances — there is no hover on touch.
- ❌ Loading spinners blocking the whole screen — use skeleton screens that match final layout.
