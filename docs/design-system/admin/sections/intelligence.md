# Admin — Intelligence

← back to [Admin README](../README.md)

The seven surfaces where signal becomes decision: multi-location overview,
location admin, cohort + CLTV, LTV / CAC, menu engineering, AI insights,
expansion planning.

| Page                          | Code                                              | Role-gate |
| ----------------------------- | ------------------------------------------------- | --------- |
| `/admin/locations`            | `src/components/admin/AdminLocations.tsx`         | **owner**   |
| `/admin/locations/manage`     | (sub-page of the above)                           | **owner**   |
| `/admin/reports/cohort`       | `src/components/admin/AdminCohortReport.tsx`      | manager+  |
| `/admin/reports/ltv-cac`      | `src/components/admin/AdminLtvCac.tsx`            | manager+  |
| `/admin/menu-engineering`     | `src/components/admin/AdminMenuEngineering.tsx`   | manager+  |
| `/admin/ai`                   | `src/components/admin/AdminAi.tsx`                | manager+  |
| `/admin/expansion`            | `src/components/admin/AdminExpansion.tsx`         | **owner**   |

Owner-gated pages here are deliberate — Multi-location and Expansion
touch chain strategy that managers don't need (and seeing them creates
expectation creep).

## Common rules across the section

1. **Every page answers a decision question.** "Where should we open
   next?" (Expansion), "Which dish should we re-engineer?" (Menu
   engineering), "Are January cohorts healthier than November cohorts?"
   (Cohort). Never ship a chart that doesn't lead to an action.
2. **Recommendations are framed, not commanded.** AI Insights says
   "consider X because Y" with the underlying signal visible — not
   "do X". The operator decides.
3. **Per-time-window everywhere.** Every chart has a window selector
   (`aria-label="Window"` per `AdminMenuEngineering`) — same shape,
   same options, never bespoke.
4. **Approximate is explicit.** Where numbers are estimates (per-stop
   revenue attribution, multi-location compare with uneven date ranges,
   cohort projections), the UI says "approximate" / "projection".
5. **No real-time pressure.** Intelligence is a strategic surface, not
   operational — none of these pages need to update during service.
   The Dashboard handles "what's happening now"; this section handles
   "what should we do next".

## Multi-location — `/admin/locations`

The owner's overhead view of every location's headline numbers.

- **Header:** `Multi-location` (h1), date range, comparison mode
  (absolute / per-cover / per-staff-hour).
- **Body:** one card per location with: revenue total, revenue delta vs
  comparison window, AOV, order count, labour ratio, GP estimate. Cards
  sort by selected metric.
- **Compare table** below the cards: same metrics side-by-side, with the
  best / worst column highlighted.
- **Anomaly flags** when a metric diverges meaningfully from the chain
  average (>1.5σ) — surfaced as a small badge on the card.

## Manage locations — `/admin/locations/manage`

The CRUD for the location list itself.

- **Header:** `Manage locations` (h1), `+ Add location` primary.
- **Table:** slug, name, city, status (open / planned / closed),
  service hours summary, currency, default tax band, row actions.
- **Adding a location** seeds the menu (empty), slot config (default),
  staff list (empty), and registers it in nav location switcher
  immediately.
- **Closing a location** archives it (keeps the data); it disappears
  from operator-facing switchers but stays in reports.

## Cohort & CLTV — `/admin/reports/cohort`

The retention triangle + the customer-lifetime-value curve.

- **Header:** `Cohort & CLTV` (h1), date range, cohort grouping
  (acquisition month / first-channel / location), CLTV metric (GP / NR).
- **The triangle:** rows are cohorts, columns are observation periods,
  cells are retention %. Diagonal stripes mark the "today" line — cells
  to its right are projection, not observation.
- **The CLTV curve** below: cumulative LTV per cohort over time. Hover
  surfaces the cohort size + median + p10/p90 band.
- **Compare two cohorts** — pin one, click another, the second renders
  as an overlay curve. Useful for "did the new pricing change retention?".

## LTV / CAC — `/admin/reports/ltv-cac`

Acquisition economics — the "what's your LTV:CAC?" answer in one screen.

- **KPI row** (`v2-kpi-grid` + `KpiCard`): LTV:CAC ratio (tone green ≥ 3×,
  amber ≥ 1×, red below), Blended CAC, Blended LTV (margin-adjusted),
  CAC payback in months (green ≤ 3, red > 12).
