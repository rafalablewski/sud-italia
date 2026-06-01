# CRM — exploratory, relationship-rich

← back to [README](../README.md)

The most exploratory surface in the suite. Where the KDS suppresses brand
expression, the CRM lets it breathe — generous whitespace, Fraunces on the
guest's name, soft platinum tier markers, count-up on lifetime value.

**Live code:** `src/components/admin/AdminCustomers.tsx` and
`AdminCrm.tsx` (the unified hub also covers Concierge + WhatsApp under one
nav).
**Mockup:** `guest-crm.html`.

## Layout — book + profile

Two-pane master/detail:

```
+--------------------------+------------------------------------------+
|         The book         |              Deep profile                |
|--------------------------|------------------------------------------|
|  KPIs · 3-tile           |  Identity card · LTV · tier              |
|  Search                  |  Health gauge + RFM + diagnosis          |
|  Segment chips           |  Next Best Action (AI)                   |
|  Channel chips · period  |  Lifetime stats · Identity & channels    |
|  Sort                    |  Favourites · Loyalty · Consent          |
|  Triggers ("Send today") |  Concierge notes · Recent orders         |
|  ── Agentic group        |  GDPR (export · erase)                   |
|  ── Customers group      |                                          |
+--------------------------+------------------------------------------+
```

## Filters (the customer book)

Filters layer; they all combine.

| Dimension | Options |
|---|---|
| **Segment** | All · VIP · Active · Repeat · New · Lapsed · Members · Contacts · No email · Cancellations |
| **Channel** | Dine-in · Takeout · Delivery · WhatsApp |
| **Period** | All time · 24h · 7d · 30d |
| **Sort** | Value · Recent · Orders · A–Z |

Each chip carries a live count and a small `--cdot` colour dot for
channels.

## Lifecycle (the segmentation engine)

Derived consistently in `/api/admin/customers` + `/api/admin/crm`:

- **new** — 0 orders
- **lapsed** — last order > 90 days ago
- **active** — last order ≤ 30 days ago and ≥ 1 order
- **repeat** — ≥ 2 paid orders and not lapsed

VIP overrides lifecycle: **points ≥ 1500 OR totalSpent ≥ 100,000 grosze.**

## Triggers ("Send today")

A warm-amber card (`.crm-promo`) at the top of the customer book — Core
has no platinum token, so the amber `--cmd-warn` accent stands in:

> 🎂 **Send today** · 2 birthdays · 1 anniversary

Computed by `GET /api/admin/campaigns/triggers` (DOB month/day match +
first-order anniversary), fetched once on mount. Only the non-zero parts
render (e.g. just "2 birthdays" when no anniversary falls today); the card
hides entirely when nothing is due. Tapping it opens the first guest in
the deep profile so the operator can greet them.

The cake icon is the `Cake` stroke icon, not the emoji 🎂 — see
the Core theme's iconography rule ([`../theme/`](../theme/) — custom stroke, no emoji in UI chrome).

## The deep profile

### Header

- 60px **circular monogram** with a `--platinum-soft` inset ring.
- Guest name in **Fraunces 24px**, semibold.
- Meta row: phone (mono), email, locations, "Since YEAR", "Birthday in Nd"
  (platinum stroke cake icon when ≤ 14d).
- Tier pill (Bronze/Silver/Gold/Platinum). Cancellation/no-show banner
  surfaces above the gauges if `reliability < 95%`.

### Relationship health gauge

An SVG arc 0–100 with the tier label and a one-sentence diagnosis. The
score is RFM + reliability:

```
0.38 · Recency  +  0.22 · Frequency  +  0.15 · Monetary  +  0.25 · Reliability
```

Tier mapping: `Loyal` (≥75) · `Steady` (50–74) · `Cooling` (30–49) ·
`At risk` (15–29) · `Churned` (< 15).

### RFM bars

Four bars (`Recency / Frequency / Monetary / Reliability`) with their 0–1
factor on the right. Each bar uses the `.meter.tier-calm/warn/risk` system
so the colour escalates with the value.

### Next Best Action (AI)

A brand-soft panel with:

- Churn risk percentage (`Low · 6%` / `Medium · 22%` / etc.)
- One concrete next action sentence (e.g. *"Send an anniversary note +
  comp limoncello"*)
- An optional follow-up explanation
- Two buttons — the primary action + a contextual secondary

The NBA logic lives in `AdminCrm.tsx` (`nextBestAction` helper).

### Lifetime stats

`stats` row of 5 `.stat` tiles: LTV · Orders · Avg order · Reliability
(0 no-shows tag if perfect) · Last visit (Nd ago).

### Identity & channels

A signal graph (not a CSI dashboard, just real signals on file):

```
📱 phone         +48 600 ··· 142          Primary key
✉  email         lucia.b@gmail.com        Opted in
💬 WhatsApp                                Verified
```

All icons are **custom stroke** — phone, mail, message — not emoji.

Below the graph: a `Data completeness` meter (N/4 on file: name, phone,
email, consent). 4/4 reads `100%` in `--success`.

### Loyalty

Tier pill + points + manual "+ Adjust" affordance + "Last redemption" row.
Manual adjustment hits `/api/admin/members/points` (manager+).

### Consent toggles

```
SMS marketing                                  [●━━]   on
Email marketing                                [●━━]   on
```

Each toggle persists immediately via `PATCH /api/admin/customers/{phone}/
consent` (CLAUDE.md rule #7 — toggle = saved). No separate Save button.

### Concierge notes

Refined `.pf-note` strip — `--surface-2` background, **2px platinum left
border**, body in `--fg-muted`, author + date in `--fg-subtle`. The
platinum border is the one visual nod that says "this is a curated VIP
note", not a sticky-pad.

### Recent orders

Last 3 orders (date · items · total in mono). Rollup "+N earlier orders"
link below when there are more.

### GDPR

Two restrained ghost buttons in a panel footer: **Export (DSAR)** and
**Erase** (danger-bordered). Real wiring hits `/api/admin/gdpr/export`
(Art. 15) and `/api/admin/gdpr/delete` (Art. 17, owner-only, requires
`confirm:true`).

## Density rules

- **Spacing breathes** — `--space-5` (24px) and up between sections.
- **Whitespace is the signal** that this is the exploratory side of the
  spectrum. Resist the urge to fill it.
- The page is **scrollable**; the book + profile each have their own
  internal scroll. No global page scroll.
- Refresh is a manual button + 1s clock. **No SSE here** — fetched on
  mount and on explicit refresh. (KDS uses SSE; CRM doesn't need it.)

## Per-customer compose

Each row offers an inline SMS/Email composer (modal dialog). Sends route
through `/api/admin/customers/{phone}/send`:

- Manager+ role
- Rate-limited **3/hour/customer**
- Honours opt-outs (button disabled if opted out)
- Audit-logged as `comms.manual_send`

## Mobile

No separate mobile surface — the mobile shell is retired (see
[`../../admin/mobile/README.md`](../../admin/mobile/README.md)). The Guests
book renders its `.core-suite` layout at every width and reflows
responsively on a phone (single column, sidebar → icon rail). The old
`MobileCustomers` / `MobileCustomerDetail` components were deleted in the
cleanup.

## What this module is not

- Not a campaign builder (that's in WhatsApp / Growth).
- Not a chat hub (that's in WhatsApp).
- Not a loyalty admin (that's `/admin/loyalty`).

The CRM is the **system of record for the guest** — every channel and
order rolled into one profile, with the next move surfaced.
