# Admin — Growth

← back to [Admin README](../README.md)

The five pages where the operator deliberately moves revenue: live-widget
campaigns, AOV upsells, cart cross-sells, time-scheduled bundles, and
the truck-stop route plan.

| Page                          | Code                                              | Role-gate |
| ----------------------------- | ------------------------------------------------- | --------- |
| `/admin/growth`               | `src/components/admin/AdminGrowth.tsx`            | manager+  |
| `/admin/upsell`               | `src/components/admin/AdminUpsell.tsx`            | manager+  |
| `/admin/crosssell`            | `src/components/admin/AdminCrossSell.tsx`         | manager+  |
| `/admin/scheduled-bundles`    | `src/components/admin/AdminScheduledBundles.tsx`  | manager+  |
| `/admin/truck`                | `src/components/admin/AdminTruck.tsx`             | manager+  |

## Common rules across the section

1. **Every Growth change writes through immediately.** No draft-then-
   publish flow — campaigns, upsells, bundles all save on toggle.
   Operators expect "I turned it on, it's on" (CLAUDE rule 7).
2. **Every Growth surface has a revenue receipt.** Each list view shows
   the contribution metric for each item (campaign clicks, upsell
   take-rate, bundle attach-rate, stop revenue) — never present a
   promo as "live" without showing what it earned.
3. **Combo / bundle discounts must subtract from the actual cart total**,
   not just be displayed (CLAUDE rule 8 + `src/lib/upsell.ts` ::
   `getActiveComboDeals`). A "10% off" promo that doesn't actually
   discount is a worse bug than no promo at all.
4. **Cross-sell suggestions always include espresso + dessert with
   pizza/pasta** (per the `getCartSuggestions` rule in
   `src/lib/upsell.ts`). The operator can add to that pairing but
   can't remove the canonical companion suggestion without explicit
   override.
5. **Move-up / move-down arrows reorder, save immediately.** Both
   Growth widgets and bundle ladders have arrow controls
   (`aria-label="Move up"` / `"Move down"`) — order persists on click,
   toast confirms.

## Programme — `/admin/growth`

The single editor for everything the customer sees on the loyalty
surface — tier ladder, rewards catalogue, referral mechanics, live
widgets. Live code: `src/components/admin/AdminGrowth.tsx`. Writes
through `PUT /api/admin/growth` → `updateLoyaltySettings()` in
`src/lib/store.ts`. Everything edited here flows out via
`/api/settings/public` so customer surfaces (the `/rewards` page,
cart tier banners, the earn preview, the loyalty section on the
location page) pick up the new state within one fetch — no deploy.

- **Header:** `Growth` (h1) + segmented tabs `Rewards · Tiers ·
  Referrals · Live widgets`.
- **Rewards tab:** card grid of the redeemable catalogue. Each card
  shows name, description, points cost, active/disabled badge, with
  inline `Enable/Disable · Edit · Delete` actions. `+ New reward`
  opens the same dialog used for edit — `id` is generated, all four
  fields validated. Customers see only rewards marked `active: true`;
  the redeem API re-checks the active flag server-side so a stale
  client can't redeem a disabled reward.
- **Tiers tab:** one card per tier (Bronze → Silver → Gold → Platinum,
  fixed ladder order). Each card edits four fields, all admin-
  managed: **customer-facing label** (operator can run an Italian
  voice — "Famiglia Oro" — without a deploy), **threshold**
  (cumulative lifetime points to unlock), **points multiplier**
  (drives the earn rate per order), and **perks** (one bullet per
  line, rendered verbatim on the rewards-page tier card). The
  tier-card chrome (colour, icon) stays code-managed per Rule #11 —
  see `TIER_COLORS` in `src/lib/loyalty.ts`.
- **Referrals tab:** referrer-points + referee-discount values + the
  active toggle that gates the whole programme.
- **Live widgets tab:** stacked cards, drag-or-arrow reorder, per-
  widget edit, enable / disable toggle, observed conversion stat
  ("847 views → 31 clicks, 3.6% CTR" inline). Widget types are a
  closed enum (hero override, ribbon, slot callout, exit-intent,
  post-add nudge, orders-in-last-hour, currently-preparing, trending,
  avg-prep-time, happy-hour, truck-location). The public endpoint
  caps the rendered list at `LIVE_WIDGET_LIMIT` (currently 7).

The pure-compute layer (`calculateTier`, `calculatePointsForOrder`,
`pointsToNextTier`) in `src/lib/loyalty.ts` takes the tier ladder
as a parameter — no hardcoded thresholds remain in the helper
module, and so no value an operator can edit can drift away from
what the helpers compute.

## Upsell — `/admin/upsell`

The AOV machinery: bundle ladders + modifier gating.

- **Header:** `Upsell` (h1), subtitle "Lift the value of what they're
  already buying — tiered bundle ladders and gating rules", tabs:
  `Bundles · Modifiers`.
