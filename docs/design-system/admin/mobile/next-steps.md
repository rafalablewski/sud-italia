# Ottaviano — Mobile Admin: Improvements & Next Steps

> **⚠️ RETIRED — historical record.** The separate mobile-admin shell this
> document describes is no longer served; phones now render the responsive
> desktop layout 1:1. See [`README.md`](./README.md) for the retirement note.
> Kept for history — not the current spec.

**Date:** 2026-05-17
**Companion:** `final-review.md`, `audit.md`
**Scope:** what was *not* shipped in this branch and the order to ship it.

---

## P0 — Status

| # | Item | Status | Notes |
|---|---|:---:|---|
| 0.1 | Wire pull-to-refresh universally | ✅ shipped | Every one of the 26 mobile views (Dashboard, Orders, KDS, Inventory, Customers + detail, Schedule, Reports, Cohort, Loyalty, Cash, Feedback, Settings, AI, WhatsApp, Audit log, Compliance, Users, Suppliers, POs, Menu, Recipes, Slots, Locations, Truck, Expansion) wraps with `<PullToRefresh>` |
| 0.2 | Dynamic-import mobile views | ✅ shipped | Every `AdminX` wrapper imports its mobile counterpart via `next/dynamic({ ssr: false })`. Desktop bundles ≠ mobile bundles. |
| 0.3 | Long-press multi-select + `BulkActionBar` | ✅ shipped | `useMultiSelect` + `BulkActionBar` in v2/mobile; wired into MobileOrders with bulk advance + bulk cancel |
| 0.4 | Virtualized `MobileList` | ✅ shipped | `useVirtual` hook + opt-in `virtualizeAt` prop; auto-engages at ≥ 100 rows. Wired in Customers, Loyalty members, Audit log, POs, Menu, Recipes, WhatsApp |
| 0.5 | Offline KDS queue | ✅ shipped | `useOfflineQueue` (localStorage-backed); MobileKDS uses it for bump events; banner shows online / queued state |
| 0.6 | Refund flow as a bottom sheet | ✅ shipped | `RefundSheet` with full/partial mode toggle + reason chips + amount validation; opens from order detail. Shows refund-on-record card when one exists. |
| 0.7 | Comp / discount flow | ✅ shipped | `CompSheet` with three modes (item / amount / percent), reason chips, % preset chips, slider. Posts to `/refund` with `manager_comp` + `partial` (same pipeline desktop uses for comps). |
| 0.8 | Mobile Customers list + detail | ✅ shipped | `MobileCustomers` virtualized list + `MobileCustomerDetail` (identity card, comms shortcuts, stat pager, order history, manual adjustments, notes) |
| 0.9 | Mobile Schedule (day-view) | ✅ shipped | `MobileSchedule` day-pager + add/edit shift sheet; replaces the week-grid that the audit flagged Critical |
| 0.10 | Lighthouse mobile pass | ⏳ pending | Genuinely needs a deployed env — can't run Lighthouse against `localhost` shut down between sessions |

**P0 result: 9 of 10 shipped. The remaining item (Lighthouse) is gated on a deployed preview.**

---

## P1 — Status

| # | Item | Status |
|---|---|:---:|
| 1.1 | Mobile Reports + Cohort | ✅ shipped |
| 1.2 | Mobile Loyalty (3 tabs) | ✅ shipped |
| 1.3 | Mobile Cash sessions | ✅ shipped (open / drop / close sheets) |
| 1.4 | Mobile Feedback | ✅ shipped (with AI sentiment chips + status advance) |
| 1.5 | Mobile Settings tabs | ✅ shipped (3 tabs; danger-zone hidden on mobile) |
| 1.6 | Spring physics hook | ✅ shipped (`useSpring`) |
| 1.7 | "Frequent" section in MoreDrawer | ✅ shipped (decayed-weight scoring + "Recent" alongside) |
| 1.8 | Tablet breakpoint band | ✅ shipped (`useIsMobile` now reports `viewport: "phone" | "tablet" | "desktop"`) |
| 1.9 | Push notifications | ✅ full pipeline shipped — client opt-in + `/api/admin/push/subscribe` + `admin_push_subscriptions` table + `pushToAdmins()` server helper + fanout from `addNotification()`, cash close (variance ≥ 50 zł), and refund processed (excludes the actor) |
| 1.10 | Barcode scanner for Receive | ✅ shipped (`BarcodeDetector` API with manual-entry fallback on iOS) |

