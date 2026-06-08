# Core v2 · POS

The till. `/core-v2/pos`.

- **Live code:** `src/core-v2/pos/CoreV2Pos.tsx` (client surface) +
  `src/app/core-v2/pos/page.tsx` (server: resolves per-location menu
  snapshots and passes them in).
- **Theme:** `.cv-pos` + `.cv-rail` / `.cv-cat` / `.cv-menu` /
  `.cv-prod` / `.cv-ticket` in `themes/core-v2/index.css`.

## Layout

A full-width **open-check bar** (`.cv-checkbar`) over a three-column grid
inside the shell body: **rail · menu · ticket**.

- **`.cv-checkbar`** — spans the whole width above the panes (so it sits
  over the menu's steering banner): the `.cv-tabrail-sum` rollup
  (`N tabs · R ready to pay · P parked · VALUE open`) over the wrapping
  `.cv-tabrail` of `.cv-ttab` open-check chips + `+ New`. The active check
  gets a brand outline; the rail wraps (capped height + scroll) so a busy
  till's checks stay browsable without a horizontal hunt.

- **`.cv-rail`** — the category rail. An **All** chip (stacks every
  category as `.cv-menu-sec` blocks with `.cv-menu-sec-h` headers) over
  the per-category `.cv-cat` buttons — each lists only categories present
  on the active location's menu, with a live item count (`.n`) and, when
  steering is active, a `.cv-cat-promise` per-category ETA (`~Nm` from
  `promiseSecondsByCategory`). `.on` = the selected category (filled ink).
- **`.cv-menu` / `.cv-menu-grid`** — auto-fill grid of `.cv-prod` cards.
  Each card is **text-forward** (no photo dependency): `.pn` (display
  name, with a `.cv-role` menu-engineering badge — Hero / Profit / Anchor
  / LTO from `menuRole`) · `.pd` (description, clamped to 2 lines) ·
  `.cv-tagrow` of `.cv-tag` chips (veg/vegan → `.veg`, spicy → `.hot`,
  gluten-free → `.fast`) plus a live `.cv-steer-tag` pace cue (**★ make
  now** for `makeNow` ids, **▼ ease** for `throttle` ids) · `.pf` footer
  with the `.pp` mono price and the burgundy `.add` button. Cards **stretch to equal height per row** and the `.pf`
  footer is pinned to the bottom (`margin-top: auto`), so a long
  description can't make one card taller than its row-mates.
- **`.cv-ticket`** — the open-check panel. Today it shows
  `.cv-ticket-empty` (the no-open-check state).

## The ticket (open check)

Wired 1:1 to the same server engine as today's `/core/pos` — fresh `cv-`
UI, identical contract.

The open-check selector (`.cv-tabrail-sum` + `.cv-tabrail`) lives in the
top `.cv-checkbar` (see Layout) — the `.cv-ticket` column below shows the
**active** check only:

- **`.cv-thead`** — `.cv-th-name` (the check name is an **inline editable
  input** — click to rename, persisted via the same debounced `PUT`) ·
  channel/order tag · a `.cv-tabpromise` per-check ETA (max
  `promiseSecondsByCategory` across the lines, toned by the bottleneck
  tier) · `.cv-covers` stepper (dine-in). A `.cv-delivery-paused` banner
  shows when steering has capped the next delivery window
  (`deliveryCapNextWindow === 0`).
- **`.cv-chanrow` / `.cv-chan`** — channel (dine-in / takeaway /
  delivery); `.cv-chan-aux` opens the in-pane table picker (dine-in) or
  the address dialog (delivery).
- **`.cv-timing` / `.cv-seg`** — dine-in **kitchen-timing** toggle
  (Coursed ↔ All together); writes `tab.coursed`, which the `.cv-lines`
  renderer reads to course or flat-list the ticket.
- **`.cv-lines`** — `.cv-line` rows. The row body is `.cv-line-main`: a
  `.cv-grip` handle (`⠿`) then a `.cv-qstep` −/＋ counter and a mono line
  price. Dine-in coursed checks group lines into `.cv-course` blocks with a
  `.cv-course-h` header and a per-course **Fire** button; fired courses dim
  (`.cv-course.fired`) and show `✓ Fired`. **Re-coursing is touch-first:** on
  a coursed line the grip is a `<button>` that toggles `.cv-line.picking`,
  revealing an inline `.cv-recourse` chooser (`.cv-recourse-opt` per course,
  current one `.on`) — one tap moves the line. Native drag stays as a
  mouse-only enhancement (`.cv-line[draggable="true"]` shows the grab cursor +
  grip bob; dragging onto a course tints it via `.cv-course.drop`). Flat
  (non-coursed) lines render the grip as an inert `<span>` and aren't
  draggable.
- **`.cv-offer`** — cross-sell suggestions (`getCartSuggestions`), plus a
  `.cv-offer.combo` **combo-completion** prompt when a deal is one or two
  items short (`getActiveComboDeals` → `missingItems` / `missingCategories`
  / `missingQuantity`); tapping it adds exactly the missing items so the
  real discount fires.
- **`.cv-foot`** — `.cv-frow` subtotal, `.cv-frow.disc` combo discount,
  `.cv-ftot` total, then `.cv-send` (Send to KDS) + `.cv-charge`.

## Engine + API contract

Real, server-resolved; **no mock data** (Rule #1). The server owns the
total and the `orderId` — the till only ever sends item ids + quantities.

- `page.tsx` resolves `menusByLocation` (`getMenuWithOverrides`) +
  `upsellByLocation` (`getUpsellSettings`). The surface picks the menu for
  the `LocationContext` truck (shell chip), falling back to the first.
- **Tabs** — `GET/POST/PUT/DELETE /api/admin/pos/tabs?location=`. Local
  edits debounce 350ms to `PUT`; a 5s poll syncs other tills (skipped
  mid-debounce).
- **Send / Fire** — `POST /api/admin/pos/orders` `{ tabId, courses? }`.
- **Charge** — `PATCH /api/admin/pos/orders` `{ tabId }` → marks `paidAt`,
  returns the authoritative `totalAmount`, closes the tab.
- **Pricing** — `getActiveComboDeals` (discount gated on `isComplete`,
  subtracted from the real total) + `getCartSuggestions`, both from
  `@/lib/upsell`; prices in grosze, formatted `27,90`.

## Own UI primitives

POS uses Core v2's **own** kit (no `src/ui`): `CoreV2Dialog`
(`src/core-v2/ui/Dialog.tsx`, the tender / address modals) and
`useCoreToast` (`src/core-v2/ui/Toast.tsx`) — both portaled into the
`.cv2` theme root. Classes: `.cv-scrim` / `.cv-modal*` / `.cv-btn` /
`.cv-toast*`.

The **table picker** is **not** a modal — it takes over the middle (menu)
pane (`.cv-tablepick`) for a full-size, **zone-grouped** board
(`.cv-tablezone` → `.cv-tablegrid.big` / `.cv-tablebtn`) with a *← Back to
menu* return; switching checks closes it. Each table shows seats + zone
and flags conflicts with `.cv-tbadge` chips — *In use* (another open
dine-in check is on it), *Seats N < party* (undersized), *Reserved*,
*Out of service* — and toasts a warning when you seat onto a conflicted/
over-capacity table.

## At parity

Pace-steering banner (`GET /api/admin/pace/steering`), park/resume,
tap- or drag-to-recourse (tap a line's grip for the inline course chooser,
or drop a line on a course header), kitchen-timing toggle,
inline check rename, double-seat / over-capacity guards, the tab-rail
rollup, a hydration-aware empty state, and the fullscreen kiosk are all
wired — feature-for-feature with today's `/core/pos`.
