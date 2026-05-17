# Sud Italia — Mobile Admin: Improvements & Next Steps

**Date:** 2026-05-17
**Companion:** `mobile-final-review.md`, `mobile-audit.md`
**Scope:** what was *not* shipped in this branch and the order to ship it.

---

## P0 — Ship before Phase-1 cohort goes live

Items that materially affect day-1 operator experience. Estimated total: ~2 weeks of focused work.

| # | Item | Why | LOC est. | Files |
|---|---|---|---|---|
| 0.1 | Wire pull-to-refresh on Customers, Reports, Cash, Schedule, KDS | Universal expected gesture; currently only on Dashboard / Orders / Inventory. | ~10 per page | mobile views |
| 0.2 | Dynamic-import mobile views in their `AdminX.tsx` wrappers | Today both desktop and mobile bundles ship; mobile users pay desktop's bytes. | ~5 per page | `next/dynamic` |
| 0.3 | Long-press multi-select + `BulkActionBar` | Power-user parity with desktop's checkbox column. | ~120 | new `useMultiSelect.ts`, `BulkActionBar.tsx` |
| 0.4 | Virtualized `MobileList` | Customers + Audit log are unbounded; a 5k-row list will jank on a 4G phone. | ~80 | new `useVirtual.ts` |
| 0.5 | Offline KDS queue (IndexedDB or in-memory + replay on reconnect) | Basement-wifi kitchens break the optimistic-UI promise without this. | ~150 | new `useOfflineQueue.ts`, wire in `MobileKDS` |
| 0.6 | Refund flow as a true bottom sheet (currently stubbed via palette) | Refund is the #2 most-frequent operator action. | ~150 | new `RefundSheet.tsx`, wire on `MobileOrders` |
| 0.7 | Comp / discount flow as a bottom sheet | Same urgency as refund. | ~150 | new `CompSheet.tsx` |
| 0.8 | Mobile Customers list + detail | Customers tab is exposed in the staff bottom nav but still falls through to desktop list. | ~200 | new `MobileCustomers.tsx`, `MobileCustomerDetail.tsx` |
| 0.9 | Mobile Schedule (day-view) | Schedule is rated critical-risk in the audit; currently falls through to the desktop week grid. | ~250 | new `MobileSchedule.tsx` |
| 0.10 | Lighthouse mobile pass (≥ 90 perf, 100 a11y) | Validation, not a feature. Likely surfaces ~5 small fixes. | ~50 | spot fixes |

**Estimated effort:** 60–70 engineering hours.

---

## P1 — Phase 2 (4–6 weeks after Phase 1)

| # | Item | Why | LOC est. |
|---|---|---|---|
| 1.1 | Mobile Reports + Cohort | Reports is medium-high risk in the audit; cohort needs a phone-native representation entirely. | ~400 |
| 1.2 | Mobile Loyalty (3 tabs) | High-traffic admin surface during loyalty config. | ~350 |
| 1.3 | Mobile Cash sessions (open / drop / close) | Cash session close-out is touched daily. | ~280 |
| 1.4 | Mobile Feedback (with AI sentiment chips) | Already moderately mobile-friendly; needs the swipe respond / mark-read patterns. | ~200 |
| 1.5 | Mobile Settings tabs | Owner / manager touches monthly; lower urgency. | ~250 |
| 1.6 | Tiny `useSpring` hook for sheet + FAB physics | Closes the Linear-polish gap. | ~250 |
| 1.7 | Per-day "Frequent" section in MoreDrawer | Toast-style "Recent" — learns from nav clicks. | ~80 |
| 1.8 | Tablet breakpoint band (720–1024) with hybrid chrome | iPad-mini-portrait deserves better than mobile chrome. | ~200 |
| 1.9 | Push notifications via Web Push API | Owner gets a tap-able "Refund requested" / "Cash variance > 50 zł". | ~300 |
| 1.10 | Capability-gated barcode for Receive in Stock | `BarcodeDetector` API or `getUserMedia` fallback. | ~250 |

---

## P2 — Phase 3 (8–12 weeks)

| # | Item | Why |
|---|---|---|
| 2.1 | Driver app surface (`/admin/truck` mobile) | Real-time location updates from driver phones; in-route action sheet (Mark picked, Mark delivered, Call customer). |
| 2.2 | Voice-driven actions ("Comp the last order for table 5") | Beyond palette search — voice-triggered mutations. |
| 2.3 | Photo proof on delivery completion | Camera capture; image upload to Stripe receipt. |
| 2.4 | Drag-drop bundle editor on tablet | Bundle manager today is desktop-only. |
| 2.5 | Mobile-specific dashboards for franchisee role | Franchisee sees rolled-up KPIs across their scope only. |
| 2.6 | Mobile-specific WhatsApp inbox UI | The chat flow on desktop is rudimentary; mobile deserves Telegram-grade chat UX. |
| 2.7 | Mobile AI-agent voice mode | Conversational ops assistant. Long-tail dependency on the AI agent endpoint maturing. |

---

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