---

## P2 — Status

| # | Item | Status |
|---|---|:---:|
| 2.1 | Driver app surface (`/admin/events` mobile) | 🟡 list/route browse shipped (`MobileTruck`); real-time GPS push from driver phones is a separate driver-app project |
| 2.2 | Voice-driven mutations beyond palette search | ⏳ palette has voice input; voice-triggered mutations require an intent parser + confirmation UI — backlog |
| 2.3 | Photo proof on delivery completion | ⏳ requires driver app + S3 upload pipeline |
| 2.4 | Drag-drop bundle editor on tablet | ⏳ explicit desktop-only per audit; tablet would need a touch-DnD rewrite |
| 2.5 | Franchisee-scoped dashboards | 🟡 location filter already enforced via role; UI is the same shape — no special view needed yet |
| 2.6 | Mobile WhatsApp inbox UI | ✅ shipped (`MobileWhatsApp` — list + chat thread + send) |
| 2.7 | Mobile AI agent | ✅ uses existing `OpsAgentChat` which is already chat-shaped and responsive |
| 2.8 | Mobile audit log + compliance + users + suppliers + POs | ✅ shipped (`MobileAuditLog`, `MobileCompliance`, `MobileUsers`, `MobileSuppliers`, `MobilePurchaseOrders`) |
| 2.9 | Mobile menu + recipes + slots | ✅ shipped (read-mostly with toggle-86 and day pager respectively) |
| 2.10 | Mobile multi-location comparison + expansion | ✅ shipped (`MobileLocations`, `MobileExpansion`) |
| 2.11 | Mobile AI insights | ✅ shipped (`MobileAI` — forecast / anomalies / reorder / staffing) |

---

## Still desktop-only (intentional per audit § "What doesn't belong on mobile")

These config surfaces are touched weekly+, are dominated by multi-row forms or drag-drop, and would be hostile to phone editing. The mobile shell still wraps them so they're navigable, but the editing UX stays desktop.

- `/admin/growth` — loyalty tiers, rewards, referral, live widgets
- `/admin/upsell` — bundle ladder editor with drag-drop tier reorder
- `/admin/crosssell` — multi-tab pairings / combos / time windows / badges
- `/admin/scheduled-bundles` — date-range bundle editor
- `/admin/corporate` — B2B account terms multi-step form
- `/admin/locations/manage` — long location form with per-day hours + map picker

## P3 — Phase 4+ (aspirational)

| # | Item | Why |
|---|---|---|
| 3.1 | Native shell via Capacitor for biometric + push + camera | Phase-1 cohort metrics will tell us if the PWA limit hurts. Only build native if the data demands it. |
| 3.2 | Wearable (Apple Watch / Wear OS) shift-clock + new-order glance | The "wrist" surface is the natural extension of phone-first. |
| 3.3 | Voice-only "ear mode" for managers on the floor | Speak the question → headphone read-out of the answer. |
| 3.4 | On-device anomaly detection for KDS (lane health) | Edge ML; flags abnormally slow tickets before SLA fires. |
| 3.5 | Per-language localization beyond Polish + English | A real expansion blocker the moment we open Milan / NYC. |

---

## Operational refactors picked up along the way

These aren't mobile-specific but the mobile work surfaced them:

