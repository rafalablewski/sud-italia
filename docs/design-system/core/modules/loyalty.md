# Loyalty — the points ledger view

The fourth view of the unified [Guest hub](./guest.md) (Inbox / Guests /
**Loyalty** / Concierge). It is the **operational** loyalty surface — the
member roster, the family wallets, and the redemption log — built on the
Core suite theme so it reads as one platform with the other three views.

← back to [Core README](../README.md) · [Guest hub](./guest.md)

> **Live code:** `src/components/admin/AdminLoyalty.tsx` (the view),
> `src/app/admin/guest/page.tsx` (renders it for `?view=loyalty`),
> `src/app/admin/loyalty/page.tsx` (thin `redirect()` to
> `/admin/guest?view=loyalty`). Styles live under the `LOYALTY` block in
> `src/app/themes/core/suite.css` (`.loy*` + the `.badge.bronze/.silver/.gold`
> tier tones).

## Roster vs config — the split that matters

- **Loyalty (this view)** is the *roster + adjustment* surface: who's a
  member, what tier, how many points, family wallets, the burn log, and a
  manual point adjustment per member.
- **The programme config itself** — tier ladder (labels / thresholds /
  multipliers / perks), the rewards catalogue, and referral mechanics —
  is edited under **Admin → Growth** (`/admin/growth`), not here. The
  subtitle on the page links across. Never duplicate config controls into
  this view.

This mirrors the rest of the Guest hub: the hub is the *operational*
relationship layer; *configuration* and *marketing* are Admin concerns.

## Four tabs (one `.seg` switch)

| Tab            | What it shows | Data source |
| -------------- | ------------- | ----------- |
| **Members**    | Every loyalty member — tier badge, point balance, orders, lifetime spend, last order. Name/phone search + tier-filter chips (`all` / Platinum / Gold / Silver / Bronze) + sortable columns. Each row links to the customer detail page; the row actions open the **Intelligence** dialog + the **adjust-points** dialog. | `GET /api/admin/members` |
| **Family wallets** | Each shared pool (head + up to 6 phones) with per-member status (`active` / `pending`); operator can **Dissolve** a wallet. | `GET /api/admin/wallets`, `DELETE /api/admin/wallets` |
| **Redemptions** | The burn log — when, which customer, solo or wallet, which reward, points spent. | `GET /api/admin/wallet-redemptions` |
| **Win-back** | The auto-retention worklist (Phase 2) — at-risk regulars ranked by value-at-risk, each a prescribed, approvable action. Loads lazily (heavier — scans all orders). | `GET/POST /api/admin/retention` |

The KPI strip (`.loy-kpis` of `.bk` cards) reads from the same data:
total members (+ repeat-buyer count), Platinum count, Gold count,
lifetime spend.

## Tiers

Tier is **derived** (earned + manually-adjusted points run through the
operator-configured ladder), never set by hand on this view. The four
tiers render as core-suite `.badge` tones — `platinum` ships with the
theme; `bronze` / `silver` / `gold` are added in the `LOYALTY` block of
`suite.css`. Tier *labels* disambiguate the warm metallics.

## Manual point adjustment

