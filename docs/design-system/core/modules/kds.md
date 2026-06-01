# KDS — calm monochrome, colour reserved for exceptions

← back to [README](../README.md)

The single most important module rule in the system. The KDS is a wall
display under pressure — the only thing that matters is that the eye lands
on what's wrong.

**Live code:** `src/components/admin/AdminKDS.tsx` + sub-components
(`AdminKdsFleet.tsx`, `kds-board.tsx`, `kds/KdsTk.tsx` (floor `.tk`),
`kds/KdsCt.tsx` (chef `.ct`), `kds/KdsTicketCard.tsx` — now only exports the
shared `Ring`; its `.ka-ticket` card is no longer rendered). `KdsManagerOpsHeader`
+ `KdsChefStrip` live in `AdminKDS.tsx`. (The retired phone KDS `MobileKDS`
was deleted in the mobile-shell cleanup — the desktop KDS reflows responsively.)
**Mockups:** `kds-fleet.html` → `kds.html` → `kds-chef.html`.
**Theme:** rebuilt 1:1 onto the core-suite mockups on the **`.kds-core`**
surface (a fixed full-viewport layer in `suite.css`) — the KDS is a
**full-screen kitchen wall** with its own dark `.kds-top` chrome and **no
SI sidebar** (unlike POS / Guest, it doesn't use `<CoreShell>`).
`/admin/kds` is in `CORE_ROUTES` so the admin chrome steps aside; an
"Admin" back link in the header is the way out. The three views:

- **Floor** (`AdminKDSDesktop`, `kds.html`): `.kds-top` (SI brand-mark +
  Fleet/Floor/Chef viewswitch + centred stage filter + clock +
  sound/pause/refresh/fullscreen), the `.kds-ops` / `.ostat` manager ops
  header, the 3-column `.kds-board`, and the **`.tk` ticket** (`KdsTk`:
  text timer escalating with the SLA, category-grouped items, allergen /
  notes, SLA meter, bump). 86 management is a `.kds-restore` row + native
  `.kds-btn86` picker.
- **Chef** (`AdminKDSDesktop` with `chefStrip`, `kds-chef.html`): same
  `.kds-top`, then the **`.kds-chefstrip`** — a `.kds-station` chip rail
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
drilled-in lenses run immersive (no SI sidebar). For a scoped role the
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

The top controls (stage switcher + clock + sound/pause/refresh/fullscreen)
stay pinned via `position: sticky`. The board grows with content; the page
scrolls.

`flex: none` on `.tk` is critical — without it, a flex-column lane shrinks
tickets to fit and `overflow: hidden` clips the footer (the late-ticket
footer was getting cut in early iterations).

The **Chef** queue is the one exception: per `kds-chef.html`, `.kds-queue`
takes `flex: 1; overflow-y: auto` and scrolls internally under the pinned
chef strip, rather than growing the page — the line cook keeps the strip and
station chips fixed while the dense queue scrolls.

## Loading pill

The first-frame loading chip is the shared admin **`.v2-page-loading`** pill —
but it is **portaled to `document.body`** (`AdminKDS.tsx`), not rendered inside
the board. The `.kds-core` overlay lives under `.admin-bg`, whose
`> * { position: relative; z-index: 1 }` rule traps a `position: fixed` child
(rule #4); rendered inline the pill never reaches the viewport bottom-center
the way it does on every `.v2-page` tab (those get the
`.admin-bg:has(.v2-page) > * { z-index: auto }` escape hatch). Portaling it to
`<body>` — the same escape hatch the kiosk view already uses — lands it as the
identical bottom-center chip. The portal is gated on a client `mounted` flag so
the SSR pass never reaches for `document.body`. While loading, the
`.ka-floor-body` stays empty (showing the "Kitchen is clear" empty state before
the first frame arrives would be a lie).

## Top controls

Pinned in the sticky topbar, in this order:

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

When the owner-only sandbox simulator is on, a **`.kds-badge.platinum`**
pill (soft-platinum fill + a 6px dot, the mockup's `.badge.platinum`
re-scoped to `.kds-core` since the core-suite badge lives under
`.core-suite`) flags the board next to the wordmark — never a loud colour,
just the platinum jewellery tone. The owner's `[Fleet/Floor/Chef]`
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
