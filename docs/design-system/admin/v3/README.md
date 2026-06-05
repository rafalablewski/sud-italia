# Admin v3 — "Operator Terminal"

> **Status: in active build (preview).** v3 is a ground-up rebuild of the
> admin back-office, fully isolated from v2 so that once it reaches parity
> the entire v2 system (`src/app/themes/admin/index.css`,
> `src/components/admin/v2/`, the top-level `Admin*.tsx` page bodies) can be
> deleted in one stroke without touching v3. **This doc grows with the code**
> per design-system Rule #11.

## Why a v3

v2 is mature, polished, and governance-locked — but it was built for
*identity and breathing room*. The operator running two trucks across Kraków
and Warszawa needs the opposite: **maximum signal per screen, fewer clicks,
and a modern data-forward surface**. v3's brief, decided with the owner:

- **Density / efficiency** — more live numbers in view, tighter controls,
  one-glance KPI rails, compact tables, a collapsible icon rail. Built for a
  power user who lives in this product all day.
- **Modernization** — current dashboard idioms (inline sparklines, delta
  chips, restrained motion, tabular numerals everywhere) on a deeper,
  cleaner dark canvas. The reference remains Linear / Stripe / Bloomberg —
  but pushed denser.

The philosophy is unchanged from the admin theme — **Rams restraint, Ive
soul, quiet power** (see [`../theme/philosophy.md`](../theme/philosophy.md)).
v3 spends that restraint differently: the brand still appears once (wordmark,
the single money CTA), colour is still signal, but the *grid is tighter* and
*every pixel of chrome is justified by a number it reveals*.

## Isolation contract (so v2 stays deletable)

| Concern        | v2 (to be deleted)                          | v3 (the rebuild)                               |
| -------------- | ------------------------------------------- | ---------------------------------------------- |
| Theme CSS      | `src/app/themes/admin/index.css`            | `src/app/themes/admin-v3/index.css`            |
| Class prefix   | `.v2-*`, `.glass-*`, `.admin-*`, `.app-sidebar` | `.av3-*` (single prefix, no legacy aliases) |
| Token scope    | `[data-admin-theme]` on `<html>`            | `.av3-root` (reads the same `[data-admin-theme]` attr) |
| JS token mirror| `src/components/admin/v2/theme.ts`          | `src/components/admin/v3/theme.ts`             |
| Components      | `src/components/admin/v2/*`                 | `src/components/admin/v3/*`                     |
| Mount route    | `/admin/*` (live)                           | `/admin-v3/*` (preview, flips to `/admin` at parity) |

**The one shared dependency v3 keeps:** the framework-level libs that are
*not* part of either theme — `@/lib/permissions`, `@/lib/admin-roles`,
`@/lib/admin-auth`, `@/lib/admin-base`, `@/data/locations`, and the
PLN-pinning `AdminCurrencyGuard`. These are app infrastructure, not v2, and
survive a v2 deletion. v3 imports nothing from `components/admin/v2/`.

**Theme boot reuse, not coupling:** v3 reads the same `[data-admin-theme]`
attribute the existing boot script sets on `<html>`, but ships its **own**
boot script (`themes/admin-v3/theme.ts` → `themeBootScriptV3`) so deleting v2
leaves it intact. Dark is canonical; light is opt-in.

## Tokens

All v3 tokens are `--av3-*` and live only inside `.av3-root` in
`src/app/themes/admin-v3/index.css`, mirrored in
`src/components/admin/v3/theme.ts` for charts / inline SVG. Never hardcode a
hex in a v3 component — use the token.

| Group     | Tokens (dark canonical)                                                  |
| --------- | ----------------------------------------------------------------------- |
| Canvas    | `--av3-bg` `--av3-s1` `--av3-s2` `--av3-s3` `--av3-hover`                |
| Hairlines | `--av3-line` `--av3-line-strong`                                         |
| Text      | `--av3-fg` `--av3-muted` `--av3-subtle`                                  |
| Brand     | `--av3-brand` `--av3-brand-soft` · `--av3-platinum` (active / premium)   |
| Status    | `--av3-ok` `--av3-warn` `--av3-bad` `--av3-info` (+ `-soft` mixes)       |
| Geometry  | `--av3-r-{sm,md,lg,pill}` radius · `--av3-gap-{1..5}` spacing            |
| Motion    | `--av3-ease` · `--av3-t-{fast,base,slow}`                                |
| Charts    | `--av3-c1 … --av3-c8` (mirrors `theme.ts` palette)                       |

