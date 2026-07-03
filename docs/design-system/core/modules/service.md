# Core · Service

The merged Floor + Slots surface. `/core/service` (redirects to Floor).
Four nested views via `serviceTabs` (`src/core/service/serviceTabs.ts`): **Book · Floor · Slots · Dispatch**. (Book moved here from the top-level Lens Rail / the Guest hub — it is a Service view, reached from the Floor lens, and is no longer its own lens.)

## Floor (`/core/service/floor`) — wired

- **Live code:** `src/core/service/CoreFloor.tsx`.
- **Theme:** `.core-crumb` (dense-console breadcrumb) · `.core-sectionhead` ·
  `.core-statstrip` · `.core-floor` / `.core-zone-h` / `.core-tables` /
  `.core-tbl2` (+ `.core-tbl2-wrap` / `.core-tbl2-edit`) · `.core-floor-bar` /
  `.core-fchip` · `.core-tbl-field` · `.core-bottleneck` in
  `themes/core/index.css`.
- The live room, in the **dense-console** language (1:1 with
  `tests/sketches/core-pages/04-service-floor.html`): a `.core-crumb`
  breadcrumb (`CORE — SERVICE · FLOOR · liquid glass · [loc · dine-in]`), a
  `.core-sectionhead`, then a **6-up `.core-statstrip`** — **seated · free · on
  bill · covers · occupancy · spend / hr** — every figure from live floor +
  order state (Rule #1; the value colours read info/basil/amber/brand and each
  cell carries a mono delta). Tiles are **landscape `.core-tbl2` cards** with a
  state-tinted left accent rail (`--accent`): **free** = basil · **seated** =
  info · **billing** (a table carrying an unpaid order) = amber · **freeing**
  (predicted ≤15m) = amber · **reserved** muted · **out-of-service** faded.
  Each tile reads a big table number + a lowercase status dot on the top row,
  then a covers line (`N covers` / `N-top`), a dwell line (`N min` / `open` /
  `reserved`), an optional check line (`zł` + `open`/`on bill`), and a **single
  most-urgent chip** chosen by priority (food-up → guest-ordered → allergy →
  unpaid → note → paid) rather than stacking them all. Hover reveals a `⋯`
  **edit** affordance. The tile of the **cross-lens selected
  table** rings + ember-pulses via `.core-tbl2.is-focus` (shared
  `@keyframes core-focus-pulse`, reduced-motion-guarded) — so the entity in
  focus is visible on the Floor even after it was picked on another lens.
- **Tap a table → a state-aware RadialActions bloom** (`.core-radial`,
  portaled to the `.core` root per Rule #4) offers 3-4 verbs for that table's
  state (seated → Open check · Move · Free · Edit; free/reserved → Seat · Reserve ·
  Edit; out-of-service → Restore · Edit). The tap also feeds the Context Dock.
  Zones are filterable via the mockup's **`Zone` subbar** (`.core-zonetabs`
  with a `.core-zone-lbl` label — `Zone · All zones · <zone>×N`).
- **Open check → the check opens as a panel over the floor** — the core IA
  move. The radial's **Open check** verb mounts the **embedded till** (`<CorePos embedded>`)
  in a docked `.core-check-panel` inside a `.core-check-overlay` scrim, portaled
  into the **`.core` theme root** (not `document.body`, so it keeps core tokens —
  same rule as `CoreDialog`). The panel opens (or focuses) that table's dine-in
  check with the party as covers and is where build / modify / course / split /
  pay all happen — **no navigation to a separate till**. The panel header is
  table-forward (back-arrow · **Table N** · party + item count + running total ·
  QR · Done); **Esc** or the back-arrow closes it, the scrim-click dismisses, and
  body scroll is locked while it's open. Closing reloads the
  floor so pay-status / occupancy refresh. An occupied tile also carries a small
  secondary **Free** button (`.core-tbl2-clear`) to clear the table without
  opening the check. Floor is Core's **home** (`/core` and `/core/service`
  both land here; the bottom switcher leads with **Floor**).
