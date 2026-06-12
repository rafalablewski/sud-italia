# KDS — calm monochrome, colour reserved for exceptions

← back to [README](../README.md)

The single most important module rule in the system. The KDS is a wall
display under pressure — the only thing that matters is that the eye lands
on what's wrong.

**Live code:** `src/core/kds/AdminKDS.tsx` + sub-components
(`AdminKdsFleet.tsx`, `kds-board.tsx`, `kds/KdsTk.tsx` (floor `.tk`),
`kds/KdsCt.tsx` (chef `.ct`), `kds/KdsTicketCard.tsx` — now only exports the
shared `Ring`; its `.ka-ticket` card is no longer rendered). `KdsManagerOpsHeader`
+ `KdsChefStrip` live in `AdminKDS.tsx`. (The retired phone KDS `MobileKDS`
was deleted in the mobile-shell cleanup — the desktop KDS reflows responsively.)
**Mockups:** `kds-fleet.html` → `kds.html` → `kds-chef.html`.
**Theme:** rebuilt 1:1 onto the core-suite mockups on the **`.kds-core`**
surface (`suite.css`). KDS now rides the **same unified `<CoreShell>`** as
POS / Guest / Service — the shared light two-row header (brand + the
POS · KDS · Guest · Service `<CoreNav>` + the stage filter / clock /
controls) over the **dark `.kds-core.in-shell` wall body**. There is **no
sidebar** (Core is a separate entity from `/admin`, and the old "Admin"
back link is gone). The Fleet/Floor/Chef switch rides the subbar
`.viewnav`; the stage filter rides the subbar right; the
clock + sound/pause/refresh/fullscreen ride the header right. The
Both Fleet and Floor open the wall with the mockup's `.kpi-dark` 7-up KPI
band (`.kc` cells, `.v.warn/.late/.good` tones) wired to live counts —
Fleet from the fleet `totals` (active / at-risk / late / ready / throughput
/ covers / revenue), Floor from the ops header (open / late / due&lt;3m /
oldest / avg-age / done-hr / on-shift). The expo columns keep the richer
live `tk` cards, and the Chef line already uses the mockup `.ct-*` markup.

