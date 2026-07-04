# Core · POS

The till. `/core/pos` — **and**, embedded, the Floor's check panel.

- **Live code:** `src/core/pos/CorePos.tsx` (client surface) +
  `src/app/core/pos/page.tsx` (server: resolves per-location menu
  snapshots and passes them in).
- **Embedded mode:** `<CorePos embedded initialTableId onClose>` renders the
  same check builder **without** the `CoreShell` chrome — a slim
  `.core-pos-embed-h` header (a `.core-pos-embed-back` back-arrow · table-forward
  title + party / item-count / running total · QR · Done) over the identical `posBody`
  (check-bar · rail · menu · check · all dialogs). The Floor mounts it in its
  docked check panel so "the check is never a separate place"; `initialTableId`
  opens/focuses that table's check on mount (the same path as the `?table=`
  deep-link). The standalone `/core/pos` surface renders the non-embedded branch
  (full `CoreShell`). One component, two mounts.
- **Theme:** `.core-pos` + `.core-rail` / `.core-cat` / `.core-menu` /
  `.core-prod` / `.core-ticket` in `themes/core/index.css`.

## Layout

The surface leads with a **`.core-sectionhead`** (grotesk "POS · Order" title
+ an uppercase-mono `<location> · dine-in service` sub, left-aligned), then a
row-4 **`.core-surf-toolbar`** (via `CoreSurfToolbar` — the QR-order queue +
the fullscreen-kiosk toggle on the right), over the **`.core-statstrip`** — the
dense-console KPI row. Then the **`.core-pos`** grid inside the shell body:
**rail · [check-bar over menu] · ticket**.

Every region is a **separate rounded, bordered glass card** — the stat strip,
the check-bar, and the three grid columns each float with **10px gaps** and a
14px inset from the body edges (`.core-pos { gap:10px; padding:0 14px 12px }`),
matching the mockup's `pos-grid` + `.glass` columns rather than flush panes cut
by hairlines. `.core-pos` is a **grid-template-areas** layout
(`"rail bar tkt" / "rail menu tkt"`): the **open-check bar sits above the menu in
the middle column**, and the rail + ticket span both rows so all three columns
**top-align with the check-bar** — exactly like the mockup. (On phones the areas
reset and the cards stack: check-bar · rail strip · menu, ticket as a drawer.) Under the liquid-glass skin all five (plus the rail) get the
frosted `--lg-fill` + blur + `--lg-float`/`--lg-rim` treatment so they read as
layered glass; in the flat skins the border + `--sh-1` defines each card. The
rail is `align-self:start` (content-height, floating at the top); the ticket
is `overflow:hidden` so its footer clips to the card's rounded corners.