The row action opens a `Dialog theme="core"` (portaled per CLAUDE rule
#4). Signed integer amount (positive grants, negative deducts) + an
optional reason → `POST /api/admin/members/points`, which lands in the
member's ledger and is summed with order-earned points
(`getManualPointsTotal()`). A toast confirms; the roster re-fetches.
Adjustments are for reconciling missed earns or goodwill credit — not a
moderation tool.

## Customer Intelligence (the per-guest behavioural graph)

Every member row carries an **Intelligence** action (brain icon) beside
**Adjust**. It opens a `Dialog theme="core"` (portaled per CLAUDE rule #4)
showing a behavioural graph derived **live from that guest's real orders** —
the keystone of the Customer Identity Network
([blueprint](../../strategy/restaurant-os-blueprint.md)).

> **Live code:** engine `src/lib/customer-intelligence.ts`
> (`buildCustomerIntelligence`, pure-compute, unit-tested in
> `customer-intelligence.test.ts`); route `GET
> /api/admin/customer-intelligence?phone=` (`withAdmin`, staff+, reads
> `getOrdersByPhone` chain-wide); UI `MemberIntelligenceDialog` in
> `AdminLoyalty.tsx`.

What it surfaces (all derived, never hardcoded):
- **Next-order prediction** headline + a confidence badge (gated by order count).
- **Rhythm & retention:** churn risk (low / watch / high / lost, aligned to the
  90-day lapse line), order count, visit cadence (`~Nd`), days since last, AOV.
- **When & how:** the temporal signature (`Fri 18:30`, computed in
  Europe/Warsaw, not server UTC), preferred channel, channel-mix bars, avg party.
- **Go-to dishes:** dish-affinity bars (share of units).
- **Attach patterns:** conditional rules ("adds Tiramisù when party ≥ 4") with lift.

**Styling note (important):** the dialog portals into `.v2-dialog-core`, which
is **outside** `.core-suite`, so it cannot use `.core-suite` classes. Its
markup uses self-contained `.ci-*` classes (and `.ci-badge` tones) defined
**under `.v2-dialog-core`** in `suite.css` — the same discipline as the
points-adjust dialog's `.loy-dialog-form`. Don't reach for `.badge` / `.bk`
inside this dialog; they won't paint.

## Win-back — auto-retention (Phase 2)

The **Win-back** tab turns the keystone from informing into *operating*
([blueprint Phase 2](../../strategy/restaurant-os-blueprint.md)). It runs the
intelligence engine across every guest, queues the ones whose churn hazard says
they're slipping (`high` / `lost`), ranks by **value-at-risk** (hazard ×
lifetime spend), and prescribes the whole action per guest: incentive size,
consented channel, and a message drafted from their go-to dish. Approving a card
grants the points on the real loyalty ledger and logs the outreach (30-day
cooldown so the same guest isn't re-nagged).

> **Live code:** engine `src/lib/retention.ts` (`buildWinBackQueue`, pure-compute,
> unit-tested in `retention.test.ts`); route `GET/POST /api/admin/retention`
> (`withAdmin`, manager+) — GET builds the queue from `getOrders` + the customers
> consent rollup + the outreach log, and returns which channels can deliver
> (`comms`); POST grants points (`addPointAdjustment`), **sends** on the consented
> channel (`getSmsProvider`/`getEmailProvider`, opt-outs honoured, audit-logged
> `comms.win_back`), and records the outreach (`recordRetentionOutreach` →
> `retention-outreach.json`). UI `WinBackCard` in `AdminLoyalty.tsx`, styled with
> `.wb-*` classes in `suite.css`. Unlike the Intelligence dialog, this tab renders
> **inside** `.core-suite`, so it uses the core `.badge` tones directly.

**Auto-send (the autonomy lever).** Approving a card grants the incentive **and**
sends the message on the consented channel. **Send all reachable** runs the whole
queue server-side in one click (`POST { mode: "all" }`) — the decay-to-autonomy
step where the operator stops deciding per-guest. When no SMS (Twilio) / email
(Mailgun) provider is configured, sends degrade to a **logged no-op** (the
incentive still applies) so nothing breaks without creds; the tab's `.wb-comms`
line shows which channels are live vs logged-only.

## Shared rules

This view inherits every [Guest hub shared rule](./guest.md#shared-rules-apply-to-all-views):
one customer = one record, passive identity, one loyalty-points ledger.
The points balance shown here is the **same** ledger a guest earns on at
the POS, online, or by WhatsApp — never a separate "loyalty points" pool.

## What Loyalty is not

- It is **not** the programme editor — tiers / rewards / referral live at
  `/admin/growth`.
- It is **not** the customer book — the searchable per-customer record
  with notes / consent / GDPR is the **Guests** (CRM) view.
- It is **not** a campaign tool — outreach lives in Admin → Growth and the
  WhatsApp **Inbox** view.
