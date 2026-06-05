# Admin — Operations

← back to [Admin README](../README.md)

The pages an operator hits during service to keep the menu live, the
recipes consistent across locations, the kitchen compliant, and the shift
handed over cleanly.

| Page               | Code                                                                 | Role-gate   |
| ------------------ | -------------------------------------------------------------------- | ----------- |
| `/admin/menu`      | `src/components/admin/AdminMenu.tsx`                                 | manager+    |
| `/admin/recipes`   | `src/components/admin/AdminRecipes.tsx`                              | manager+    |
| `/admin/haccp`     | `src/components/admin/AdminHaccp.tsx`                                | staff+      |
| `/admin/waste`     | `src/components/admin/AdminWaste.tsx`                                | staff+      |
| `/admin/handover`  | `src/components/admin/AdminHandover.tsx`                             | manager+    |

> **Slots & Floor are now the Core Service surface.** They were merged and
> rebuilt on the Core suite theme (CoreShell) as the **Service** surface —
> Floor (live room + twin) and Slots (capacity + demand), each its own nested
> route `/core/service/{floor,slots}` (booking moved to the Guest hub at
> `/core/guest/book`). The old `/admin/slots` and `/admin/floor` stub pages
> were deleted; their anatomy now lives in
> [`../../core/modules/service.md`](../../core/modules/service.md), not here.

## Common rules across the section

1. **Live edits, not staged.** Every page here writes through to the
   database on save (no draft-then-publish workflow). Operators need
   today's menu live now, not on next deploy.
2. **Per-location reads, chain-wide writes for recipes only.** Menu /
   slots / floor are per-location; recipes are chain-wide (CLAUDE rule
   10) — a Margherita's formula is the same in Kraków and Warszawa.
3. **Search lives at the top of the page**, before any filter chips,
   never inside a card. Typing should be the operator's first reflex.
4. **Toast on every persisted action.** "Slot activated", "Item marked
   sold out", "Recipe saved" — confirms the write landed.
5. **Bulk select where lists exceed 20 rows.** Menu and slots both
   support multi-select for "mark sold out on all of these" /
   "deactivate all of these" actions.

## Menu — `/admin/menu`

The unified menu surface: the chain catalogue with per-location price /
availability overrides.

- **Header:** `Menu` (h1), location switcher, search input
  (`Search items, descriptions, tags…`), `+ Add item` primary button.
- **Body:** the **management table** (`v2-mng-*` classes) — one row per
  dish with: checkbox, dish name + thumbnail, category, price (per
  location), availability toggle (sold-out one-click), per-location
  badges, row actions (edit, delete, restore).
- **Bulk actions bar** appears when ≥ 1 row selected — bulk price, bulk
  description rewrite, bulk delete.
- **Soft-delete** with restore for 30 days; never hard-delete during
  service.
- **The chain summary row** (`v2-mng-row-meta aria-label="Chain summary"`)
  shows which locations list the dish — operators see at a glance if a
  dish is Kraków-only or chain-wide.

## Recipes — `/admin/recipes`

The recipe board — one card per dish (deduped by base slug; CLAUDE rule
10). No per-location switch.

- **Header:** `Recipes & Ingredients` (h1), no location filter (chain-wide
  by design).
- **Card per dish:** name, formula (ingredient × quantity), per-portion
  cost, per-portion nutrition (`aria-label="Per-portion nutrition"`),
  allergens, the dietary tag row.
- **Per-location price + margin chips** live on the card itself
  (`v2-rcp-locs aria-label="Listed price and margin per location"`) —
  this is the *only* per-location data on a recipe card because the
  listed price is the only thing that legitimately varies per location.
- **Cost-breakdown bar** (`v2-rcp-cost-bar role="img"`) renders the
  ingredient share visually — top contributor first, smallest sliver
  last, accessible label spells out the percentages.
- **"X-only" tag** when a dish isn't on every location's menu — operators
  see the chain coverage from the card.
- **Ingredient catalogue** is shared chain-wide; never expose a
  per-location ingredient list.

## Slots & Floor — moved to the Core Service surface

Time-slot capacity, the dining floor (tables + reservations), the live Floor
Twin, and the Demand Exchange yield board now live on the **Core** theme as the
**Service** surface (CoreShell), as nested routes `/core/service/{floor,slots}`
(the slot+table booking console moved to the Guest hub, `/core/guest/book`). The
old `/admin/slots` and `/admin/floor` stub pages were deleted. See
[`../../core/modules/service.md`](../../core/modules/service.md) for the anatomy,
and [`../../strategy/restaurant-os-blueprint.md`](../../../strategy/restaurant-os-blueprint.md)
for the Demand Exchange (Module 2) + Floor Twin (Module 3) theses.

## HACCP temperature log — `/admin/haccp`

Per-shift cold/hot-holding checks (audit §11.2). Staff+.

- **Header:** `HACCP temperature log` (h1) + location switcher
  (per-location only — a probe reading belongs to one truck; no
  "all locations" view).
- **KPI grid** (`v2-kpi-grid` + `v2-kds-stat`): readings today, flagged
  today (red when > 0).
- **Log form:** a holding-point `Select` (presets from
  `@/lib/haccp` `HACCP_SENSORS`) + a `°C` `Input`. The safe band + the
  ok/flagged verdict are previewed live from `tempVerdict()` — the same
  client-safe helper the server uses on save, so preview never lies.
- **Readings list:** today's readings with the safe band, value,
  `success`/`danger` status `Badge`, and time. Out-of-range readings
  also raise a danger toast and append a `haccp.temp_flagged` audit row.

## Waste log — `/admin/waste`

Reason-coded write-off capture at the line (audit §11.2). Staff+.

- **Header:** `Waste log` (h1) + location switcher.
- **KPI grid:** entries today + zł written off today (warning-tinted
  when non-zero).
- **Log form:** item + reason (`Select` — spoilage / prep error /
  dropped / over-production / customer return / expired / other) +
  quantity + unit + optional zł cost + note.
- **List:** today's entries, reason `Badge`, cost, time. Distinct from
  the Inventory `waste` stock movement — this is the fast at-the-line
  log, audit-logged as `waste.log`.

## Shift handover — `/admin/handover`

End-of-shift sign-off (audit §11.2 / §12.4 #1). Manager+.

- **Header:** `Shift handover` (h1) + location switcher.
- **Record form:** shift (`open` / `mid` / `close`), a cash-session
  `Select` (fetched from `/api/admin/cash`) + counted-drawer `zł` input
  — the server reconciles the two into a real `cashVarianceGrosze` on
  save — three `Switch` confirmations (temp checks logged / waste
  logged / equipment OK), outgoing (→ incoming) manager, and a comment
  for the next shift.
- **History:** last 7 days, each row showing the shift `Badge`,
  managers, a variance `Badge` on the canonical
  (`success`/`warning`/`danger`) ramp, the three check badges, and the
  timestamp. Audit-logged as `shift.handover`.

## What Operations is not

- It is **not** order management — live orders live under Overview
  (`/admin/orders`) and the Core KDS surface (`/core/kds`).
- It is **not** stock management — that's Inventory ([`inventory.md`](./inventory.md)).
- It is **not** the POS — the customer-facing order-entry surface is a
  Core module, not an admin page.
- It is **not** marketing / promotions — those live under Growth.

Operations is the **state of the menu, the recipes, and the compliance /
handover logs** — the things an operator must keep correct so service can
run. (Slots + Floor merged into the Core **Service** surface — see
[`../../core/modules/service.md`](../../core/modules/service.md).)
