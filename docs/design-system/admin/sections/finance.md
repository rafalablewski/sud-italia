# Admin — Finance

← back to [Admin README](../README.md)

The four pages where money is reconciled, accounted for, projected.

| Page                     | Code                                              | Role-gate | Feature flag |
| ------------------------ | ------------------------------------------------- | --------- | ------------ |
| `/admin/reports`         | `src/components/admin/AdminReports.tsx`           | manager+  |              |
| `/admin/cash`            | `src/components/admin/AdminCash.tsx`              | manager+  |              |
| `/admin/business-costs`  | `src/components/admin/AdminBusinessCosts.tsx`     | manager+  |              |
| `/admin/simulation`      | `src/components/admin/AdminSimulation.tsx`        | manager+  | `simulation` |

## Common rules across the section

1. **Numbers are right-aligned and tabular** (`tabular-nums`). Every
   number column lines up at the decimal so eyes can scan totals
   vertically. No exceptions, even for "just one number on the row".
2. **Currency is operator-pinned to PLN inside `/admin/*`** — the
   `AdminCurrencyGuard` in the admin layout overrides any cookie /
   storefront preference so a manager auditing cash always sees the
   currency the till was using.
3. **Exports are first-class actions, not buried.** JPK (Polish tax
   export), CSV, accountant PDF — each is a primary or secondary
   button at the page header, not a row action.
4. **Reconcile, don't re-enter.** Numbers entered upstream (POS sales,
   cash counts, supplier invoices) are reconciled here — never typed
   in twice. The Calculator (simulation) is the only page that accepts
   hypotheticals.
5. **Audit trail is sacred.** Every edit to a cash session, a cost row,
   a reconciliation lands in the audit log with the actor + before /
   after values.

## Reports — `/admin/reports`

The tabbed analytics surface — revenue, orders, items, cohort, exports.

- **Header:** `Reports & Finance` (h1), location switcher, date range
  picker (today / 7d / 30d / 90d / YTD / custom), export button group
  (JPK PDF, CSV).
- **Tabs:** Revenue · Orders · Items · Cohort · Cash · Exports.
  Tab keys are stable for deep linking (`?tab=cohort`).
- **Revenue tab:** the canonical KPI grid (gross, net, tax, average
  ticket), the revenue sparkline, the day-of-week + hour heatmap.
- **Cohort tab:** the cohort × retention triangle, the curve below — see
  Intelligence ([`intelligence.md`](./intelligence.md)) for the deeper
  cohort/CLTV view that focuses on the cohort itself, not the period.
- **JPK export** triggers a same-tab navigation to the JPK endpoint
  (not an XHR) so the browser handles the file download natively.

## Cash — `/admin/cash`

The till session ledger — open, count, close, reconcile.

- **Header:** `Cash management` (h1), location switcher
  (`aria-label="Cash session location"`), date range, `+ New session`
  primary.
- **Sessions table:** session ID, opener, opened-at, closer,
  closed-at, opening float, expected close (from POS sales), actual
  count, variance (positive or negative, coloured by `success` /
  `danger`), status badge.
- **Variance > X PLN** auto-flags the row (warning tone) and requires
  a manager note on close — never close a flagged session without a
  reason.
- **Hide vs delete:** sessions can be hidden from the default view
  (`Restore session` action surfaces them again) but only fully deleted
  via a separate destructive action with confirmation — the audit log
  keeps the trail.
- **Manual cash event** (add / remove from drawer mid-session) lands
  on the session with a reason; the variance recalculates.

## Business costs — `/admin/business-costs`

The fixed + variable cost book — the "what does it cost to run a truck"
ledger.

- **Header:** `Business costs` (h1), period selector (this month /
  YTD / last 12mo), `+ Add cost` primary.
- **Tabs:** Fixed (rent, utilities, salaries) · Variable (ingredients,
  packaging, fuel) · One-off (equipment, repairs).
- **Cost row:** category, description, vendor (optional, links to
  Suppliers if matching), amount, frequency (monthly / weekly /
  one-off), start date, end date, recurring flag.
- **The category palette is fixed.** A new cost MUST map to an existing
  category (food / labour / packaging / utilities / rent / marketing /
  taxes / other). New categories are a design decision, not a
  data-entry decision.
- **Recurring costs project forward.** A monthly cost entered once
  shows up in next month's projection automatically.

## Calculator — `/admin/simulation`

The hypotheticals surface. Behind the `simulation` feature flag (see
`nav.config.ts`) because it's the only Finance page that doesn't
reconcile to real numbers.

- **Header:** `Calculator` (h1), "Hypothetical only — does not affect
  the books" disclaimer line.
- **Body:** unit-economics calculator (CAC, LTV, contribution margin,
  cohort GP), what-if sliders, scenario save / load.
- **Reconciliation prompts** — when a typed value diverges meaningfully
  from the observed actual (cost / revenue / volume), the page calls it
  out: "reconcile to the actual P&L line. You typed X, the books show
  Y" — a nudge to ground the hypothetical.
- **Cohort GP** here uses the SaaS / restaurant unit-economics literature
  framing (David Skok on cohort LTV) — month-1 vs month-12 cohort GP,
  compounding cohorts as the health signal.

## What Finance is not

- It is **not** a POS — actual tender happens at the Core POS surface
  (`/admin/pos`), not here.
- It is **not** invoicing — supplier invoices live under Inventory →
  Purchase orders; corporate invoices live under Customers → Corporate.
- It is **not** real-time monitoring — the Dashboard (overview) covers
  "what's happening right now"; Finance is post-hoc reconciliation.
- It is **not** payroll execution — labour-hours estimates come from
  People, exported here; actual payroll happens outside admin.

Finance is the **books** — what came in, what went out, what's reconciled,
and the hypothetical room to project forward.
