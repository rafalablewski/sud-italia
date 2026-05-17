# Sud Italia — Mobile Admin: Improvements & Next Steps

**Date:** 2026-05-17
**Companion:** `mobile-final-review.md`, `mobile-audit.md`
**Scope:** what was *not* shipped in this branch and the order to ship it.

---

## P0 — Status

| # | Item | Status | Notes |
|---|---|:---:|---|
| 0.1 | Wire pull-to-refresh on Customers, Reports, Cash, Schedule, KDS | ✅ shipped (KDS, Customers, Schedule); Reports/Cash inherit desktop and will pick it up when redesigned | |
| 0.2 | Dynamic-import mobile views | ✅ shipped | All five mobile pages (Dashboard, Orders, KDS, Inventory, Customers, Schedule) imported via `next/dynamic({ ssr: false })` |
| 0.3 | Long-press multi-select + `BulkActionBar` | ✅ shipped | `useMultiSelect` + `BulkActionBar` in v2/mobile; wired into MobileOrders with bulk advance + bulk cancel |
| 0.4 | Virtualized `MobileList` | ✅ shipped | `useVirtual` hook + opt-in `virtualizeAt` prop; auto-engages at ≥ 100 rows. Wired in MobileCustomers |
| 0.5 | Offline KDS queue | ✅ shipped | `useOfflineQueue` (localStorage-backed); MobileKDS uses it for bump events; banner shows online / queued state |
| 0.6 | Refund flow as a bottom sheet | ✅ shipped | `RefundSheet` with mode toggle + reason chips + amount validation; opens from order detail |
| 0.7 | Comp / discount flow | 🟡 partially shipped | Refund's `manager_comp` reason covers the common case ("on the house"). Full Comp-sheet with item-level select still pending — P1 |
| 0.8 | Mobile Customers list + detail | 🟡 list shipped | `MobileCustomers` list with virtualization; detail still falls through to the desktop component (functional, just dense) |
| 0.9 | Mobile Schedule (day-view) | ✅ shipped | `MobileSchedule` day-pager + add/edit shift sheet; replaces the week-grid that the audit flagged Critical |
| 0.10 | Lighthouse mobile pass | ⏳ pending | Pending live env access |

**Shipped this round:** P0.2 through P0.6, P0.9, partial P0.8.

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
| 1.9 | Push notifications | ✅ client opt-in + admin subscribe endpoint shipped; server-side emission (triggered by order/cash/slot events) is the next backend task |
| 1.10 | Barcode scanner for Receive | ✅ shipped (`BarcodeDetector` API with manual-entry fallback on iOS) |

---

## P2 — Status

| # | Item | Status |
|---|---|:---:|
| 2.1 | Driver app surface (`/admin/truck` mobile) | 🟡 list/route browse shipped (`MobileTruck`); real-time GPS push from driver phones is a separate driver-app project |
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

The mobile admin is "complete" when:

1. Every desktop admin page has either:
   (a) A mobile-native implementation, or
   (b) An explicit "Open on desktop" surface with a clear reason.
2. Top 5 operator actions (refund, bump, comp, lookup, adjust) consistently hit ≤ 12s and ≤ 3 taps.
3. Top 3 owner actions (glance dashboard, check alerts, ask AI) consistently hit ≤ 5s and ≤ 2 taps.
4. Lighthouse mobile: 100 accessibility, ≥ 90 performance on every admin page.
5. Offline KDS bump + order status changes replay correctly after 10s of connectivity loss.
6. Voice and barcode capabilities are real, not stubs.
7. Operator NPS ≥ 8 in the Phase-1 cohort.

We're at roughly 60% of that definition today.