## Shell

`AdminShellV3` (`src/components/admin/v3/AdminShellV3.tsx`) — a denser frame:
a **232px sidebar that collapses to a 60px icon rail** (state persisted), a
**44px topbar** with breadcrumb + the single shell-level scope switcher +
theme toggle + notification bell, and a content well on a tight grid. Nav
taxonomy + permission gating mirror v2 (`v3/nav.config.ts`, same sections,
same `requiredRole` model via `@/lib/admin-roles`).

## Primitives (so far)

`v3/ui` — `Card`, `Button`, `Badge`, `Chip`, `Kpi` (the dense metric tile
with inline sparkline + delta), `Sparkline` (dependency-free inline SVG),
`Table` (compact, sticky header, right-aligned numerics), `Dialog` (portaled
to `#admin-portal-root` per rule #4). The set grows as pages migrate.

Shared list-page chrome lives in `themes/admin-v3/index.css` §11–13: the
filter-chips-with-counts + view toggle (`.av3-filterchips` / `.av3-viewtoggle`),
the Kanban board (`.av3-kanban` / `.av3-kcol` / `.av3-ocard`), and the dialog
(`.av3-dialog-*`).

## The Dashboard — "Operator Terminal"

The v3 home surface (`v3/DashboardV3.tsx`) is **not** an analytics report — it's
a live operations cockpit, owner-gated like the v2 `/admin` HQ. Layout (top →
bottom, then a 2-column split):

- **Revenue → daily-goal hero** — fills against a *real, operator-set* daily
  goal (`getOpsGoals`/`updateOpsGoals` in `store.ts` → `GET/PUT
  /api/admin/ops-goals`, owner-only; chain default + per-location override,
  edited inline). No goal set ⇒ the bar hides and it reads pace-vs-forecast.
  The "on pace for X by close" projection is real: labour-efficiency
  `forecastOrders` × live AOV (never a hardcoded number — rule #1).
- **Live tiles** — Cooking / Ready / Due-late from `/api/admin/kds/fleet`
  counts; Covers from real orders.
- **Levers that move the goal** — AOV, items/order, margin, labour ratio, each
  vs a stated benchmark, with day-over-day deltas where available.
- **What moves it most** — ranked from real signals (goal gap in zł, late
  tickets, hottest KDS bottleneck, labour ratio, attach) — never fabricated
  impact figures.
- **Kitchen pace + Trucks** — per-truck bottleneck/util + open/closed
  (`isLocationOpenNow`) + on-line/on-shift + revenue-today, all from the fleet
  endpoint.
- **Order flow** — orders/min last 60 min, bucketed from `/api/admin/orders`.
- **Live feed + "Needs you now"** — the right-hand spine, from
  `/api/admin/notifications` (+ derived late/low-stock/slot signals).

CSS for these lives in `themes/admin-v3/index.css` §10 (`.av3-goalbar`,
`.av3-tiles`, `.av3-levers`, `.av3-move`, `.av3-station`, `.av3-truck`,
`.av3-flow`, `.av3-feedcard`). Scope is the shell-level switcher; all data
refetches every 30s.

## What v3 is not

- **Not a re-skin of v2.** No `.v2-*` / `.glass-*` class is reused; v3 cannot
  import from `components/admin/v2/`.
- **Not Core.** POS / KDS / Guest stay on the Core theme — v3 never touches
  `/core/*`.
- **Not looser.** If a v3 surface ends up with more whitespace than its v2
  predecessor, it has missed the brief. Density is the point.

## Migration status

- [x] Foundation — tokens, theme mirror, isolation contract
- [x] Shell — sidebar (collapsible rail) + topbar + scope switcher
- [x] Dashboard — the **Operator Terminal** (live cockpit), owner-gated, wired
  to analytics / insights / KDS-fleet / labour / orders / notifications +
  the configurable daily-goal setting (`/api/admin/ops-goals`)
- [x] Orders (`/admin-v3/orders`) — live Kanban + table + detail dialog over
  the real SSE order stream (`useAdminOrdersStream`); status advances via
  `PUT /api/admin/orders`, staff+
- [x] Inventory (`/admin-v3/inventory`) — stock table (value / low-out / 7d
  waste KPIs, status chips) + movements view + edit dialog (par/reorder/on-hand
  via `PUT /api/admin/stock`, log receive/waste/adjust via
  `POST /api/admin/stock-movements`). Aggregates across trucks when scope = all
- [x] Menu (`/admin-v3/menu`) — chain-wide product board, **one row per dish**
  (deduped by `getBaseSlug`, rule #10): price range + "varies" badge when sites
  diverge, margin, availability, plus recipe/custom/hidden/edited/delivery/mods
  flags. **Full v2 parity (PR #138 follow-up):** multi-select with a sticky bulk
  toolbar (mark available / 86 / bulk-edit / clone-to-site / reset overrides /
  delete — via `POST /api/admin/menu/bulk`), a **Show hidden** toggle exposing
  soft-deleted seed rows, and **Add item** which creates a chain-wide custom SKU
  on every site (`POST /api/admin/menu/custom`, id = `slug.slice(0,3)-base`). The
  edit dialog covers chain-wide product metadata (name/description/category/tags/
  menu-role), service (delivery-only, packaging cost), a **modifier-group editor**
  (groups + options with price/cost deltas + KDS flag), regulatory disclosures
  (halal / Nutri-Grade / contains-pork / contains-alcohol / allergens) and
  per-site price/cost/availability/SKU — all written via `PUT /api/admin/menu`
  (`items` map), with per-dish **Reset** + **Delete** in the footer. Recipe-
  attached dishes lock the cost field (derives from the recipe, rule #10).
- [x] Recipes (`/admin-v3/recipes`) — chain-wide formula board + ingredient
  catalog, **one recipe per dish** (keyed by base slug, rule #10). **Full v2
  parity (PR #138 follow-up):** two tabs — **Recipes** (board with food cost /
  cost-% / kcal) and **Ingredients** (the catalog). The recipe editor now shows
  per-portion KPIs (cost / food-cost% / batch cost / kcal), a cost-breakdown bar
  with legend, live per-portion macros (protein/carbs/sugar/fiber/fat),
  missing-kcal + no-distributor flags per line, prep time + notes, and saves the
  formula chain-wide via `POST /api/admin/recipes` (`DELETE` to remove). **Bug
  fixed:** `wasteFactor` is now stored as the multiplier the store expects
  (`1 + waste%`) instead of a fraction — the old code under-costed every line.
  The **Ingredients** tab is a searchable catalog with add/edit/delete
  (`/api/admin/ingredients`) and a per-ingredient **distributor offerings**
  manager (`/api/admin/ingredient-products`): add/edit/delete offerings with
  supplier, SKU, display name, cost + per-unit macros, and a **make-active**
  star (`PATCH`) that points `activeProductId` at the offering driving recipe
  cost + nutrition. Suppliers are read for the picker (managed on Suppliers).
  Per-item dietary disclosures live on the **Menu** editor (rule #10).
- [x] HACCP log (`/admin-v3/haccp`) — per-location temperature checks with
  live in/out-of-range verdict (`@/lib/haccp`); record + today's log table
- [x] Waste log (`/admin-v3/waste`) — reason-coded write-offs; record + today's
  entries + write-off cost KPI (`POST /api/admin/waste`)
- [x] Shift handover (`/admin-v3/handover`) — end-of-shift sign-off (shift, cash
  counted → variance, temp/waste/equipment checks, managers, comment) + the
  week's log (`POST /api/admin/handover`)
- [x] Suppliers (`/admin-v3/suppliers`) — chain-wide distributor directory with
  add/edit/delete dialog (`POST/PUT/DELETE /api/admin/suppliers`)
- [x] Purchase orders (`/admin-v3/purchase-orders`) — per-location restock
  orders with status chips, a create dialog (supplier + ingredient lines +
  expected date, `POST`), and a detail dialog driving the draft→sent→received
  flow (`PUT`, receiving auto-credits stock) + cancel/delete
- [x] People — Staff (`/admin-v3/staff`): directory + clock in/out
  (`/api/admin/time-punches`) + add/edit/delete (`/api/admin/staff`), on-shift +
  active KPIs. Schedule (`/admin-v3/schedule`): this week's shifts grouped by
  day with add/edit/delete (`/api/admin/shifts`)
- [x] Customers (`/admin-v3/customers`) — phone-based directory (search,
  repeat/CLV KPIs, per-customer detail) derived from real orders
- [x] Feedback (`/admin-v3/feedback`) — guest-review board with status chips +
  avg-rating KPIs, status flow new→reviewed→responded (`PUT /api/admin/feedback`)
  and AI sentiment (`POST /api/admin/feedback/analyze`)
- [x] Corporate (`/admin-v3/corporate`) — B2B wallet-backed accounts: members /
  pool / head-bonus KPIs + edit dialog (billing, bonus %, min staff, home site,
  auto-preorder) via `PUT /api/admin/corporate`
- [x] Pulse surveys (`/admin-v3/surveys`) — NPS-style pulse + avg-rating KPIs
  (shared `@/lib/surveys`), survey catalogue with active toggles
  (`PUT /api/admin/surveys`), and a responses table
- [x] Reports (`/admin-v3/reports`) — range presets, revenue/profit/margin/
  orders/AOV/tips KPIs, revenue-by-category bars, tips summary, top items, JPK
  export (`/api/admin/analytics` + `/reports/tips` + `/reports/jpk`)
- [x] Business costs (`/admin-v3/business-costs`) — operating-expense register
  with monthly-recurring / annualised / payroll / one-off KPIs (shared
  `monthlyGrosze`), category chips, add/edit/delete dialog (`/api/admin/business-costs`)
- [x] Cash (`/admin-v3/cash`) — till session lifecycle: open float, record
  cash-sale/drop/payout entries, expected-drawer KPI, close with counted-cash →
  live variance, and a closed-session history (`/api/admin/cash` + `?action=drop|close`)
- [x] Growth (partial) — Scheduled bundles (`/admin-v3/scheduled-bundles`):
  standing-pre-order status board (approve/pause/resume/cancel via
  `PATCH /api/admin/scheduled-bundles/:id`). Truck ops (`/admin-v3/truck`):
  events + routes CRUD (incl. route-stops editor) over `/api/admin/truck-events`
  + `/api/admin/truck-routes`
- [x] Growth complete — Campaigns (`/admin-v3/growth`): loyalty levers
  (referral config + reward/challenge/seasonal toggle = saved, `PUT /api/admin/growth`).
  Cross-sell (`/admin-v3/crosssell`) — **full v2 parity (PR #139 follow-up):**
  four tabs over the per-location selling config (`PUT /api/admin/upsell`, full
  config round-tripped so nothing is lost): **Cart pairings** (Coffee/Dessert/
  Side/Drink item slots), **Combo deals** (add/edit/toggle/delete), **Time-of-day**
  windows (variant/hours/title/sub/badge/CTA/one-tap-add, add/edit/toggle/delete)
  and **Menu badges** (Hero / Pizzaiolo's Choice / Chef's Signature / New /
  Popular / Staff Pick multi-selects, with `menuRole`-intrinsic items shown
  auto-locked). Saves on change (rule #7). Upsell (`/admin-v3/upsell`) — **full
  v2 parity (PR #139 follow-up):** two tabs. **Bundles** restores the full
  bundle-ladder editor (CRUD with composition slots, fixed/dynamic pricing,
  anchor/decoy/default flags, loyalty gate, channel, members-only, scarcity
  date, active-days), the **bundle rules** card (lunch hours + family gating),
  an **A/B experiment** editor (variants + weights + per-bundle discount
  overrides + primary metric + control + start/stop + promote-winner) and the
  **ML ranker** panel (rollout slider → `mlUpsellRolloutPct`, Train-now via
  `POST /api/admin/ml-upsell`, model status, and the live ML-vs-rules attach/AOV
  comparison via `/api/admin/ml-upsell/compare`). **Item modifiers** is a
  read-only cross-location inventory. All config round-trips through
  `PUT /api/admin/upsell` (saves on change, rule #7).
- [x] Intelligence (partial) — Multi-location (`/admin-v3/locations`):
  cross-site comparison table + chain KPIs (`/api/admin/insights`). Menu
  engineering (`/admin-v3/menu-engineering`): star/puzzle/plowhorse/dog
  classification with window select, quadrant chips + per-dish verdict
  (`/api/admin/menu-engineering`). Expansion (`/admin-v3/expansion`):
  new-site readiness checklists (toggle items, add planned site,
  `PUT /api/admin/expansion`).
- [x] Intelligence complete — Manage locations (`/admin-v3/locations/manage`):
  site CRUD (hours editor, coordinates, active/alcohol) round-tripping the full
  record + re-seed (`/api/admin/locations`). Insights (`/admin-v3/ai`): AI demand
  forecast bars (`/api/admin/ai/forecast`) + chatbot-FAQ manager
  (`/api/admin/chatbot-faq`).
- [x] System (partial) — Audit log (`/admin-v3/audit-log`, filtered read), SOC 2
  (`/admin-v3/soc2`, owner-only, real `buildSoc2Register` introspection),
  Currency (`/admin-v3/currency`) + Languages (`/admin-v3/languages`) settings,
  Capabilities (`/admin-v3/capabilities` → canonical `/admin/capabilities`).
- [x] Users (`/admin-v3/users`, owner-only): account directory + add/edit/delete
  dialog (role / status / site / optional password) over `/api/admin/users`.
- [x] Permissions (`/admin-v3/permissions`, owner-only): action-level RBAC matrix —
  per-user capability toggles from the shared `PERMISSION_GROUPS` catalog,
  persisting custom grants (`PUT /api/admin/users`).
- [x] Compliance (`/admin-v3/compliance`): expiry calendar (licenses/inspections/
  insurance) with expired/≤7d/≤30d KPIs + add/edit/delete (`/api/admin/compliance`).
- [x] Regulatory disclosures (`/admin-v3/regulatory-compliance`, owner-only):
  default pack + per-site EU/NYC/SG zone + disclosure toggles
  (`PUT /api/admin/regulatory-compliance`).
- [x] Settings (`/admin-v3/settings`, owner-only): business details + delivery
  fee / min order + social links (Save), storefront-layout visibility toggles
  and feature flags (toggle = saved) over `PUT /api/admin/settings`.
- [~] Calculator (`/admin-v3/simulation`) — **Part 1 shipped**: the real P&L
  simulator. The compute engine was **extracted to a shared lib**
  (`src/lib/simulation-engine.ts`, pure `computeScenario` + `computeTornado`) so
  v3 runs the exact same math without importing from v2. Live input levers
  (volume/price, variable costs, labour, fixed costs, investment, capacity) →
  P&L + KPIs (margin, break-even, prime cost, CM1, capacity, payback,
  cash-on-cash) + sensitivity tornado, persisted via `PUT /api/admin/simulation`.
  **Part 2 shipped:** Investor Returns — NPV @ 10/15/20%, IRR (bisected),
  payback month + a 24-month cumulative cash-recovery view (`computeReturns` in
  the shared engine).
  **Part 3a shipped:** the seasonality × weather × inflation-composed 12-month
  projection. `projectMonths`/`projectTwelveMonths` (plus `monthVolumeMult`,
  `averageAnnualVolumeMult`, `MONTH_LABELS`, `MONTH_TO_SEASON`,
  `LABOR_SEASONAL_FLEX`, `DEFAULT_SEASONALITY`) were **extracted from v2 into the
  shared engine** — money returned in grosze (canonical unit) — and rendered as a
  grouped revenue/net-profit bar chart with a zero baseline (loss months dip red)
  plus year revenue/net totals.
  **Part 3b shipped:** the real-order **Sandboxes** card — a window selector
  (30/90/180d) over four tabs reading live order history: **Cohort / LTV-CAC**
  (`/cohorts` — customers, repeat rate, orders/revenue/GP per customer, new/mo,
  new-vs-returning revenue split), **Dayparts** (`/dayparts` — lunch/dinner/
  late-night/off-peak orders, share, ticket, revenue, GP, GP-rate), **Hourly
  throughput** (`/hourly` — 24-bar avg-orders-per-hour chart with amber≥85% /
  red>100% capacity colouring) and **Menu engineering** (`/menu-engineering` —
  star/plowhorse/puzzle/dog quadrant counts + per-item GP/unit, true-CM1 and
  margin-trap / prep-heavy flags). All accept `?days=N`.
  **Part 3c shipped:** the five-section ⓘ explainer pass (Rule #12). A
  v3-native `MetricExplainer` + `InfoButton` primitive
  (`src/components/admin/v3/ui/Explainer.tsx`, exported from `ui`) renders the
  five required sections in the fixed order/labels — description → INSTITUTIONAL
  ANALYSIS → IN PLAIN TERMS → TIPS → METHODOLOGY (all five props required, so a
  half-written explanation won't compile). It is the admin-v3 counterpart to
  `src/components/admin/Explainers.tsx` (which imports the v2 theme and dies at
  cutover). `Kpi` gained an optional `info` slot that renders the ⓘ trigger at
  the end of the label row; the Calculator's six headline KPIs (net profit, net
  margin, EBITDA, break-even/day, prime cost, payback) each carry a full
  five-section explainer.
- Every other admin page is migrated. At Calculator parity → flip `/admin` to v3, delete v2.
- [ ] Parity reached → flip `/admin` to v3, delete v2, register in `/admin/capabilities`