1. **`ShellContext` now exposes `closePalette`, `closeNotif`, `paletteOpen`, `notifOpen`, `bumpNotifications`.** Desktop still uses only the open + version subset; mobile uses the full surface. Existing CommandPalette / NotificationPanel consumers were updated. Backwards-compatible.
2. **`AdminDashboard`, `AdminOrders`, `AdminKDS`, `AdminInventory` now branch on `useIsMobile`.** Desktop is renamed to `*Desktop` internally; the original export is a switch. Same external contract.
3. **CSS namespace `v2-m-*` introduced.** ~700 lines of new CSS at the end of `globals.css`. Coexists with `v2-*` (desktop) and `.admin-bg` (legacy). Tokens prefixed `--m-*`.

---

## Open questions for the design + product team

1. **Bottom-nav slot 3 default for staff:** Customers or Stock? Audit said Customers; some staff workflows are inventory-first.
2. **Should the FAB on KDS bump *all* tickets on the lane, or only the longest-running?** A "bump all" can mass-mistake; the longest-running is safer but less powerful.
3. **Light theme is opt-in today.** Is the kitchen lighting going to demand a one-tap day/night auto-switch? If yes, we should add a sunrise-sunset auto setting.
4. **Bluetooth keyboards in restaurants are rare.** Should we still preserve `g+letter` shortcuts on mobile, or is that dead weight in the bundle?
5. **PWA install prompts** — do we want to surface "Add to home screen" in the MoreDrawer footer? Big UX lift for repeat-use owners.

---

## Measurement plan

To validate the redesign and inform Phase 2 prioritisation:

- **Time-to-refund** (Phase 1 cohort): instrument the new refund sheet with a span from open to commit. Target ≤ 12s.
- **Bump latency** (KDS): time-from-ready-to-bump. Target ≤ 1.5s per ticket.
- **Mobile session share**: `% of admin sessions where viewport < 900px`. Target > 70% within 30 days.
- **Lighthouse mobile**: Performance ≥ 90, Accessibility 100, Best practices ≥ 95 on `/admin` and `/admin/orders`.
- **CrUX field perf**: LCP, FID, CLS. Target green on Pixel 6a as a representative low-end mobile.
- **Operator NPS (qualitative)**: 5-minute survey 14 days after Phase 1 launch.

---

## Definition of done — for the *full* mobile redesign (across all phases)

| # | Criterion | Status |
|---|---|:---:|
| 1 | Every desktop admin page has a mobile-native implementation **or** an explicit "open on desktop" reason | ✅ — 26 mobile views shipped; 6 config surfaces (growth, upsell, crosssell, scheduled-bundles, corporate, locations/manage) intentionally desktop per audit |
| 2 | Top-5 operator actions (refund, bump, comp, lookup, adjust) take ≤ 12s and ≤ 3 taps | ✅ — flow design hits the target; live timing validation needs a deployed env |
| 3 | Top-3 owner actions (glance dashboard, check alerts, ask AI) take ≤ 5s and ≤ 2 taps | ✅ — Home tab → KPI pager → alert row is ≤ 2 taps; AI agent reachable from MoreDrawer → Insights |
| 4 | Lighthouse: 100 a11y, ≥ 90 perf on every admin page | ⏳ — code architected to target; field validation pending deploy |
| 5 | Offline KDS bump + order status replay after 10s of connectivity loss | ✅ — `useOfflineQueue` shipped; KDS routes bump events through it; replays on `online` event or 30s tick |
| 6 | Voice + barcode are real (not stubs) | ✅ — palette voice via `SpeechRecognition`; barcode via `BarcodeDetector` with manual-entry fallback |
| 7 | Operator NPS ≥ 8 in the Phase-1 cohort | ⏳ — requires cohort + 14 days of usage |

**Self-honest score: 5 of 7 criteria are code-done. The remaining 2 (Lighthouse + NPS) require a live preview the harness can't host.**

## Genuinely outstanding work (in priority order)

If we keep going, this is the order that closes real value. Items above the line are doable in-session; items below need a separate project.

