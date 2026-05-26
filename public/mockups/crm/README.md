# public/mockups/crm

Customer Relationship Management (customer book + relationship profile)
direction, served on every deploy at `/mockups/crm/`. The companion to the
POS terminal in `../pos/` and the KDS gallery in `../kds/` — it reuses the
**shared POS + KDS visual language** (Inter + JetBrains Mono, the Atlas dark
canvas, the tone palette and the header/footer chrome) so the till, the line
and the customer book all read as one system.

The file is pure, self-contained HTML + inline CSS + inline JS — no build
step, no framework. The only external resource is the Google Fonts link
(permitted by the relaxed `/mockups/*` CSP in `next.config.ts`). What you see
in the browser is exactly what would ship.

## The chosen direction

| # | File | Direction |
|---|---|---|
| CRM | `regulars.html` | **Regulars** — dark · searchable customer book beside a deep relationship profile |

**Regulars** is built on the idea that a food truck lives on its repeat
customers. The left column is a **customer book** — searchable by name, phone
or email, filterable by segment (VIP / Active / Repeat / New / Lapsed),
sortable by lifetime value, recency, orders, points or name, with a KPI strip
across the top. The right column is the **relationship profile** for the
selected customer:

- **Lifetime stats** — value, orders, average order, loyalty points, last seen.
- **Relationship health** — an RFM blend (recency / frequency / monetary) that
  cools from green → amber → red as a customer drifts toward churn, carrying the
  same predictive-tier instinct as the KDS "Pace" layer.
- **AI next-best-action** — a churn-risk read plus the recommended move
  (win-back code, birthday offer, welcome nudge, VIP early-access, upsell),
  applied with one tap — the same violet AI card the POS uses for order offers.
- **Favourites**, **order history**, **loyalty tier** (Bronzo / Argento / Oro),
  **contact-consent toggles** (toggle = saved, immediately) and **notes**.

It runs end to end over a 12-customer sample book across Kraków + Warszawa in
złoty: search, filter, sort, select (mouse or `↑`/`↓`/`j`/`k`), award points,
toggle consent, add notes, and fire the next-best-action — all live.

## Browsing

- Locally: `npm run dev` → `http://localhost:3000/mockups/crm/`
- On any deploy: `/mockups/crm/`

`index.html` is the landing for the chosen direction; `regulars.html` is the
interactive surface.

> **Note:** like `../pos/` and `../kds/`, this is a *served* preview artifact
> referenced from design reviews. Next step: port **Regulars** into
> `src/components/admin` for an `/admin/crm` surface wired to the real customer
> rollup (`getAllCustomers()` / `CustomerRollup` in `src/lib/store.ts`), the
> loyalty points totals and the birthday/anniversary campaign triggers.