**fullscreen kiosk** drops the shell chrome entirely and portals the bare
dark wall (its own `.kds-top` header) to `<body>` (rule #4) — and, being the
cook-facing wall, it carries **no** intro banner. The windowed shell view
opens each lens with a view-aware slim intro (`.intro.intro-slim.kds-intro`,
text from `KDS_INTRO[mode]`). `/core/kds` is a top-level `/core/*` route with
its own layout. The three views:

- **Floor** (`AdminKDSDesktop`, `kds.html`): the shared header carries the
  Fleet/Floor/Chef viewswitch + stage filter + clock +
  sound/pause/refresh/fullscreen (the kiosk wall keeps these in `.kds-top`),
  the `.kds-ops` / `.ostat` manager ops
  header, the 3-column `.kds-board`, and the **`.tk` ticket** (`KdsTk`:
  text timer escalating with the SLA, category-grouped items, allergen /
  notes, SLA meter, bump). 86 management is a `.kds-restore` row + native
  `.kds-btn86` picker.
- **Chef** (`AdminKDSDesktop` with `chefStrip`, `kds-chef.html`): same
  shared header, then the **`.kds-chefstrip`** — a `.kds-station` chip rail
  (All + every station with a live ticket, real `ticketCategories` filter,
  depth count on each), the `.kds-qdepth` (In queue / Oldest, Oldest goes
  `.warn` past 8 min) and the `.kds-chef-86` controls — over a single flat
  **`.kds-queue`** (auto-fill grid, oldest-first, honours the stage filter)
  of large-type **`.ct` cards** (`KdsCt`: 21px Fraunces dish names, 22px
  quantities, 46px bump — sized to read across the line; no SLA meter, the
  cook only needs dish + timer + bump). Allergens/notes are kept on the
  `.ct` for safety even though the static mockup omits them.
- **Fleet** (`AdminKdsFleet`, `kds-fleet.html`): `.cmdbar` (7 tiles),
  per-truck promise-accuracy `.bench`, and `.truck` cards (health `.ring`,
  5-cell stat row, `.pacehead` + capacity meter, per-station `.gauges`,
  compact `.mt` ticket stack). Each truck `.thead` carries **two drill
  targets** (owner-only): the big `.thead-open` hit (ring + title) opens that
  truck's **Floor**, and the `.drill-chef` pill ("Chef line →") jumps straight
  to its **Chef** line — both via `onDrillIn(slug, lens)`.

The old `.kds-atlas` / `.ka-*` chrome is retired (its mobile KDS consumer was
deleted); `KdsTicketCard` survives only because it still exports the shared
`Ring`. **Known gap:** ticket items group by *station/category*, not the mockup's per-course
headers (KDS order items don't carry per-item course). The per-station chef
filter is **live** again on the Chef view (the `.kds-station` chip rail) —
the Floor + manager boards still run station-agnostic (`station = "all"`).

## The core principle

**Tickets are neutral by default. Colour escalates only as SLA degrades.**

| State | Visual treatment |
|---|---|
| **Normal / on time** (new + firing on schedule) | Neutral. No left bar colour. Timer in `--dim`. SLA fill `--dim`. |
| **Approaching SLA / at risk** | `--warn` (amber) on the left accent, the timer, the SLA fill, and the ETA label. |
| **Late** | `--late` (red) — same elements, plus a faint outline glow (`inset 0 0 0 1px var(--late) ~ 45%`). The only loud signal on the board. |
| **Ready** | De-emphasised. `--ready` (muted green) accent at low opacity, slightly faded card (`opacity: .9`), timer reads `Ready for expo`. |

**What is forbidden:**

- A blue "firing" left bar on in-progress tickets.
- A purple "risk" left bar (we use amber for at-risk too — purple is for
  data-viz only).
- A big red blur glow on late tickets — use the inset 1px outline instead.
- Brand burgundy anywhere as a ticket colour.

## The role triad

The KDS is a **single live order stream seen through three role lenses.**
A scoped role (manager, kitchen) is pinned to its one lens; the
**owner / master is not** — they see every lens and the header
**`.kds-viewswitch`** is a live switcher for them (Fleet ⇄ Floor ⇄ Chef).

| Role | Lands on | Can switch to | Answers |
|---|---|---|---|
| **Owner / master** | **Fleet** (`kds-fleet.html`) — cross-truck overview: health rings, throughput sparklines, pace gauges, capacity meter, promise-accuracy benchmark, drill-in. | **Floor** + **Chef** for any truck it drills into — the viewswitch is interactive. | *Which location needs help, and let me drop onto its floor or its line.* |
| **Manager / franchisee** | **Floor** (`kds.html`) — full 3-lane board for one truck + ops header (SLA rollup + 86 / out-of-stock) + recall tray + predictive at-risk. | — (pinned) | *What's the state of my kitchen and what's slipping?* |
| **Kitchen / staff** | **Chef** (`kds-chef.html`) — single station queue + stage switcher + queue depth + 86 + sound + fullscreen. | — (pinned) | *What do I cook next at my station?* |

Same data, progressively narrower focus and bigger touch targets as you
approach the heat. The owner reaches Floor by drilling into a truck from the
Fleet wall (`onDrillIn` → `mode: "floor"`), then the viewswitch flips that
truck between Floor (`opsHeader`) and Chef (`chefStrip`) via `onLens`; both
drilled-in lenses ride the same shared shell (no sidebar). For a scoped role the
viewswitch carries no `onLens` and stays decorative — the role *is* the lens.

## Lane headers — monochrome

The lane labels (`New` / `Firing` / `Ready · Pass`) are `--dim` text in
small-caps tracked uppercase. **No per-lane colour.** The active lane gets
the single **platinum hairline** under its rule — the only signature touch
on the board.

```css
.col-head .lbl { color: var(--dim); letter-spacing: .14em; text-transform: uppercase; }
.col.active .col-head .rule { background: rgba(203, 180, 138, .35); }   /* platinum-soft */
```

## Bump button — refined neutral

`.bump` is a single neutral action button — never a green/blue candy fill:

```css
height: 38px;
border: 1px solid var(--hair-2);
border-radius: 7px;
background: var(--raised);
color: var(--t);
```

Late ticket's bump gets a red-tinted edge:
`border-color: color-mix(in oklab, var(--late) 55%, var(--hair-2))`.

The button is **full-width below the SLA bar**, not a small button beside
it. This is part of the footer ETA pattern (below).

## Recall tray

The Floor board keeps the **last 5 bumps** in the footrow **`.kds-recall`
tray** (left of the legend, matching `kds.html`) — one `#id` chip per recent
bump, each a one-tap recall that puts the ticket back on the expo column,
within the ~60 s window where that's useful. (Chef hides the tray — the line
cook works forward, not back.) The tray is **persisted to `localStorage`,
scoped per location** (`AdminKDS.tsx`), so a tablet refresh or Wi-Fi blip on
a wall-mounted screen no longer wipes it; entries older than 10 min are
pruned on reload so an old bump is never resurrected.

## Footer ETA pattern

The model/predicted-ready info lives in the footer **as the SLA-bar's
label**, not as a separate line above:

```
[ Ready in ~9 min ] [▓▓░░░░░░░░░░░░░░░]
[          Mark ready                  ]   ← full-width bump
```

ETA label text:

| State | Label |
|---|---|
| Normal | `Ready in ~9 min` (faint) |
| Approaching SLA | `At risk · miss by ~2 min` (amber) |
| Late | `Over promise · ~4 min` (red) |
| Ready | `Ready for expo` (muted green) |

This puts time-to-ready next to the visual progress-to-ready — its natural
home — and explains the bar (otherwise the bare 6%-filled bar reads as a
mystery line for new tickets).

## Tickets — content rules

- **Dish names in Fraunces serif** (16.5px on Floor / 21px on Chef). This is
  the *only* operational use of serif besides the wordmark.
- **Modifiers** (`.tk-mod` on Floor / `.ct-mod` on Chef) under the dish in
  **Fraunces italic amber** (`48h sourdough · Half Diavola`), carried on the
  ticket item (`KdsTicketItem.modifiers`, resolved in `buildKdsTicket` from
  the order line). The item's `notes` render in the same amber voice.
  Refined "menu copy" tone.
- **Allergen alert** when present — a small red-tinted strip
  (`Allergens: milk · gluten`) with the alert-triangle icon.
- **Driver / order notes** (`<b>Driver note:</b> leave at reception…`) in a
  neutral raised strip.
- **Card structure:** `flex: none` so it keeps its full natural height —
  the lane scrolls, the ticket never gets squashed (see §"Scroll model").

## Coursing hint on dine-in tickets

The POS fires a dine-in check **course-by-course** (see
[`pos.md`](./pos.md)). Each fire stamps `Order.coursing = { fired, held }`,
which flows through `buildKdsTicket` onto `KdsTicket.coursing`. The
ticket only ever shows the items that have actually been fired (held
courses aren't on the order yet), and when something is still held it
carries a hint line below the items:

> ⌗ *Coursed · Mains, Dessert held*

Rendered as `.tk-coursehint` on the Floor `.tk` card (and `.ct-coursehint`
on the Chef `.ct` card) — a faint line with a small `Layers` icon. It
appears only while `coursing.held` is non-empty — a fully-fired or
all-together check shows no hint. As each held course is fired from the POS
the order grows and the line re-renders with the new items, the hint
shrinking until nothing is held.

> **Not yet built:** a per-course chip on the ticket header and grouping
> items under course names (rather than station names) — the current
> ticket lists the fired items and the held-course hint only.

## Scroll model

**The whole board scrolls as one page.** No per-lane internal scroll.

```css
body.kds { min-height: 100vh; }
.kds-wrap { min-height: 100vh; display: flex; flex-direction: column; }
.kds-top { position: sticky; top: 0; z-index: 10; background: var(--canvas); }
.kds-board { flex: 1; display: grid; align-items: start; }
.kds-col-body { display: flex; flex-direction: column; gap: 11px; }  /* no overflow-y */
.tk { flex: none; }                                                  /* never get squashed */
```

In the **fullscreen kiosk** wall the top controls live in the sticky
`.kds-top` (above). In the **windowed** view those same controls live in the
shared CoreShell header (fixed at the top of the shell), and the dark
`.kds-core.in-shell` body scrolls within `.core-body.bleed`. Either way the
board grows with content and the controls stay put.

`flex: none` on `.tk` is critical — without it, a flex-column lane shrinks
tickets to fit and `overflow: hidden` clips the footer (the late-ticket
footer was getting cut in early iterations).

The **Chef** queue is the one exception: per `kds-chef.html`, `.kds-queue`
takes `flex: 1; overflow-y: auto` and scrolls internally under the pinned
chef strip, rather than growing the page — the line cook keeps the strip and
station chips fixed while the dense queue scrolls.

## Loading pill

The first-frame loading chip is the shared admin **`.v2-page-loading`** pill —
but it is **portaled to `#admin-portal-root`** (`AdminKDS.tsx`), not rendered
inside the board. The `.kds-core` overlay lives under `.admin-bg`, whose
`> * { position: relative; z-index: 1 }` rule traps a `position: fixed` child
(rule #4); rendered inline the pill never reaches the viewport bottom-center
the way it does on every `.v2-page` tab (those get the
`.admin-bg:has(.v2-page) > * { z-index: auto }` escape hatch).

**Why `#admin-portal-root` and not `<body>` or `.v2-shell`:** the chip needs a
mount that is (a) an *ancestor* of `.admin-bg` (to escape the trap), (b) inside
the admin font scope, and (c) actually present on this route. `.v2-shell` sets
`font-family: var(--font-ui)` but the KDS is a **core route** — the `/core`
layout (`src/app/core/layout.tsx`) renders no `.v2-shell` chrome at all, so it
isn't there. `<body>` is always there but sits *outside* the font scope:
`--font-ui → var(--font-admin-body)` and `--font-admin-body` is a `next/font`
variable set on the layout wrapper, not on `<body>` — so the chip renders in the
browser default **serif**. The fix is the wrapper itself: it carries
`id="admin-portal-root"` (`src/app/core/layout.tsx` for `/core/*`, mirroring
`src/app/admin/layout.tsx` for `/admin/*`), holds the `--font-admin-*` vars, is
an ancestor of `.admin-bg`, and has no transform (a fixed child still anchors to
the viewport).
`.v2-page-loading` also declares `font-family: var(--font-ui)` itself now, so it
no longer depends on inheriting Inter from `.v2-shell`. Falls back to `<body>`
defensively. The portal is gated on a client `mounted` flag so the SSR pass
never reaches for the DOM. While loading, the `.ka-floor-body` stays empty
(showing the "Kitchen is clear" empty state before the first frame arrives
would be a lie).

The **Fleet** wall (`AdminKdsFleet.tsx`) does the same: its first-load state
portals the `.v2-page-loading` pill to `#admin-portal-root` (gated on
`mounted`), and the wall stays empty until the first frame. Its `error`
("Couldn't load fleet") and empty ("No active trucks") states stay as centered
**`.fleet-empty`** messages — those are content, not a transient load, so they
live inside the wall.

## Top controls

The same set, in this order — in the shared CoreShell header (windowed:
viewswitch in the subbar `.viewnav`, stage in the subbar right,
clock + buttons in the header right) and in the kiosk wall's sticky
`.kds-top`:

```
[Brand mark]  [Fleet/Floor/Chef view-switch]  [Stage tabs]  [Clock]  [↻ Refresh]  [♪ Sound]  [⏸ Pause]  [⤢ Fullscreen]
```

The **`[Fleet/Floor/Chef]` switch is present at the top on every KDS view**
— Fleet shows all three (Floor/Chef drill into the first truck), and the
drilled-in Floor/Chef keep the full triad — so the owner is never more than
one tap from any lens. `.kds-top` is `position: sticky; top: 0` and
`flex-wrap`s on narrow screens, so the switch stays reachable while the
clock / ctrls drop to a second line (≤ 560px puts the switch on its own
row). All ctrl buttons are 34px square, 7px radius, hairline border,
neutral. Active = `--raised` bg + bright text. Real `requestFullscreen` is
wired in on the live app and the mockup. (The mobile shell was deleted, so
`.kds-core` renders at every width and these reflow tiers carry phone +
tablet.)

The owner's `[Fleet/Floor/Chef]`
viewswitch is a **live switcher** (see the role triad); for scoped roles it
stays decorative. Fleet revenue figures use a compact złoty (`1,8k zł`) so
the dense `.cstat` / `.met` tiles don't overflow with real takings.

## What the kitchen never has to think about

- Brand colour — there is none on the board.
- Two-line ticket cards squashing — flex:none prevents it.
- Confusing bare bars — the ETA label explains the bar.
- "Which course is this?" — the chip + the section headers say so.

That's the whole point of this module: the line cooks, the system stays
out of the way.