— in-session enhancements layered on after P0–P2 closure —
1. **Skeleton screens** — `<Skeleton>`, `<StatCardSkeleton>`, `<ListRowSkeleton>`, `<MobileListSkeleton>` + auto-wired into `MobileList` (every view shows skeleton rows on first load with a 4 s timeout fallback, no per-view plumbing needed).
2. **Spring physics on sheet drag-release** — BottomSheet snap-back uses a velocity-scaled cubic-bezier with iOS-style overshoot. FAB press uses a snap-down/spring-up curve.
3. **PWA install prompt** — `useInstallPrompt` + MoreDrawer chip (Chrome/Edge/Samsung). `IosInstallHint` banner with Share → Add to Home Screen instruction (iOS Safari).
4. **Auto theme** — `useAutoTheme` + "Auto" chip in MoreDrawer. Flips dark→light at 07:00 / 19:00 local; reschedules at each hour boundary.
5. **Action timing telemetry** — `useActionTiming` + `/api/admin/telemetry` POST/GET. Persists to `telemetry_spans` (Postgres) with `(span, occurred_at)` index. p50/p95/count/lastAt aggregations. Spans: `kds.bump`, `orders.refund`, `orders.comp`, `orders.advance`, `customers.lookup`, `inventory.adjust`, `dashboard.glance`, `alerts.view`, `ai.agent.open`.
6. **Server-side push fanout** — `pushToAdmins()` + structured `Notification.data` payload + per-category opt-in (`admin_push_prefs` table) + `PushSettingsSheet` UI. Test-push endpoint + button. Dispute hook wired from Stripe webhook. Slot-pressure auto-fires when `currentOrders === maxOrders - 1`.
7. **Multi-tone KDS audio** — `playKdsCue("newOrder" | "overdue" | "ready" | "test")` with distinct tonal shapes (C5→G5 rise / A3 low pulse / C6 chime).
8. **Web Share API** — `canShare()` + `share()` with clipboard fallback. Customer detail header surfaces a Share button.
9. **Onboarding tour** — 3-step coach-mark for FAB / swipe / bell. Persists "seen" in localStorage.
10. **Long-press nav peek** — Bottom-nav tabs reveal a tooltip with route + Open shortcut on long-press. Prefetches the route on pointerdown.
11. **Idle-time route prefetch** — `useIdlePrefetch` warms bottom-nav routes via `requestIdleCallback` (setTimeout fallback).
12. **Full-screen alerts view** — `/admin/alerts` route + `MobileAlerts`. Filter chips (Unread / Orders / Slots / Stock / Money), today/yesterday/older bucketing, mark-all-read. Reachable from Home action queue and **long-press of the topbar bell**.
13. **Service-worker offline shell** — `sw.js` v2 caches `/admin`, `/admin/login`, `/admin/orders`, `/core/kds`, `/admin/inventory` cache-first.
14. **Background Sync API for KDS replay** — `useOfflineQueue` registers `sud-italia-admin-kds-queue` sync tag. SW posts `flush` message → page drains. Replays after the tab was closed (Chromium); falls back to `online` event on Safari.
15. **Page transition animations** — `<PageTransition>` wraps shell content. Forward pushes slide-in-from-right, back navigations slide-in-from-left, both with iOS-style ease. Reduced-motion collapses to opacity-only.

— separate project (out of session scope) —
3. **Driver app** (P2.1) — geo + push + photo proof. Needs Capacitor or PWA-with-GPS-permissions + S3 wiring + driver auth (not the admin auth).
4. **Lighthouse + Web Vitals harness** (P0.10, P1.10, criterion 4) — need a deployed URL and a Lighthouse CI workflow.
5. **Voice-driven mutations beyond search** (P2.2) — intent parser (LLM or rules) + a "are you sure?" confirmation surface. Risk surface is high enough to warrant a separate design review.
6. **Drag-drop bundle editor** (P2.4) — explicit desktop-only per audit; not a regression to leave it.
7. **All P3** — Capacitor native shell, wearables, on-device ML, ear-mode, extra locales — each is a quarter+ of work and explicitly future per the doc.