- **Bundles tab:** the **ladder editor** (`bundle-manager/BundleManager.tsx`)
  — multi-tier offers ("add a side for +9, add a side and a drink for
  +14, full combo for +20"), trigger items, per-location availability.
- **Ladder rows** show: tier label, trigger condition, included items,
  customer-facing price delta, observed attach-rate. Reorder via
  arrows.
- **Modifiers tab:** at-a-glance inventory of every menu item that
  carries a `modifierGroups` payload, grouped per truck — group label,
  selection bounds, option list with priceDelta + KDS-flag chips. Live
  code: `src/components/admin/ModifierInventory.tsx`. Reads from
  `/api/admin/menu?location=<slug>` per active truck (derived from
  `getActiveLocations()` so new trucks show up automatically) with the
  seed catalogue as a fallback when the fetch fails, so operator
  overrides + custom items + soft-deletes flow through instead of
  showing stale seed data. Per-item editing still lives on
  `/admin/menu`.
- **Combo discount validation** (CLAUDE rule 8) — preview the actual
  cart math on save, refuse to save a bundle whose math doesn't reduce
  the cart total.
- **Margin-floor guardian on save.** `Save changes` pre-computes every
  active bundle's worst-case contribution margin across the dirty
  locations (`worstBundleMargin` / `collectBundleMarginViolations`,
  same sampler as the editor's Margin tab, against each location's live
  menu) and blocks on a confirm listing every tier below
  `BUNDLE_MARGIN_FLOOR` (40%) before persisting. Confirming saves
  anyway; cancelling keeps the locations dirty so the operator can
  re-tune discount % / minMains and retry. Catches an underwater
  discount at save instead of one order later via the post-order
  `bundle_low_margin` alert — both read the same floor.
- **Experiments tab — A/B ledger** (`ExperimentEditor`). One per-location
  experiment with weighted variants + per-bundle discount overrides.
  Lifecycle controls: a **status pill** (draft / running / stopped) with
  **Start / Stop** (Start needs ≥2 variants; assignment only runs while
  `running`), a **control-variant** selector (the baseline the others are
  measured against), and a **primary-metric** selector (contribution /
  AOV / conversion) that decides which significance verdict drives the
  call. Each variant row carries a **Promote winner → live bundles**
  action: it copies that variant's overrides into the live bundle config,
  stops the experiment, and records a `result` (winner + promoted). The
  promoted discounts pass back through the margin-floor guardian on the
  next save. Verdicts themselves are read on the Reports bundle-analytics
  card (see [`finance.md`](./finance.md)).
- **Cross-sell intelligence — ML ranker panel** (`MLUpsellPanel`). A
  per-customer logistic ranker trained on the truck's real orders.
  Shows model status (trained-at, training examples, base attach rate,
  log loss), a **Train now** button (POST `/api/admin/ml-upsell`, writes
  the model immediately), and a **rollout %** slider — the deterministic
  phone-bucketed share served the ML-ranked cross-sell vs the rules
  ranker (persisted in `LocationUpsellConfig.mlUpsellRolloutPct` on Save
  changes). 0% or no trained model = rules ranker for everyone, so the
  slider is safe to raise before training (it does nothing until a model
  exists).

## Cross-sell — `/admin/crosssell`

The cart-rail suggestion engine: what to recommend alongside what.

- **Header:** `Cross-sell` (h1), subtitle line.
- **Body:** the **trigger → suggestion** matrix. Rows are triggers
  (item, category, or "any pizza"), columns are suggestion candidates,
  cells hold the priority weight (0..10) and the observed accept rate.
- **Canonical pairings are pre-seeded** — pizza+espresso, pasta+dessert
  — and can't be cleared, only over-weighted.
- **Per-location overrides** — a Kraków-only seasonal can be a Kraków-
  only cross-sell.
- **Reset to defaults** button resets to the canonical pairings without
  touching custom additions.

## Scheduled bundles — `/admin/scheduled-bundles`

Time-windowed bundle activation — "Lunch combo, weekdays 11–14".

- **Header:** `Scheduled bundles` (h1), location switcher,
  `+ New schedule` primary.
- **Table:** schedule name, bundle (links to Upsell), days-of-week
  chips, time window, start/end dates (optional), status
  (active / paused / expired), next activation, observed activations.
- **Conflict warning** when two schedules overlap on the same trigger
  — surfaces inline, doesn't block save (operator decision).
- **Expiry handling** — schedules past their end date show as
  `expired` with a one-click `Extend` action.

## Truck — `/admin/truck`

The route + stop plan — where the truck physically goes when.

- **Header:** `Truck ops` (h1), location switcher,
  `+ New route` primary.
- **Routes list:** route name, stops (chips), days-of-week, total
  duration estimate, observed revenue rank per stop.
- **Stop-revenue ranking** — for each route, the per-stop attribution
  is approximate (matches events whose route includes the stop name,
  splits revenue evenly across stops). Frame it as "rough" in the UI —
  GPS event matching is the next improvement.
- **Route editor:** stops in order, drag-or-arrow reorder, per-stop
  arrival / departure window, optional notes.

## What Growth is not

- It is **not** marketing automation — there's no email blast composer
  or segment-based push pipeline here. Outbound lives in the Guest hub's
  WhatsApp surface (Core).
- It is **not** menu engineering — profitability analysis (high-margin
  vs popular) lives under Intelligence (`/admin/menu-engineering`).
- It is **not** the loyalty programme — points and tiers live under
  Customers; Growth references the wallet but doesn't run it.
- It is **not** financial projection — Calculator (Finance) is where
  hypotheticals live.

Growth is the **deliberate revenue levers** — every page is a control
the operator can pull this week to move next week's number.
