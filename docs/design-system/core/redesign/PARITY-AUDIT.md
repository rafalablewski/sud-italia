# Core Dense-Console — Live 1:1 Parity Audit (mockup = golden)

> Method: every `/core/*` page rendered headless (authenticated owner, 1680×1050)
> and compared side-by-side against the uploaded **Dense Glass Console** mockup
> (`ddf97e27-coredenseconsolesuite.html`). POS is the accepted golden reference;
> this file lists where the other surfaces still diverge from the mockup and is
> the working backlog for closing the gap. Severity: **HIGH** structural/missing ·
> **MED** wrong layout/labels/metrics · **LOW** spacing/polish.

Last run: **2026-07-02**.

## Resolution — parity pass complete (2026-07-02)

All structural/visual gaps below are **closed and verified in a production build**
(dev React 19's `eval` is blocked in the headless sandbox; the prod server
hydrates, so verification ran against `next start`). Fixes landed as: per-surface
`src/app/themes/core/parity/<page>.css` layers, the eight `Core*` components, the
KDS pass (earlier commits), the shared stat-strip dividers, the 14-column
`buildAllergenMatrix`, and demo-seed enrichment (the suite-wide order-loss fix,
delivery drivers, live WhatsApp conversations, a family wallet). Every `/core/*`
page now renders populated like the mockup.

**Remaining items are DATA-MODEL additions, not visual gaps** (the UI renders them
with honest empty/derived states): Inbox response-time & opt-in-rate metrics + an
NBA recommendation source; CRM WhatsApp opt-in persistence (a `whatsappOptout`
flag); Loyalty breakage % (a points-issuance ledger); Dispatch avg-delivery time &
numeric driver ETA (a `deliveredAt` + driver telemetry); Orders server-name &
stored discount-reason/VAT-override. Tracked here for a future backend pass.

---

## Systemic root causes (fix once, many pages improve)

- **R1 — Location resolves to `all`.** The shared `LocationContext` defaults to
  `""` (all locations). Orders / Dispatch / Floor / Slots then fetch an empty or
  aggregate set while the mockup shows one populated location (`krakow`). Core
  surfaces should land on a concrete location. **HIGH**