- **`.core-statstrip`** — an **undivided** glass panel of six live cells (no
  inter-cell hairlines — a clean, open row spaced by cell padding)
  (label · big mono value · colour-coded delta), the mockup's six-KPI set, every
  figure **real** (Rule #1 — no invented numbers): **Open checks** (count · N
  parked / all active) · **Covers seated** (live dine-in covers · `N% floor` from
  the table seats) · **Avg check** (today's AOV · trailing-7-day delta) ·
  **Prep queue** (item units on fired checks · "on time" or the bottleneck at
  risk) · **Table turns** (covers ÷ tables · delta) · **Sales /hr** (today's
  revenue rate · delta). The three live counts (open checks · covers · prep
  queue) come straight from till state; **avg check · table turns · sales/hr**
  are server-computed from real orders (`getPosKpis` → `GET /api/admin/pos/kpis`,
  polled 30s) with honest **same-time-of-day trailing-7-day deltas** (`—` until a
  baseline exists — never a fabricated trend). Toned by `--basil` / `--amber` /
  `--brand` / `--info` / `--danger`; the shared `.core-statstrip`
  visual is documented in the theme README ("Stat strip").

- **`.core-checkbar`** — the `bar` grid area: a glass bar **above the menu in
  the middle column** (over the menu's steering banner), top-aligned with the
  rail + ticket: an optional `.core-sync-pill`, then the
  `.core-tabrail` of `.core-ttab` open-check pills + `+ New`. **No rollup line**
  — count · ready · parked · open value already live in the stat strip (Open
  checks / To pay / Open value), so a summary here would only duplicate it; like
  the mockup, the pills sit straight under the KPIs. The pills follow
  the mockup's `.checkstrip`: **compact single-line mono pills** (`.tt` name +
  a muted inline `.ts` context — `· T{table}`, channel, item count or `empty`)
  laid in **one horizontally-scrolling row** (`flex-wrap: nowrap; overflow-x`),
  not a wrapping multi-row block. The active check gets the ember treatment
  (`.on` = `--brand-wash` fill + ember ring + glow, `.ts` → `--brand-bright`);
  an **off-premise** check (takeaway / delivery) reads info-blue with a channel
  glyph (`.away` + a `.tico` bag/van icon, mockup `.ct.away`) — `.on` is ordered
  after `.away` so an active takeaway still wins the ember treatment;
  `+ New` (`.core-ttab-new`) is a dashed basil pill (label only, no sub-line).
  **`+ New` opens
  optimistically** — the check appears and goes active instantly under a
  client `tmp-` id, then reconciles to the server id when the background
  `POST` returns (carrying over anything rung in the meantime), so the till
  never blocks on a round-trip.
- **`.core-sync-pill`** — amber rounded status chip (`--amber` on
  `--amber-wash`), shown only when the durable write outbox
  (`src/store/writeQueue.ts`) holds unsent writes: `↻ N writes syncing`. It
  tells staff a send/charge made offline is saved and will land on
  reconnect — the visible end of the Phase 2b durable-queue path.

- **`.core-rail.core-rail-icons`** — the category rail, **pure icon-only**
  (collapsed, 56px): each category is a 44px boxed `.core-cat` icon button
  (18px glyph from `CAT_ICON` in `CorePos.tsx` — the dense-console mockup's set
  1:1: dome pizza · fork pasta · basket antipasti · box panini · cloche dessert ·
  cup drinks — `--panel-2` fill + hairline, ember-**wash** `.on`, count as a
  corner badge that sits just outside the box) with the label
  as a `title`/`aria-label` tooltip. A **★ Popular** chip first when present
  (`.core-cat.pop`, styled identically to every category — the star glyph carries
  the "special / default landing category" meaning, no extra ember fill) —
  frequency-ranked top items for the
  current daypart from `GET /api/admin/pos/popular` (real orders, Rule #1;
  hidden when empty) — then an **All** chip (stacks every category as
  `.core-menu-sec` blocks with `.core-menu-sec-h` headers) over the
  per-category `.core-cat` buttons — each lists only categories present on the
  active location's menu, with a live item count as a corner badge (`.n`) and,
  when steering is active, a `.core-cat-promise` per-category ETA (`~Nm` from
  `promiseSecondsByCategory`). `.on` = the selected category (filled ink).
- **`.core-menu` / `.core-menu-grid`** — a dense auto-fill grid
  (`minmax(178px,1fr)`, 8px gutters) of compact `.core-prod` cards (78px min,
  `r-sm`, 9/10 padding — the dense-console density). Each card is
  **text-forward** (no photo dependency): `.pn` (display
  name, with a `.core-role` menu-engineering badge — Hero / Profit / Anchor
  / LTO from `menuRole`) · `.pd` (description, clamped to 2 lines) ·
  `.core-tagrow` of `.core-tag` chips (veg/vegan → `.veg`, spicy → `.hot`,
  gluten-free → `.fast`, plus an `.opt` **options** chip when the item has
  `modifierGroups`) plus a live `.core-steer-tag` pace cue (**★ make
  now** for `makeNow` ids, **▼ ease** for `throttle` ids) · `.pf` footer
  with the `.pp` mono price — **unit-suffixed `NN,NN zł`** (`fmtPLN`), like the
  mockup, not a bare number — and the ember `.add` button (a `⋯` glyph when
  the item is customisable). Cards **stretch to equal height per row** and the `.pf`
  footer is pinned to the bottom (`margin-top: auto`), so a long
  description can't make one card taller than its row-mates. **Calm at rest**
  (matching the mockup): on hover-capable devices the `.core-role` badge and the
  ember `.add` button stay hidden until the card is hovered/focused (`@media
  (hover: hover)`), so a resting card is just name · description · dietary tags ·
  price; a touch till (`@media (hover: none)`) keeps them always visible so the
  button stays tappable — no function lost. Tapping a plain
  card adds it straight to the check; a **customisable** card opens the line
  editor first (see *Line editor* below). Cross-sell is capped at the top **2**
  suggestions so the ticket stays calm (the combo prompt renders separately). A **sold-out** card
  (`.core-prod.sold-out` — base-unavailable OR live-86'd) is **not hidden**:
  it stays greyed + struck with a danger `.core-tag.off` "86 · sold out"
  chip, is disabled, and **sinks to the bottom** of its category (available
  first). The 86 set is polled live from `/api/admin/kds/eighty-six`, so an
  item 86'd on the pass greys on the till within one poll — no reload.
- **`.core-ticket`** — the open-check panel. Today it shows
  `.core-ticket-empty` (the no-open-check state).

## The ticket (open check)

Wired 1:1 to the shared server engine — fresh `core-`
UI, identical contract.

The open-check selector (`.core-tabrail`) lives in the
`.core-checkbar` above the menu (see Layout) — the `.core-ticket` column shows the
**active** check only:

- **`.core-thead`** — the title reads **`Tab N · T{table}`** like the mockup: a
  content-sized `.core-th-name` (the check name is an **inline editable input** —
  click to rename, persisted via the same debounced `PUT`, `size` tracks the value)
  followed by a static `.core-th-tbl` table suffix (dine-in, when a table is
  assigned) and — once the check is sent — a muted `.core-th-ord` order reference
  (`#XXXXX`, kept for KDS / receipt / refund reconciliation). Then a
  `.core-tabpromise` per-check ETA (max `promiseSecondsByCategory`
  across the lines, toned by the bottleneck tier) · the **info-cyan** `.core-chan-aux`
  button — **＋ Assign table / ⇄ Table N** (dine-in, opens the in-pane table picker)
  or **Add / Edit address** (delivery, opens the address dialog). Channel moved to
  the segment below, so the title stays one line. A `.core-delivery-paused`
  banner shows when steering has capped the next delivery window
  (`deliveryCapNextWindow === 0`).
- **`.core-tcovers`** — a **labelled covers row** (dine-in), on its own line like
  the mockup: a `.core-tcovers-l` "COVERS" caption + the `.core-covers` stepper,
  with the attached guest name (`.core-tcovers-g`) and the **`SERVER · <name>`**
  label (`.core-tcovers-srv`, the signed-in till operator from
  `getCurrentAdminUser`, passed as the `operatorName` prop) pushed right —
  matching the mockup. (Moved off the header so the party size reads as its own
  control.)
- **`.core-oseg` / `.core-miniseg`** — the **channel** selector and the dine-in
  **kitchen-timing** toggle share one pattern, matching the mockup's `.order-seg`:
  a mono `.core-oseg-l` caption (CHANNEL · KITCHEN TIMING) stacked over a single
  full-width connected segment (`.core-miniseg` — pill track, options `flex:1`),
  the active option ember-tinted (`.on`). Channel writes `tab.channel`; timing
  writes `tab.coursed`, which the `.core-lines` renderer reads to course or
  flat-list the ticket. (Replaces the old separate `.core-chan` pills + inline
  `.core-timing` toggle so both read identically to the mockup.)
- **`.core-lines`** — `.core-line` rows. The row body is `.core-line-main`: a
  `.core-lqz` quantity zone that reads a clean **`N×`** (`.core-lqty`) at rest like
  the mockup and swaps to the live `.core-qstep` −/＋ counter on hover (touch tills
  have no hover, so they show the stepper outright). The `−` runs through
  `decLine`, not `changeQty` directly: an unfired line decrements instantly, but
  removing the **last unit of a dish already sent to the kitchen** (its course in
  `firedCourses`, or a sent non-coursed check) opens a **cancel-with-reason**
  `CoreDialog` (`VOID_REASONS` chips) so a cooking dish is never silently wiped —
  confirming **notifies the kitchen** (POST `/api/admin/kds/void-item` →
  `voidKitchenItem` records it on `Order.voidedItems` and drops it from the
  make-list), so the KDS card shows it struck-through (see kds.md);
 a `.core-grip` handle (`⠿`,
  also hover-revealed on desktop); the **tappable line name** (`.ln-edit`, reveals
  a `✎` on hover → opens the line editor) and a mono line price (modifier deltas
  included). Under the name, `.core-line-mods`
  renders the chosen modifiers as `.core-mod-chip` chips (a `flagOnKds` pick →
  `.flag` amber) and the special-request note as `.core-mod-note` (amber `.alrg`
  when it names an allergy); when a line has neither, it falls back to the menu
  item's **descriptor** (truncated) as the sub-line, like the mockup
  ("San Marzano · fior di latte"). **Line identity** is the item + its modifier picks +
  its note (`posLineKey`, `@/lib/pos-line`), so a plain item and a customised one
  sit on separate rows and the stepper / re-course / edit target the right line.
  Dine-in coursed checks group lines into `.core-course` blocks with a
  `.core-course-h` header. Courses read in **Neapolitan** (`POS_COURSE_LABELS` —
  Antipasti · Primi · Dolci · Bevande) and each header carries a status **dot**
  (`.cdot`) + a contextual chip mirroring the mockup's coursing spine: a fired
  course dims (`.core-course.fired`) with a basil `.cdot.done` + `✓ Fired`; the
  **earliest un-fired** course is the actionable one — ember `.cdot.next` + the
  prominent `⚡ Fire` button (`nextUnfiredCourse`); later un-fired courses read
  amber `.cdot.hold` + a muted `◷ Hold` chip (`.fire.hold`) that stays fireable
  (tap to jump the queue). **Re-coursing is touch-first:** on
  a coursed line the grip is a `<button>` that toggles `.core-line.picking`,
  revealing an inline `.core-recourse` chooser (`.core-recourse-opt` per course,
  current one `.on`) — one tap moves the line. Native drag stays as a
  mouse-only enhancement (`.core-line[draggable="true"]` shows the grab cursor +
  grip bob; dragging onto a course tints it via `.core-course.drop`). Flat
  (non-coursed) lines render the grip as an inert `<span>` and aren't
  draggable.
- **`.core-offer`** — cross-sell suggestions (`getCartSuggestions`), plus a
  `.core-offer.combo` **combo-completion** prompt when a deal is one or two
  items short (`getActiveComboDeals` → `missingItems` / `missingCategories`
  / `missingQuantity`); tapping it adds exactly the missing items so the
  real discount fires.
- **`.core-foot`** — an optional `.core-frow.member` chip (attached loyalty
  guest, with a remove ✕), `.core-frow` subtotal, `.core-frow.disc` combo
  discount **and** a `.core-frow.disc` manual-discount line, `.core-ftot` total,
  then `.core-foot-actions` (`.core-send` Fire course / Send to KDS +
  `.core-charge`) over the secondary **`.core-foot-strip`** — each button carries
  an inline `.core-glyph` line-SVG (send · card · park-bars · tag · person ·
  trash, core's own glyphs, not lucide). The strip collapses the four
  low-frequency utilities into **one 40px row of labelled icon buttons**
  (`.core-foot-ic`) instead of three full-width rows (~90px reclaimed):
  **Park / hold** · **Add / Edit discount** · **Add membership / Member ✓**,
  then a `.core-foot-strip-sp` spacer and the danger-tinted **Void check**
  (`.core-foot-ic.danger`) set apart at the far end so it's deliberate. Each
  button keeps its `data-on` ember tint when active (parked / discount set /
  member attached) and shows its label as a hover/focus `.tip` tooltip, so no
  action name is lost. Park's held state is also mirrored by the header's
  `▣ Held` chip.
- **Discount + membership** — `DiscountDialog` (amount-zł or percent + an
  optional reason) and `MemberDialog` (phone + optional name) write
  `tab.discount` / `tab.customerPhone` + `tab.customerName` via the normal
  debounced tab PUT. The charged total is recomputed **server-side**
  (`buildOrderShape` → `manualDiscountGrosze`, the shared `@/lib/pos-discount`
  helper the footer preview also uses), and the member phone becomes the
  order's `customerPhone` (normalised) so loyalty points accrue on payment
  (Rule #6). Verified: a 10% discount on a 27.90 zł pizza charges 25.11 zł
  to `+48…`.
- **Void** — the footer's **Void check** button deletes the active open
  check (`DELETE /api/admin/pos/tabs?id=`). Optimistic: the row vanishes at
  once. An **empty** check is dropped on tap; a check with rung items
  confirms via a `CoreDialog` first (its danger button is
  `.core-btn.danger`). An unsaved optimistic (`tmp-`) check is removed locally
  only. The DELETE is **durable** — it goes through the same idempotent outbox
  as Send/Charge (`durableMutate`, `voidCheckOnServer` in `CorePos.tsx`), so a
  transient failure (5xx / dropped connection / cold-instance timeout) retries
  invisibly and survives a reload instead of resurfacing the voided check. The
  voided id is hidden from every incoming poll list (`voidedIds`) until the
  server confirms it gone; only a genuine 4xx (other than 404 = already gone)
  releases the guard and lets the next poll reconcile the check back. This is
  the fix for "voided checks reappear a few seconds later" — the bare
  fire-and-forget DELETE used to release the guard on any failure, so the 5s
  cross-till poll re-added the check the operator had just voided.

## Line editor (modifiers + special request)

`LineEditorDialog` (a `CoreDialog`, portaled) — opened from a customisable
product card or by tapping a line's name (`.ln-edit`). It builds the line's
`modifiers` + `notes` before they go on the check:

- **`.core-modgroup`** per `MenuItem.modifierGroups` group — a `.core-modgroup-h`
  header with a `.core-modgroup-rule` (required/optional · up-to-N) over a
  `.core-modopts` grid of `.core-modopt` toggles (`.on` when picked). Radio
  groups (`maxSelections ≤ 1`) replace; multi-select keeps up to `maxSelections`.
  A `flagOnKds` option shows a `★`; a positive `priceDelta` shows `+zł`.
  **Required** groups (`minSelections ≥ 1`) gate the Add button until satisfied.
- **`.core-notechips`** — quick note chips (`NOTE_CHIPS`) plus a special
  `.core-notechip.alrg` **⚠ Allergy** chip that prefixes the note; under them a
  `.core-textarea` (200-char cap). When the note matches the allergy regex a
  `.core-alrg-banner` warns it prints emphasised on the kitchen ticket.
- **`.core-editor-qty`** — a `.core-qstep.big` quantity stepper. The footer
  button reads **Add · zł** (or **Save · zł** when editing) with the live
  unit×qty total including modifier deltas.

The editor only ever writes the line shape (`menuItemId` + `modifiers` +
`notes` + `quantity`); **all pricing stays server-side** — `buildOrderShape`
re-resolves each pick against the live menu (`effectiveUnitPrice`), drops any
option id not on that item, and adds the menu's `priceDelta`. The KDS ticket
already renders `selectedModifiers` (`.mod` / `.mod.flag`) and the per-line
`notes`, so a customised line and its allergy flag reach the line cook unchanged.

## Tender sheet (tip · split · comp · cash change)

`TenderDialog` (a `CoreDialog`, portaled) replaces the old bare Card/Cash pad.
It composes the tender and PATCHes it as `{ tabId, tender }`:

- **Tip** — `.core-tchip` presets (None / 5 / 10 / 15 % of the net) + Custom zł.
- **Comp** — a `.core-tender-toggle` reveals reason-code chips (`COMP_REASONS`
  = **Quality · Wait · Goodwill · Error**) + an amount (defaults to the whole
  bill), over a **live per-shift comp-cap meter** (`.core-comp-cap` — fed by
  `GET /api/admin/pos/comp-status`: the actor's real audit-log comp total vs the
  `refundControls` cap). The bar turns danger + shows a 🔒 over-cap gate when the
  comp would breach; owners see a "caps don't apply" note. Recorded server-side
  as a single `manager_comp` (the chip is the note), so it shows in Reports and
  counts toward the cap (`getActorCompTotalToday`, audit action `pos.comp`).
- **Split** — `.core-tchip` presets (**Whole · ÷2 · ÷3 · ÷4 · By seat**, clamped
  to the cover count); each guest share is an equal slice (last absorbs the
  rounding remainder) with its own Cash/Card `.core-seg.sm` toggle. `Charge
  split` sends one `payments[]` entry per share. **By item** shows the check's
  lines (`.core-split-item` + per-line payer chips); each payer's amount is
  their assigned lines' weight × the actual total, so tip/comp distribute
  proportionally and the payments still sum to the charge.
- **Cash change** — choosing Cash on a single tender opens `.core-cashpad`:
  quick denomination chips + a free amount, a live `.core-change-row` change-due,
  and a Confirm gated until the cash covers the total.
- **Cash + Card** (`.core-pay.mixed`, full-width under Card/Cash) — one payer
  paying part cash + part card. Reuses `.core-cashpad`: type the cash portion,
  the card remainder auto-computes (`.core-split-rows` shows both), and Charge
  sends `payments:[{cash},{card}]` that always sum to the total.

**Every figure is server-authoritative** (`chargeTab`, `src/lib/pos/fireTab.ts`):
the bill comes from `buildOrderShape`; the comp is clamped to the bill and gated
by the shared `evaluateRefundGuard` (owners bypass, others hit the per-shift comp
cap); payments are validated to cover net due + tip or the charge 400s; cash
change is `tendered − cash share`. The tender lands on the `Order` as
`tipAmount` / `payments` / `compAmount` + `compReasonCode` + `compNote` /
`cashTendered` + `changeGiven`. A bare PATCH with no `tender` still charges the
full bill (the native `/api/v1` till is unchanged).

## Engine + API contract

Real, server-resolved; **no mock data** (Rule #1). The server owns the
total and the `orderId` — the till only ever sends item ids + quantities.

- `page.tsx` resolves `menusByLocation` (`getMenuWithOverrides`) +
  `upsellByLocation` (`getUpsellSettings`). The surface picks the menu for
  the `LocationContext` truck (shell chip), falling back to the first.
- **Tabs** — `GET/POST/PUT/DELETE /api/admin/pos/tabs?location=`. `POST`
  opens a check (fired in the background behind the optimistic chip); local
  edits debounce 350ms to `PUT` (temp `tmp-` ids are never PUT — their edits
  flush once under the real id at reconcile); `DELETE` voids a check **durably**
  via `durableMutate` (see **Void** above). A
  visibility-aware 5s poll (`usePolling`) syncs other tills — skipped while an
  edit is mid-debounce **or** any save/open/void is still on the wire
  (`pendingSaves`, so an in-flight open or void can't be resurrected), and
  reconciled by `updatedAt` so an already-in-flight poll can't revert a
  fresher local edit.
- **Send / Fire** — `POST /api/admin/pos/orders` `{ tabId, courses? }`.
- **Charge** — `PATCH /api/admin/pos/orders` `{ tabId, tender? }` → applies the
  tender (tip / split / comp / cash), marks `paidAt`, returns the authoritative
  `{ totalAmount, tip, comp, change, netCollected }`, closes the tab. See
  *Tender sheet* below.
- **Pricing** — `getActiveComboDeals` (discount gated on `isComplete`,
  subtracted from the real total) + `getCartSuggestions`, both from
  `@/lib/upsell`; prices in grosze, formatted `27,90`.

## Own UI primitives

POS uses Core's **own** kit (no `src/ui`): `CoreDialog`
(`src/core/ui/Dialog.tsx`, the tender / address modals) and
`useCoreToast` (`src/core/ui/Toast.tsx`) — both portaled into the
`.core` theme root. Classes: `.core-scrim` / `.core-modal*` / `.core-btn` /
`.core-toast*`.

**Deep-link from the Floor** — `/core/pos?table=<id>&covers=<n>` (the Floor's
*Order →* link) is read once on mount: when the tables list has loaded the till
opens a **dine-in check pre-assigned to that table** (party as covers), or
focuses the existing open check for it instead of duplicating. The query is
stripped via `history.replaceState` so a refresh doesn't re-open a fresh check.

The **table picker** is **not** a modal — it takes over the middle (menu)
pane (`.core-tablepick`) for a full-size, **zone-grouped** board
(`.core-tablezone` → `.core-tablegrid.big` / `.core-tablebtn`) with a *← Back to
menu* return; switching checks closes it. Each table shows seats + zone
and flags conflicts with `.core-tbadge` chips — *In use* (another open
dine-in check is on it), *Seats N < party* (undersized), *Reserved*,
*Out of service* — and toasts a warning when you seat onto a conflicted/
over-capacity table.

## At parity

Pace-steering banner (`GET /api/admin/pace/steering` — `.core-steer` shows
**only on an active bottleneck**; a clear line renders no banner, since the
stat strip's Pace cell already reads "Clear · line clear"), park/resume,
tap- or drag-to-recourse (tap a line's grip for the inline course chooser,
or drop a line on a course header), kitchen-timing toggle,
inline check rename, optimistic check open + void/delete, double-seat /
over-capacity guards, a hydration-aware empty state,
and the fullscreen kiosk are all wired — feature-for-feature with today's
`/core/pos`.

## QR table-order queue

Live code: `src/core/pos/CoreQrQueue.tsx` · API `src/app/api/admin/pos/qr-orders/route.ts`.

A **QR pill** (`.core-qrpill`) in the POS row-4 `.core-surf-toolbar` (right)
surfaces the
dine-in orders guests placed by scanning a table QR (`channel: "qr"`, from
`/qr`). Like the mockup's `.pill.qr` it's a labelled info-tinted pill — a grid
glyph + "QR orders" + a live `.core-qrpill-n` count badge — not a bare icon. It
polls `GET /api/admin/pos/qr-orders?location=` every 8s; the pill goes `on`
(brighter info ring + glow) and the count shows the "N to pay" tally when any
are unpaid. Opening it lists each order in a `CoreDialog` — table number,
guest, party size, line items, elapsed time, total and a paid/unpaid·status
chip. **Take payment** expands an inline `QrTenderPanel` (`.core-qr-tender`) —
method (Card/Cash), tip presets, and a cash change-due — and **Settle** posts
`{ orderId, action: "settle", tender }`. The route applies the tender to the
**existing** order (no duplicate order/tab, so no double-charge): it sets
`paidAt`, fires a still-pending demo-mode order to the kitchen (status →
`confirmed`), and writes the same `tipAmount` / `payments` / `cashTendered` +
`changeGiven` fields the POS tender uses, so a guest order settles through the
same money model as a server-rung check. A bare settle (no `tender`) still just
marks it paid. The order stays the single source of truth — totals owned
server-side.

The same dialog's **Print table QR** tab generates a printable per-table QR
(an SVG from `GET /api/admin/qr-code?location=&table=&base=`, encoding
`<origin>/qr?location=&table=`) and opens a clean print window — so staff
can produce the codes guests scan, closing the QR loop.