- **Predictive-seating recommender** (`.core-floor-bar`): type a party size
  and `recommendSeating(twin, n)` ranks best-fit tables as `.core-fchip`
  chips — *seat* now or *~Nm* until free; click to seat directly.
- **Table CRUD**: *+ Add table* (subbar) / the per-tile `⋯` opens the
  `TableDialog` (core `CoreDialog`, portaled) — number · seats · zone
  · status, with delete.
- The **kitchen-bottleneck banner** (`.core-bottleneck`, dense-console card:
  `.bn-ic` icon chip · `.bn-msg` with a seating recommendation · `.bn-tag` ·
  `.bn-act` route action) fires when the KDS engine reports a strained
  station — amber at `warn`, danger-red at `risk`.
- **Engine:** `GET /api/admin/floor-twin?location=` → `{ twin, kitchen }`
  (visibility-aware 15s `usePolling`; create/edit/delete merge optimistically
  into the twin so a tile never blanks until the refetch lands); seat/clear =
  `POST /api/admin/floor-twin { action, tableId }`;
  table create/update = `POST /api/admin/floor/tables?location=`, delete =
  `DELETE /api/admin/floor/tables?location=&id=`.

## Slots (`/core/service/slots`) — wired

- **Live code:** `src/core/service/CoreSlots.tsx`.
- **Theme:** `.core-crumb` · `.core-sectionhead` · `.core-statstrip` ·
  `.core-surge-banner` · `.core-slots-grid` (two-column) · `.core-frame` /
  `.core-frame-h` / `.core-frame-b` · Manage rows `.core-mslot` (`.barwrap` /
  `.mbar` fill + `.meta` + `.core-tchip` tier chip + `.mcap`) ·
  `.core-slot-week` / `.core-slot-day-h` (week grouping) · Demand rows
  `.core-exch-head` / `.core-applyall` / `.core-exrow` / `.core-tier` /
  `.core-lever` (`.lv` + `.why`) / `.core-apply`.
- Rendered in the **dense-console** language (1:1 with
  `tests/sketches/core-pages/05-service-slots.html`): a `.core-crumb`
  breadcrumb, a `.core-sectionhead`, a **Day / Week** + date + New-slot
  sub-toolbar, then a **6-up `.core-statstrip`** — **booked · capacity · fill ·
  surge windows · peak fill · demand price** (all live from the slot set —
  Rule #1; a "surge window" is one filled ≥85%, peak drives the price
  multiplier). When any window is ≥85% a **`.core-surge-banner`** offers a
  one-tap *Apply surge levers* — its `.sb-h` title and `.sb-s` detail are
  block-level so they stack (title over detail) like the mockup, not jammed
  onto one line.
- **Manage** and **Demand exchange** are shown **side by side** in
  `.core-slots-grid` (not tab-switched — both columns are live; the grid
  stacks below 1000px):
  - **Manage · service windows** — each `.core-mslot` is a capacity fill bar
    (basil→amber→danger ≥85%), a booked/status meta line, a **tier chip**
    (healthy · tight · full) that doubles as the **active/draft toggle**, and
    `N / max`; hover reveals a delete affordance. Week mode groups the seven
    days under `.core-slot-day` headers.
  - **Demand exchange** — per-slot forecast vs capacity with a **tier**
    (under · healthy · tight · over · kitchen-capped) and a **lever** (`.lv`
    raise / protect / trim / hold + a `.why` note); **Apply** one or the
    **⚡ Apply all** header action.
- **Create** (`+ New slot`) opens a `CoreDialog` with a **Single / Bulk**
  mode toggle: Single posts one slot (time + capacity); Bulk generates a
  start→end range at an interval.
