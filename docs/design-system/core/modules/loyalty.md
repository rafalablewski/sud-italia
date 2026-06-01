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

## Three tabs (one `.seg` switch)

| Tab            | What it shows | Data source |
| -------------- | ------------- | ----------- |
| **Members**    | Every loyalty member — tier badge, point balance, orders, lifetime spend, last order. Name/phone search + tier-filter chips (`all` / Platinum / Gold / Silver / Bronze) + sortable columns. Each row links to the customer detail page; the row action opens the **adjust-points** dialog. | `GET /api/admin/members` |
| **Family wallets** | Each shared pool (head + up to 6 phones) with per-member status (`active` / `pending`); operator can **Dissolve** a wallet. | `GET /api/admin/wallets`, `DELETE /api/admin/wallets` |
| **Redemptions** | The burn log — when, which customer, solo or wallet, which reward, points spent. | `GET /api/admin/wallet-redemptions` |

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