- **"How to read these numbers" explainer** (below the KPI row): a card
  with `PlainTalk` / `Methodology` / `Tips` callout blocks — the same
  orange/blue/green left-rail vocabulary the Calculator
  (`/admin/simulation`) uses, so the two analytics surfaces explain
  things in one voice. Plain-English walkthrough of LTV, CAC, the ratio
  benchmark, and payback, with złoty examples and operator actions.
- **Data sources, both real:** LTV from the cohort CLTV engine
  (`buildCohortReport`) × a blended gross margin computed from paid-order
  line-item price/cost; CAC from the **marketing-category** rows of the
  Business-costs ledger (`getBusinessCosts({ category: "marketing",
  status: "active" })`), normalized to a monthly burn via
  `src/lib/business-costs-math.ts` and divided by new customers/month.
  The pure engine is `src/lib/ltv-cac.ts` (`buildLtvCacReport`).
- **No-spend state:** when no marketing cost is logged, a `v2-callout
  v2-callout-warning` prompts the operator to add spend under Business
  costs → Marketing; CAC / ratio / payback render `—` rather than a fake
  number. LTV still shows (it only needs orders).
- **Retention curve:** a `LineChart` of size-weighted blended retention
  by month-offset (the investor "show me a cohort retention curve" ask).
- **Cohort table:** per acquisition month — new customers, spend, CAC,
  365-day margin LTV, LTV:CAC, payback. Headline LTV:CAC cell uses
  `v2-cohort-td-headline`.

## Menu engineering — `/admin/menu-engineering`

The four-quadrant analysis: every item sorted by margin × popularity.

- **Header:** `Menu engineering` (h1), location switcher, window selector
  (last 7d / 30d / 90d), `+ Recompute` if needed.
- **Quadrant summary cards:**
  - ★ **Stars** (high margin, high popularity) — `tone="success"`,
    Crown icon.
  - **Workhorses** (low margin, high popularity) — protect their volume,
    consider repricing up.
  - **Puzzles** (high margin, low popularity) — push attach + cross-sell
    to lift velocity.
  - **Dogs** (low margin, low popularity) — drop, unless `menuRole ===
    "anchor"` (loss-leader by design).
- **The scatter plot:** items plotted by GP% (y) × order share (x),
  quadrant boundaries drawn. Click a point → opens the recipe board for
  that item.
- **Action recommendation per item** (`actionText` in the source):
  "Reprice up or re-engineer the recipy", "Push attach / upsell to lift
  velocity", "Drop unless anchor" — surfaced as one line under the item
  name, the operator confirms.

## AI Insights — `/admin/ai`

The AI summary surface — patterns the system noticed across the
operational data.

- **Header:** `Insights` (h1), refresh trigger (manual; no auto-refresh).
- **Cards:** each insight is one card with title, the evidence
  (sparkline / mini-chart / data sample), the suggested action, a
  feedback row (`useful` / `not useful` / `dismiss`).
- **Insights are explanations, not commands.** Always include the *why*
  — the signal that triggered the insight is visible right there.
- **Dismissal feedback** trains the next generation; the operator's
  judgement is the corrective signal.
- **No black-box "scores".** A score with no chain of reasoning is not
  shipped.

## Expansion — `/admin/expansion`

The "where could we open next" planning surface — owner-gated.

- **Header:** `Expansion` (h1), region selector, criteria weight
  presets.
- **Candidate cards** for each city / district under consideration:
  catchment size, competitor density, transit access, demographic match
  to existing customer base, projected month-1 revenue (with
  uncertainty band), gut-check field for owner notes.
- **Custom items / categories** for what to launch with (`aria-label="Custom item"`,
  `aria-label="Category"`) — lets owner draft a hypothetical opening
  menu sized to the local market.

## What Intelligence is not

- It is **not** real-time monitoring — Dashboard does live; Intelligence
  is strategic.
- It is **not** reporting — Reports (Finance) is for the books;
  Intelligence is for decisions.
- It is **not** growth execution — Growth pulls the levers, Intelligence
  decides which lever to pull.
- It is **not** the place to model hypotheticals — Calculator
  (Finance) is.

Intelligence is the **decision surface** — every page exists to inform a
choice the operator or owner has to make in the next planning cycle.
