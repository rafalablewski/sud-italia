# Admin v3 — parity-gap closure checklist

Tracking the **genuine** feature gaps between the live `/admin` (v2) surfaces
and the `/admin-v3` rebuild. Every item is verified against the actual v3
component source (not excerpts) before it lands here, and every fix ships in the
**v3 visual language** (`.av3-*` tokens/classes, `v3/ui` primitives — never a
`.v2-*` / `.glass-*` reuse, per the isolation contract in `README.md`).

_Created 2026-06-05. Keep in sync as items land (Rule #11)._

## How this list was built

The first sweep (excerpt-based) over-reported ~40 "missing" items. Re-verified
against full file reads + the v3 `README.md`/`TODO.md` parity record, **most were
false positives or intentional v3 density decisions** and were dropped:

- **Already present in v3** (agent misread large files): Growth tiers / live
  widgets / referral config, Regulatory EU·NYC·SG zones, Upsell A/B experiments +
  ML ranker, Settings push-notifications, Staff login hooks, Customers GDPR export
  + order-history KPIs, Reports/Cash/Business-costs/Calculator depth, etc.
- **Intentional density choices** (re-adding would break the v3 brief — "density
  is the point", `README.md` → *What v3 is not*): the Dashboard is an Operator
  Terminal, not an analytics report (no heatmap / comparison table — those live on
  Multi-location); verbose field help-text and long-form section descriptions are
  deliberately trimmed; login provisioning lives only on Users (not duplicated on
  Staff); cohort / LTV-CAC live as Calculator sandboxes, not standalone pages.

## Genuine gaps to close

- [x] **1. Alerts inbox** — `/admin-v3/alerts`. `AlertsV3` over
  `/api/admin/notifications` (filter chips with counts, Today/Yesterday/Earlier
  buckets, per-type tone+icon, mark-read / mark-all-read, tap-to-navigate).
  Nav entry (Overview), CSS §14, docs, mockup `admin-v3/alerts.html`. **DONE.**
- [ ] **2. Ops Agent chat** — `/admin-v3/ai/agent`. v2 `OpsAgentChat` has no v3
  home (confirmed). Build `AgentV3` (conversational ops assistant: tool-approval
  flow, executed/error tool cards, conversation history, cost readout) over the
  same `/api/admin/agent` endpoints. Add nav entry (Intelligence), CSS, docs,
  mockup.
- [x] **3. Audit-log diff view** — row click opens a v3 detail `Dialog` with a
  native `DiffRenderer` (added/removed/changed keys, before↔after blocks,
  pretty-JSON for nested shapes) over the API's `before`/`after`. CSS §15,
  mockup `admin-v3/audit-diff.html`. **DONE.**
- [ ] **4. Customer detail depth** — `CustomersV3`'s detail dialog shows only 6
  summary fields. v2 `AdminCustomerDetail` additionally has: order history,
  manual point-adjustment history, redemption history, customer notes (add/
  delete), DOB/email editor, and **GDPR Article 15 export + Article 17 erasure**.
  Restore these into the v3 detail surface over the existing
  `/api/admin/customers/[phone]` endpoints. Docs, mockup.
- [x] **5. Dashboard executive overview** — the live `/admin-v3` cockpit was
  missing the analytics surface from `public/mockups/admin-v3/dashboard.html`
  (revenue, orders, avg order, profit margin, gross profit, cancellations, labour
  ratio, revenue trend, top sellers, Location network comparison). Added a
  period-scoped Executive-overview block below the cockpit, wired to real
  analytics/insights/labour APIs. Mockup `admin-v3/dashboard-executive.html`.
  **DONE.**

## Mockups

Each fix ships a static HTML mockup in `tests/sketches/` (v3 dark canvas, `.av3-*`
look) so the surface can be eyeballed without booting the app:

Mockups live alongside the existing v3 design references in
`public/mockups/admin-v3/` (same dark-canvas `.av3-*` look as `dashboard.html`):

- `public/mockups/admin-v3/alerts.html` ✓
- `public/mockups/admin-v3/dashboard-executive.html` ✓ (gap #5)
- `public/mockups/admin-v3/agent.html` (gap #2)
- `public/mockups/admin-v3/audit-diff.html` (gap #3)
- `public/mockups/admin-v3/customer-detail.html` (gap #4)
