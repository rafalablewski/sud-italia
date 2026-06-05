# Admin v3 — remaining work & next focus

Living checklist of what is **not yet done** on the admin-v3 rebuild. The
section-by-section status of what *is* done lives in `README.md`; this file is
the forward-looking to-do so the next session (and the mobile-UI push) has a
single source of truth. Keep it in sync as items land.

_Last updated: 2026-06-05 (mobile-responsiveness pass — foundation)._

## Status in one line

Every admin **section** is migrated to v3 and at **functional parity with v2**
(Menu, Recipes, Cross-sell, Upsell/Bundles, Calculator, and all the
Operations/People/Customers/Finance/Intelligence/System surfaces). v2 is still
live at `/admin/*`; v3 is the preview at `/admin-v3/*`. **Nothing in v2 has been
deleted.** The cutover is intentionally on hold.

## Mobile UI 📱 — foundation shipped, refinements remain

The v3 shell + surfaces were built **desktop-first**. The mobile-responsiveness
pass landed its **foundation** as a four-breakpoint cascade in
`themes/admin-v3/index.css` §9 — documented in `README.md` → *Responsive &
touch*. Read that section before adding more (Rule #11).

### Done (foundation)

- ✅ **Shell drawer** — below 900px `AdminShellV3` renders an off-canvas drawer
  (`data-mobile-open`), `TopbarV3` shows a hamburger, a scrim closes it, and the
  drawer ignores the desktop rail-collapsed state (full labels on a phone). The
  breadcrumb keeps only its last segment so the scope + actions stay reachable.
- ✅ **Tables** — `.av3-table-wrap` scrolls horizontally (verified; `overflow-x:
  auto`). Card/stacked layouts for the busiest tables are still a *nice-to-have*
  (see below), not a blocker.
- ✅ **Dialogs** — width is capped by the dialog-root padding (already
  `min(100% − pad, width)`); at ≤560px the root padding shrinks to near-bleed
  and the footer buttons stack full-width. Body scrolls (`overflow-y: auto`).
- ✅ **KPI rail / tiles / levers / mini2** — reflow to two-up (≤720) then one-up
  (≤560) cleanly.
- ✅ **Calculator** — the `.av3-grid-2-1` split and `.av3-leverrow` flex-wrap rows
  stack under the breakpoint; the projection + hourly bars are `flex:1` so they
  shrink to fit (no overflow). Deeper per-metric layout polish is optional.
- ✅ **Forms** — `.av3-formrow` / `.av3-formrow-4` stack at ≤720; the seven
  inline `1fr 1fr 1fr(1fr)` form grids were converted to these classes so they
  actually stack (an inline `grid-template-columns` defeats the media override).
- ✅ **Tap targets** — `.av3-icon-btn`, `.av3-nav-item`, `.av3-fchip`,
  `.av3-toggle`, `.av3-iconbtn-sm`, `.av3-scope select` hit the 44px floor at
  ≤560 + a `@media (pointer: coarse)` floor.

### Still to do (refinements)

- **Dense dialog editor rows** — the fixed-px inline grids in the *Menu*
  modifier-group editor (`1fr 90px 90px 56px 28px`), *Cross-sell* combo/window
  editors, *Upsell* route-stops, *Truck* route-stops, *Currency* rows, etc. get
  a horizontal-scroll fallback (the dialog body computes `overflow-x: auto`) but
  not a true stacked/labeled mobile layout. Convert the worst offenders to
  `.av3-scroll-x` wrappers or a labeled-stack pattern when an operator actually
  needs to edit these on a phone. Lower priority — deep config editing is rare
  on mobile.
- **Card/stacked table view** — for the densest boards (Menu, Orders, Reports,
  Calculator sandboxes) a card-per-row layout under ~560px would beat horizontal
  scroll. Optional; horizontal scroll is the acceptable baseline.
- **Real-device QA** — verify safe-area insets (notch/home-indicator), drawer
  gesture feel, and the topbar fit on a 360px viewport with a long location name.

## Cutover — on hold (pending owner verification)

The owner is verifying the full v3 on the preview before any swap. Do **not**
flip routing or delete v2 until told to. The plan, when greenlit:

1. **Two v2-only surfaces still need a v3 home** before a clean full swap:
   - `ai/agent` → `OpsAgentChat` (`src/components/admin/OpsAgentChat.tsx`) — the
     ops-assistant chat. No v3 equivalent yet (v3 `/ai` is Insights, a different
     thing).
   - `alerts` → `MobileAlerts` (`src/components/admin/mobile/MobileAlerts.tsx`) —
     full-screen alerts canvas. No v3 equivalent. (Naturally pairs with the
     mobile-UI push above.)
   - Every other `/admin`-only route is either a `/core/*` redirect stub
     (slots, loyalty, crm, concierge, whatsapp, floor), `login`, or already
     folded into a v3 surface (menu/[baseSlug] → menu dialog; reports/cohort +
     reports/ltv-cac → Calculator sandboxes; customers/[phone] → customers view).
2. **Swap** `/admin/*` → v3. Lowest-risk mechanism agreed: a Next.js redirect
   with explicit pass-throughs for `login` + the two v2-only surfaces + the
   `/core` redirect stubs. Reversible; keeps v2 in the tree.
3. **Delete v2** only after the swap is verified in production: remove
   `src/app/themes/admin/index.css`, `src/components/admin/v2/`, the legacy
   `Admin*.tsx`, and the v2 capability/manifest rows; update
   `docs/design-system/admin/*` (Rule #11) and the capabilities ledger (Rule #9).
   The isolation contract in `README.md` lists exactly what's deletable.

## Calculator — optional deepening (not required for parity)

The v3 Calculator is at functional parity with the 17k-LOC v2 `AdminSimulation`
(P&L, returns, 12-month projection, real-order sandboxes, five-section ⓘ
explainers, behaviour/seasonality/weather levers, fleet model, channel
economics). Optional extras that exist in v2 but were judged non-essential:

- More five-section ⓘ explainers (v2 has ~83; v3 ships the six headline KPIs).
  Extend coverage to the unit-economics, returns, and sandbox metrics over time.
- The saved-scenario archetypes (conservative / base / optimistic) side-by-side
  compare view.
- Menu-scenario presets picker (balanced / premium / value one-click loads).