- **Engine:** `GET /api/admin/slots?location=[&date=]` (day = date-scoped,
  week = whole location sliced client-side) +
  `GET /api/admin/demand-exchange?location=&date=` (forecast); toggle =
  `PUT /api/admin/slots`; create = `POST /api/admin/slots` (single) /
  `POST /api/admin/slots?bulk=1` (range); delete =
  `DELETE /api/admin/slots?id=`; apply = `POST /api/admin/demand-exchange`
  (`{ slotId, maxOrders, minSpendGrosze }` single / `{ mode: "apply-all" }`).

Wired 1:1 to the same shared server engine. The booking console (slot + table
in one move) is the **Book** view — see below.

## Book (`/core/service/book`) — wired

`src/core/service/CoreBook.tsx` — a **Service** view (`serviceTabs("book")`,
eyebrow `Service · Book`), alongside Floor · Slots · Dispatch. Legacy
`/core/book` and `/core/guest/book` redirect here. Rendered in the
**dense-console** language (mockup 11-book): a `.core-crumb` breadcrumb +
`.core-sectionhead`, then a **6-up `.core-statstrip`** — **bookings today ·
covers · seated · upcoming · no-shows · fill** (all from the day's reservations
— Rule #1; fill = booked covers ÷ total seats). A `.core-book-tlbar` gives the
timeline a title + a status **legend** (confirmed · seated · pending · conflict).
The **timeline-over-tables grid** (`.core-book-tlpanel`, 17:00→23:00 in 30-min
ticks): reservation **blocks** are positioned by time/duration and **toned by
status** (`.core-bk-blk.seated` info / `.pending` amber), **overlaps hatch red**
live (`.conflict`, one `findReservationConflicts` pass per booking), and a block
**drags to another table row to reassign** (HTML5 drag → the reservations `POST`
upsert with `override`). The timeline sits **left**; the **new-reservation form
is the right rail** (`.core-book-form`, grid col 2): pick a capacity-tinted
dine-in slot chip (`.core-bk-slotchip`; the selected chip is a translucent
**brand-wash**) + party size, then a table — ranked by the **Seating
Intelligence Engine** (`src/lib/seating.ts`, `suggestTables`): once a slot gives
a seating time, every table is hard-filtered (fit · free-for-the-turn ·
availability) then scored (right-size · runway · guest · pacing · yield), so the
✨ Recommend row is the engine's top pick and each row's tag + tooltip is its
reason (e.g. `held 32m`, `large table — protected for big parties`, `VIP hold`,
`patio full this window`, `89 pts · exact fit`). Excluded tables dim. Entering a returning guest's **phone** pulls their CRM seating profile
(`.core-bk-guestmatch`, GET `/api/admin/floor/guest-prefs` → `getGuestSeatingProfile`
— VIP standing from spend/visits/loyalty, usual table + zone from reservation
history) and feeds it into the engine's `guest` signal, so a regular is nudged
toward their usual table/zone. Below the
picker a **signals panel** (`.core-bk-signals`) lays the score open for the
chosen (or recommended) table: the weighted contribution of each of the **six**
signals as a labelled bar (`.sg-bar` — fit/runway/guest/pacing/yield/**section**,
each colour-coded), the 0–100 total, a **facts** row (`.sg-facts` — confidence %,
expected turn ±band, and the predicted **frees-at** time), the `reasons`, and a
**shadow** badge when shadow mode is on — so a pick is never a black box. Before a slot is picked it falls back to a plain
capacity check. A **Guest needs** chip row (`.core-bk-needs` — accessible ·
high-chair · step-free) hard-filters the picker to tables that offer every
required feature (tables carry `features`, edited in the Floor table dialog's
Accessibility toggles). When **no single table fits** the party, a **Combine
tables** section (`.core-bk-joins`/`.core-bk-join`, from `suggestJoins`) proposes
the fewest same-zone free tables that sum to the party; picking one seats the
primary and holds the rest together (`Reservation.joinedTableIds` — the seat
spine seats/frees every combined table as one, shown as "T5 + T6"). Then capture
the guest and confirm. The engine has these
live surfaces here: **(1) seat lifecycle** — Today's-bookings rows carry
**Seat / No-show / Complete** actions (`.bact`) that transition the reservation
and stamp `seatedAt`/`completedAt` (POST `/api/admin/floor/reservations`), so
Book answers "who's at T5?" — **seating also opens a dine-in POS tab** on the
table tagged with the guest (concept 5 phase 1; an empty one is cleared if the
party leaves without ordering), so the check is live where the party sits; **(2) walk-in guard** — a subbar **+ Walk-in**
button (`.core-bk-toolbtn.walk`) opens a `CoreDialog` that ranks tables at *now*
and only seats a genuinely-free one (writes a `source:"walk-in"` seated
reservation); **(3) manager policy** — a **⚙ Policy** `CoreDialog` with the
preset + weight sliders + numeric **rules** (`.core-bk-rules` — reset buffer,
pace cap, large-table seats, **section cap** per zone/15m, **reserved grace**
[keep a booked table held N min past its slot for a late guest] and **big-table
release** [only protect a large table while big demand is further than N min
away]), the **Guards**
toggles (`.core-bk-toggles`/`.core-bk-toggle` — **Protect large tables** hard-drops
a small party from a big top when a smaller one is free, **Auto-suggest**
pre-selects the engine pick, **Learn from overrides** logs every seat, **Shadow
mode** makes the engine advisory-only), a **VIP hold** zone picker
(`.core-bk-vipzones` — held zones exclude non-VIP parties), and a **Trust loop**
readout (`.core-bk-trust` — the agreement/override rate over logged seats, the
most common override **reason**, and a weight-tuning **nudge** `.core-bk-nudge`
when one signal is behind ≥40% of overrides), all persisted per location (GET/PUT
`/api/admin/seating/policy`, Rule #7); **(4) learned turn-times** — the engine
reads a model derived live from completed reservations' `seatedAt→completedAt`,
learned per **party × daypart × weekday-group** (weekday vs Fri/Sat) with a
confidence band, and a **predicted-vs-actual accuracy** readout
(`.core-bk-turnacc` — MAE, in-band %, and the bias direction, from
`summariseTurnAccuracy`) over the location's real closes (GET
`/api/admin/seating/turn-model` returns `{ cells, accuracy }`), cold-starting on
defaults;
**(5) trust loop** — every booked seat POSTs recommended-vs-chosen (+ the
override-**reason** chips `.core-bk-orsn` shown when the pick differs from the
recommendation, + the recommended pick's dominant signal) to
`/api/admin/seating/decisions` when Learn-from-overrides or Shadow mode is on, so
the override rate and the tuning nudge are measured numbers, not a guess.
**Today's bookings** (`.core-bk-blist`) is a
**full-width list below**, with cancel. A **lens toggle** in the section header
(`.core-bk-lenses`) switches the surface between three views over **one shared
occupancy truth** — the **TableSession spine** (`src/lib/table-session.ts`,
`buildTableSessions`) — so they can never disagree: **Timeline** (the plan),
**Floor** (`.core-bk-floorlens` — a live table-tile grid built from the sessions:
`seated` tiles show the guest + elapsed with Complete, `due` bookings show "due" +
Seat, `held` tiles show the next booking's countdown, `free` tiles tap to seat a
walk-in, and a table seated **off-book on the legacy floor** with no reservation
renders as a dashed **`.offbook`** "occupied · walk-in" tile — surfaced, not
actioned here), and **Arrivals** (`.core-bk-arrivals` — the host queue: **Expected
· Waitlist · Seated**). The **Waitlist** column (`.core-bk-wladd` add row +
`.apc.waitc` entries, backed by `/api/admin/floor/waitlist`) queues walk-ins with
a **live wait quote** from `estimateWaitMin` (soonest a fitting table frees, pushed
out by the parties ahead); an entry flips to "table ready" and **Seat** drops them
onto the engine's pick (a `walk-in` seated reservation) and closes them out of the
queue. `nowMin` is live client state (ticks every 30s) so Floor/Arrivals stay
current. **The spine is bidirectional**: seating/completing a
booking here fans out to `FloorTable.status` (via `reconcileFloorTable` in the
reservations route), so the POS-integrated `/core/service/floor` (`floor-twin`)
reflects it immediately; conversely a walk-in seated from that floor shows in this
Floor lens as an off-book tile. `buildTableSessions` is pure (caller passes
`nowMin`) and unit-tested (`table-session.test.ts`). Timeline rows + the table-pick list read **`T{n}`, ordered by table
number** (shared with Floor's `tLabel`). The **surface sub-bar**
(`.core-surf-toolbar.core-bk-subbar`, above the crumb — same shared bar POS/KDS
use) carries the weekday label + a compact date chip (`.core-bk-datefield`) and a
brand **New reservation** pill (`.core-bk-newpill`, focuses the guest field). A
**◔ Forecast** button opens a **pre-service simulation** `CoreDialog`
(`.core-bk-sim`, from `simulateService` via GET `/api/admin/seating/simulate`):
bookings/covers/peak-occupancy KPIs, a per-30-min table-occupancy bar chart
(`.core-bk-simchart`), and the **at-risk bookings** list (no table · too small ·
double-booked) so a manager sees pressure and un-seatable parties before doors
open. The engine also runs a **look-ahead** pass live: a table a *specific* known
later booking will need (a big party still to come that fits it tightly) is held
back from a smaller party now, with the reason *"needed for a 8 at 20:00"*.
Engine: `GET /api/admin/{slots,floor/tables,floor/reservations}`; create `POST
/api/admin/booking`; reassign/cancel via `POST` / `DELETE /api/admin/floor/reservations`.

**Dense-console parity** (`src/app/themes/core/parity/book.css`, imported after
base+skin; scoped under `.core`): the three cards (timeline · new-reservation
rail · today's-bookings list) are **frosted-glass** in the liquid-glass skin
(sheen + backdrop-blur + floating shadow), matching the mockup's `.glass` columns
and POS's frosted surfaces — see `../skins.md`. **Layout gutter:** `.core-book`
owns a single `14px` horizontal padding + a `10px` `column-gap`, and the stat
strip / divlabel / bookings list drop their own side margins inside Book — so
every row (header rows, the timeline↔form columns, and the list) shares one
left/right edge and the timeline/rail sit in a 10px channel (mockup `.main`
padding + `.book-grid` gap). Stat strip: Fill basil, Upcoming plain ink.

## Floor — live orders, lookup & notes

Live code: `src/core/service/CoreFloor.tsx` · API `src/app/api/admin/floor/orders/route.ts` (orders) + `/api/admin/floor/tables` (CRUD, now incl. `notes`) + `/api/admin/floor-twin`.

The Floor board pairs the predictive twin with the table's **live orders**:

- **Per-table status chip** — each tile shows what the table owes, driven by
  `GET /api/admin/floor/orders` (today's active orders, grouped by `tableId`,
  tagged with channel + paid/unpaid). Unpaid → a brand `… to pay` chip
  (prefixed `QR ·` for QR-channel orders); fully paid → a basil `✓ paid` chip.
  A glanceable service-note chip (`.core-tnote-chip`) sits on the tile; a note
  naming an allergy/dietary risk goes amber (`.alrg`, `⚠`) so it reads across
  the room, not on hover. Polls every 10s.
- **To pay KPI** — count of unpaid active orders across the floor.
- **Order lookup** — a `⌕ Find order` box filters active orders by id, guest
  name or table number; each result shows channel + paid status with a
  **Mark paid** action (`POST /api/admin/floor/orders {action:"settle"}` →
  `updateOrder` sets `paidAt`, fires a still-pending order to the kitchen).
- **Table detail** (the `⋯` editor) — adds a **Service note** textarea
  (persisted on `FloorTable.notes`, threaded through `buildFloorTwin` →
  `TwinTableRow.notes`), an **Accessibility** toggle row (`.core-tbl-features` —
  accessible · high-chair · step-free, persisted on `FloorTable.features` and
  threaded through the twin so the seating engine can match a guest's needs),
  and an **Orders at this table** list with the same
  settle action.

## Dispatch (`/core/service/dispatch`) — wired

- **Live code:** `src/core/service/CoreDispatch.tsx`; API
  `src/app/api/admin/dispatch/route.ts`; store helper `assignOrderDriver`
  (`src/lib/store.ts`).
- **Theme:** dense-console (mockup 06-service-dispatch): `.core-crumb` +
  `.core-sectionhead` + `.core-statstrip`, then a `.core-disp-grid` (queue +
  drivers). The order cards stay token-styled inline; `.core-disp-drivers` /
  `.core-disp-driver` / `.core-disp-dstat` style the drivers panel.
- The delivery driver board. `GET /api/admin/dispatch?location=` returns the
  active delivery orders (`fulfillmentType==="delivery"`, status in
  confirmed→preparing→ready→assigned→picked_up, non-simulated) plus the
  location's **drivers** (staff whose role is in the `delivery` group —
  `driver`/`courier` — and `status==="active"`).
- A **6-up `.core-statstrip`** (in kitchen · ready · on road · delivered today
  · drivers · unassigned — all live, Rule #1) and a command-bar **⚡ Auto-assign
  nearest** action (assigns the earliest unassigned ready order to the first
  idle driver). Left column **Pass · delivery queue**: each card shows
  `#shortId`, address, items + total + customer, a status chip, and driver
  controls (unassigned → one-tap **assign chips**; assigned → driver +
  **Unassign**). Right column **Drivers** panel: each driver with a status
  derived live from the board — **en route** (a picked-up order) / **loading**
  (assigned, at pass) / **idle** — via `driverState`.
- Writes go through `PUT /api/admin/dispatch` — `{orderId, driverId}` calls
  `assignOrderDriver` (sets `Order.assignedDriverId`; the `assigned_driver_id`
  column + row mappers already existed) and `{orderId, status}` advances the
  lifecycle via the shared `updateOrderStatus` (assigned → picked_up →
  delivered). Both are audit-logged (`orders.assign_driver` /
  `orders.status_change`). The board polls every 8s. No parallel money/lifecycle
  state — it drives the same `Order`.

## Dense-console 1:1 parity pass (2026-07-02)

Parity layers: `src/app/themes/core/parity/{floor,slots,dispatch}.css` (imported after base+skin; scoped under `.core`). See `../redesign/PARITY-AUDIT.md`.

- **Floor** — stat strip Seated · Free · On bill · Covers · Waitlist · Occupancy (Occupancy last; **Waitlist is live** from the host queue `/api/admin/floor/waitlist`, polled every 15s); bottleneck banner above the strip; zone pills under the section head; tiles are `div[role=button]` with an inline `.core-tqa` quick-action row (Seat/Reserve/Merge · Bill/Move/Clear) on select/hover; `T`-prefixed numbers; order-lookup + seating recommender collapsed into a `.core-floor-tools` disclosure.
- **Slots** — leading `Manage|Demand` seg (brand-active) · Day/Week seg · styled `datefield` · `Filters` ghost (cycles fulfillment channel) · orange New-slot pill (`.core-slot-add`) · `Refresh` ghost; stat cells 5–6 are Covers booked (info) + No-show risk (danger, flagged); default `.delta` basil/green; Manage tier chips fixed 46px.
- **Dispatch** — free-standing status-tinted order-pass cards (`.core-dcard .ready/.inkitchen/.road`) with itemized lines + inline assign/advance (no wrapping frame, no full-width advance button); driver roster gains an ETA column (`.core-roster-eta`); stat strip carries Avg delivery + Late; section sub `pass → road · {loc} · {clock}`; `delivery dispatch` subbar label. Drivers are seeded (delivery-role staff) so the roster populates.
