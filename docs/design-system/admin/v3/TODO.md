# Admin v3 — remaining work & next focus

Living checklist of what is **not yet done** on the admin-v3 rebuild. The
section-by-section status of what *is* done lives in `README.md`; this file is
the forward-looking to-do so the next session (and the mobile-UI push) has a
single source of truth. Keep it in sync as items land.

_Last updated: 2026-06-05 (PR #139)._

## Status in one line

Every admin **section** is migrated to v3 and at **functional parity with v2**
(Menu, Recipes, Cross-sell, Upsell/Bundles, Calculator, and all the
Operations/People/Customers/Finance/Intelligence/System surfaces). v2 is still
live at `/admin/*`; v3 is the preview at `/admin-v3/*`. **Nothing in v2 has been
deleted.** The cutover is intentionally on hold.

## Next focus — mobile UI 📱

The v3 shell + surfaces were built **desktop-first** (dense tables, fixed-width
dialogs, multi-column grids). The next push is a **mobile-responsiveness pass**.
Known gaps to tackle:

- **Shell (`AdminShellV3` / `SidebarV3` / `TopbarV3`)** — the 232px sidebar
  collapses to a 60px rail but there is no true mobile drawer; below ~720px the
  sidebar should become an off-canvas drawer (hamburger in the topbar) rather
  than eating horizontal space.
- **Tables (`ui/Table.tsx`)** — hairline tables overflow on narrow screens. Add
  a horizontal-scroll container (`.av3-table-wrap` already wraps; verify it
  scrolls) and/or a card/stacked layout under a breakpoint for the busiest
  tables (Menu board, Orders, Reports, the Calculator sandboxes).
- **Dialogs (`ui/Dialog.tsx`)** — fixed `width` px values (520–640) overflow on
  phones. Make `maxWidth` cap at `min(width, 100vw - 24px)` and let the body
  scroll; the Menu/Recipe/Bundle editors are the tallest.
- **KPI rail (`.av3-kpi-rail`)** — `auto-fit minmax(176px,1fr)` is fine, but
  check it reflows to 1–2 columns cleanly on small screens.
- **Calculator** — the `av3-grid-2-1` inputs/outputs split and the many
  `flex-wrap` lever rows need a single-column stack under a breakpoint; the
  12-month projection + hourly-throughput bar charts need a min-width or
  horizontal scroll so bars stay legible.
- **Forms** — `.av3-field` fixed widths (e.g. `w={120}`) should go full-width on
  mobile. Consider a `.av3-field--fluid` modifier or a container query.
- **Cross-sell / Upsell editors** — the multi-column `repeat(auto-fit,minmax(…))`
  grids and the badge multi-select scroll boxes need touch-friendly hit targets
  (min 40px) and single-column fallbacks.
- **General** — audit tap-target sizes (`.av3-toggle`, `.av3-iconbtn-sm`,
  `.av3-fchip`) for the 44px touch guideline; verify the theme toggle + scope
  switcher fit the 44px topbar on mobile.

When starting the mobile pass, read `docs/design-system/admin/v3/README.md` and
`theme/extend.md` (the token/variant contract) before inventing new breakpoints
or utility classes — add them through the documented pattern (Rule #11).

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