- **R2 — Thin / stale demo data.** The mockup reads "golden" because it is fully
  populated. The live seed is sparse: 6 all-Bronze loyalty members (0 pts/visits),
  no family wallets, no WhatsApp conversations, no delivery drivers or delivery
  orders, few reservations (numeric `customerName`, no no-show/pending), no floor
  open-checks/waitlist, and KDS tickets with `createdAt: undefined` → broken
  `-131:39` SLA. Enrich the seed (real store rows, Rule #1). **HIGH**
- **R3 — Icon-only controls vs labeled tabs+counts.** Loyalty / Inbox / CRM /
  Concierge render glyph-only segmented filters; the mockup uses text tabs with
  count pills (`Members 1 320 · Wallets 412 …`). **HIGH/MED**
- **R4 — Stat-strip drift.** Every surface's stat strip differs from the mockup in
  cell set, labels, value colors, or delta copy. **MED**
- **R5 — Missing avatars / gem badges.** CRM roster, Loyalty members, Inbox
  contacts lack the mockup's tinted initials avatars; tier badges are solid pills,
  not gem chips. **MED**

---

## KDS · Pass — `/core/kds` (priority)

- **HIGH** Owner default lands on **Fleet**; mockup golden is the **Floor** wall.
- **HIGH** Stat strip uses `.core-kpi` (10 cells) not the shared `.core-statstrip glass`
  7-cell set: Active · At risk · Late · Ready · Throughput /hr · Covers /hr · Revenue zł/hr.
- **HIGH** No **dark-board wrapper** (`kds-wall`, `rgba(0,0,0,.34)`) around stations+lanes.
- **MED** Stations render as filter pills, not the mockup's **load meters** (dot + bar + %)
  with an **Expo** summary of colored dots.
- **MED** Ticket header reads `#E-E8QM · Dine-in · 2p`; mockup is `T7 · Tab 2` (table · tab).
- **MED** Bump buttons read `Start firing` / `Mark ready`; mockup: `Start` / `Bump` / `Pass`,
  with new=ember-fill, firing=neutral, ready=basil-fill.
- **MED** Third lane titled `Ready · Expo`; mockup `Ready · Pass`.
- **DATA** Broken `-131:39` SLA (stale/undefined ticket `createdAt`); no cookmeter tone.

## Guest · CRM — `/core/guest/guests`

- **HIGH** Consent block missing the **WhatsApp** opt-in row (mockup has SMS/Email/WhatsApp).
- **MED** Roster meta shows `Member · Takeaway`; mockup shows **segment · location** (`VIP · Kraków`).
- **MED** Drawer subtitle: mockup `VIP · Kraków · guest since Mar 2024` vs app tier-only.
- **MED** "Recent orders" lacks the `view all ›` affordance; Save button says `Save note` not `Save profile`.
- **MED** App appends an extra GDPR **Data/Erase** section absent from the mockup.
- **LOW** Bronze avatars render gold (`avClass` never returns bronze); default sort should be `recent`.
- **DATA** 6 Bronze/0-order members vs 10 rich guests → pale bars, `VIP 0`, `At-risk 0`.

## Guest · Inbox — `/core/guest/inbox`

- **HIGH** Context panel missing whole sections: guest card (avatar+tier+member-since),
  lifestats grid, itemized live-order + total, and the **Next-Best-Action** card.
- **MED** Conversation list uses search + icon filters; mockup: title + `12 open` badge +
  text chips `all/unread/live` with counts.
- **MED** Stat strip cells differ: mockup Live orders / Response time / Opt-ins vs app Live / Conversion / Paid·7d.
- **MED** Thread bubbles lack named staff / "Concierge bot" labels and embedded order/product cards.
- **LOW** Quick-replies + green circular send button; left subbar `whatsapp · live` dot label.
- **DATA** Inbox empty (no seeded WhatsApp sessions; 90-min TTL).

## Guest · Loyalty — `/core/guest/loyalty`

- **HIGH** Sub-tabs icon-only; mockup: `Members · Wallets · Redemptions · Win-back` text tabs + counts.
- **HIGH** No table title bar (`Members` + tier chip filters); app shows search + gem/sort glyphs.
- **HIGH** Member rows lack initials avatars.
- **MED** Tier badge is a solid pill, not a gem chip (diamond + UPPERCASE metal).
- **MED** Stat strip: add **Breakage %**, recolor Gold+ to gold, reorder (Wallets displaces Avg/Breakage).
- **MED** Family-wallet panel: emoji instead of wallet glyph, no avatar stack, no household name / `role · Tier`.
- **DATA** No wallet data → whole family-wallet card absent; all-Bronze thin members.

## Guest · Concierge — `/core/guest/concierge`

- **HIGH** Capability rows show raw ids (`get_menu`) not friendly labels (`Menu lookup`).
- **HIGH** Right inspector has an extra transport block + `GET /api/...` header; mockup shows a
  `[tools/call]` method chip + call name, and a `▶ Test` filled-green button.
- **HIGH** Allergen matrix: emoji column heads vs the 14 EU-FIC **text** labels; app dumps ~30
  dishes vs mockup's 6 curated; backend supplies only ~4 allergen columns (needs full 14).
- **MED** Left pane header `Capabilities` + `6/6 live` badge; row icons; drop RESOURCE/TOOL chip + desc line.
- **MED** Deflection value should be brand/orange; add matrix legend footer + dim `·` absence markers.

## Service · Floor — `/core/service/floor` (RETIRED → `service:tables`)

> **2026-07:** this operational Floor board was retired. `service:floor` was
> renamed to **`service:tables`** (`/core/service/tables`) and scoped down to a
> management-only zones/tables/seats surface; the seating, order-lookup and
> check-over-floor flow moved to **Book's Floor lens** + **POS**. The gaps below
> were logged against the old board and are no longer actionable.

- **HIGH** No persistent **Context Dock** (check + course spine + Fire/Pay) at bottom.
- **MED** Stat strip missing **Waitlist** cell; has extra `Spend/hr`; Occupancy not last.
- **MED** Bottleneck banner renders below the strip (mockup: above) and is hidden when calm.
- **MED** Zone selector buried mid-page; mockup keeps zone pills in the subbar.
- **MED** Tiles lack the inline `.qa` quick-action row (Seat/Reserve/Merge · Bill/Move/Clear).
- **MED** App-only `Find order` + `Seat a party of` bars push tiles down (not in mockup).
- **DATA** 8 tables/no open-checks/no waitlist/kitchen calm vs mockup 16 tables + live checks; tile numbers lack `T` prefix.

## Service · Slots — `/core/service/slots`

- **HIGH** Surge-banner title + subtext render on one jammed line (`sb-h`/`sb-s` not block-level).
- **MED** Missing leading `Manage | Demand` segment; missing `Filters` + `Refresh` buttons.
- **MED** New-slot button is green outline; mockup is an orange `.pill.add`.
- **MED** Stat cells 5/6 differ: mockup Covers booked + No-show risk vs app Peak fill + Demand price.
- **LOW** Native date input on the right vs styled `datefield` on the left; delta default grey vs green;
  no cell dividers; `Apply all (5)` count; section sub prints leading `· ` (empty location) + range not service period.
- **MED** No bottom context dock (window summary + Surge/Confirm-all).

## Service · Dispatch — `/core/service/dispatch`

- **HIGH** Stat cells: replace `Drivers`/`Unassigned` with **Avg delivery** + **Late**; `In kitchen` → info color.
- **HIGH** Order-pass cards lack status-colored left border + tint; status pills outlined not wash-filled;
  items shown as `N items · price` summary not itemized lines; bottom row uses chips not
  `Auto-nearest` ghost + `Assign` solid; a full-width advance button not in mockup.
- **HIGH** Driver roster missing the ETA column (status pill over colored ETA); meta lacks driver code + zone.
- **MED** Section sub `all · pass → road`; mockup `pass → road · krakow · 16:16`. Subbar left label missing.
- **DATA** Location `all` → 0 orders / 0 drivers (empty board). Avg-delivery / Late need real sources.

## Orders — `/core/orders`

- **HIGH** Detail-dialog totals gutted to a single Total; mockup: Subtotal / discount / VAT / grand.
- **MED** `refunded` status pill unhandled (falls to `paid`); no `.core-stpill.refunded` rule.
- **MED** Dialog header: big id + one meta row (guest · table · channel · time · server) vs app's 3 stacked lines; add server name, basil channel.
- **MED** Ticket lines missing ingredient subtitle (`.m`).
- **LOW** Date uses comma not `·`; action-button order/icons.
- **DATA** Empty ("No orders match") — location `all` vs single-slug fetch (R1).

## Book — `/core/book`

- **HIGH** Timeline axis is 11:00–23:00 hourly; mockup 17:00–23:00 in 30-min ticks → real blocks squish.
- **HIGH** Booking form lacks panel header (`New reservation` + date/loc sub); slot chips not capacity-tinted;
  table picker is a chip grid not a fit-tagged list; booking list narrow (`Booked · 3`) vs full `blist` with badge + status columns.
- **MED** Block second line shows `party · time` not `status · context`; no amber **pending** tone; min-spend note + party hint missing; Book button orange not basil w/ dynamic summary.
- **DATA** 2 sparse reservations w/ numeric names; no no-show/pending; no conflict to hatch.

---

## Suggested fix order

1. **R1 + R2** — location default + seed enrichment (unblocks Orders/Dispatch/Floor/Slots/Book/Inbox/Loyalty at once).
2. **KDS** (flagship) — 7-cell statstrip, dark wall, station load meters, ticket header/buttons, SLA freshness.
3. **R3** — labeled tabs+counts + avatars/gem badges (CRM/Loyalty/Inbox/Concierge).
4. Per-page structural gaps (Inbox NBA/context, Floor dock, Dispatch cards/roster, Book timeline/form, Orders dialog totals, Slots surge/dock).
