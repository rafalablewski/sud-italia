# Admin — Growth

← back to [Admin README](../README.md)

The five pages where the operator deliberately moves revenue: live-widget
campaigns, AOV upsells, cart cross-sells, time-scheduled bundles, and
the truck-stop route plan.

| Page                          | Code                                              | Role-gate |
| ----------------------------- | ------------------------------------------------- | --------- |
| `/admin/growth`               | `src/components/admin/AdminGrowth.tsx`            | manager+  |
| `/admin/upsell`               | `src/components/admin/AdminUpsell.tsx`            | manager+  |
| `/admin/crosssell`            | `src/components/admin/AdminCrosssell.tsx`         | manager+  |
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

## Campaigns — `/admin/growth`

The live-widget composer — banners, slot-callouts, hero overrides
operating on the storefront in real time.

- **Header:** `Growth` (h1) / `Growth engine` for the v2 surface,
  segmented tabs (Live widgets · A/B tests · Calendar).
- **Live widgets:** stacked cards, drag-or-arrow reorder, per-widget
  edit (`aria-label="Edit widget"`), enable / disable toggle, observed
  conversion stat ("847 views → 31 clicks, 3.6% CTR" inline).
- **Widget types** are a closed enum: hero override, ribbon, slot
  callout, exit-intent, post-add nudge. Adding a new type is a design
  decision, not a data-entry one.
- **A/B tests** are first-class — variant config + traffic split + live
  results table with significance indicator.
- **Calendar view** shows the upcoming widget schedule overlaid on the
  weekday rhythm.

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
- **Modifiers tab:** modifier-group gating — which modifiers appear for
  which items, which are free vs charged, which are limit-N.
- **Combo discount validation** (CLAUDE rule 8) — preview the actual
  cart math on save, refuse to save a bundle whose math doesn't reduce
  the cart total.

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
