# KDS — calm monochrome, colour reserved for exceptions

← back to [README](../README.md)

The single most important module rule in the system. The KDS is a wall
display under pressure — the only thing that matters is that the eye lands
on what's wrong.

**Live code:** `src/components/admin/AdminKDS.tsx` + sub-components
(`AdminKdsFleet.tsx`, `kds-board.tsx`, `kds/KdsTicketCard.tsx`,
`KdsManagerOpsHeader.tsx`, `KdsChefStrip.tsx`, mobile `MobileKDS.tsx`).
**Mockups:** `kds-fleet.html` → `kds.html` → `kds-chef.html`.

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
In the live app the user's role picks one automatically; the mockups expose
a switcher.

| Role | View | Answers |
|---|---|---|
| **Owner** | **Fleet** (`kds-fleet.html`) — cross-truck overview: health rings, throughput sparklines, pace gauges, capacity meter, promise-accuracy benchmark, drill-in. | *Which location needs help right now?* |
| **Manager / franchisee** | **Floor** (`kds.html`) — full 3-lane board for one truck + ops header (SLA rollup + 86 / out-of-stock) + recall tray + predictive at-risk. | *What's the state of my kitchen and what's slipping?* |
| **Kitchen / staff** | **Chef** (`kds-chef.html`) — single station queue + stage switcher + queue depth + 86 + sound + fullscreen. | *What do I cook next at my station?* |

Same data, progressively narrower focus and bigger touch targets as you
approach the heat. The shared **`.viewswitch`** control (Fleet / Floor /
Chef) sits in the header of all three.

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

The Floor / Fleet board keeps the **last 5 bumps** in a recall tray so a
cook who bumped a ticket by mistake can put it back on the expo column in
one tap, within the ~60 s window where that's useful. The tray is
**persisted to `localStorage`, scoped per location** (`AdminKDS.tsx`), so a
tablet refresh or Wi-Fi blip on a wall-mounted screen no longer wipes it;
entries older than 10 min are pruned on reload so an old bump is never
resurrected.

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
- **Modifiers** (`.ka-mods` / `.ka-mod`) under the dish in **Fraunces
  italic amber** (`48h sourdough · Half Diavola`), resolved from the
  order line's `selectedModifiers` against `menuItem.modifierGroups`.
  Refined "menu copy" voice. Options flagged `flagOnKds` (gluten-free,
  buffalo mozz, half-and-half) **escalate to upright uppercase
  late-red** (`.is-flagged`) so an allergy- or station-critical pick
  can't be missed at the line.
- **Allergen alert** when present — a small red-tinted strip
  (`Allergens: milk · gluten`) with the alert-triangle icon.
- **Driver / order notes** (`<b>Driver note:</b> leave at reception…`) in a
  neutral raised strip.
- **Card structure:** `flex: none` so it keeps its full natural height —
  the lane scrolls, the ticket never gets squashed (see §"Scroll model").

## Course tags on dine-in tickets

Dine-in tickets carry a course chip next to the fulfilment type:

| Chip | Border | Use |
|---|---|---|
| `1 · Starters` / `2 · Mains` / `3 · Dessert` | `--hair-2` neutral outline | A fired coursed ticket |
| `All together` | `--platinum-soft-strong` outline + platinum text | A non-coursed ticket — the whole table at once |

**Group items by course inside the ticket** — section headers use course
names (`Starters` / `Mains` / `Dessert`), not station names (Pizza /
Antipasti / Bevande). Every check reads as the courses the line is firing.

A **coursed mains ticket** also carries a context hint line below items:

> *Course 2 of 3 · starters away · dessert held*

An **all-together ticket** carries:

> *Fire whole table at once · no holds*

Both use the same `.tk-coursehint` style (faint, with a small layers icon).

## Scroll model

**The whole board scrolls as one page.** No per-lane internal scroll.

```css
body.kds { min-height: 100vh; }
.kds-wrap { min-height: 100vh; display: flex; flex-direction: column; }
.kds-top { position: sticky; top: 0; z-index: 10; background: var(--canvas); }
.board { flex: 1; display: grid; align-items: start; }
.col-body { display: flex; flex-direction: column; gap: 11px; }     /* no overflow-y */
.tk { flex: none; }                                                  /* never get squashed */
```

The top controls (stage switcher + clock + sound/pause/refresh/fullscreen)
stay pinned via `position: sticky`. The board grows with content; the page
scrolls.

`flex: none` on `.tk` is critical — without it, a flex-column lane shrinks
tickets to fit and `overflow: hidden` clips the footer (the late-ticket
footer was getting cut in early iterations).

## Top controls

Pinned in the sticky topbar, in this order:

```
[Brand mark]  [Fleet/Floor/Chef view-switch]  [Stage tabs]  [Clock]  [↻ Refresh]  [♪ Sound]  [⏸ Pause]  [⤢ Fullscreen]
```

All ctrl buttons are 34px square, 7px radius, hairline border, neutral.
Active = `--raised` bg + bright text. Real `requestFullscreen` is wired in
on the live app and the mockup.

## What the kitchen never has to think about

- Brand colour — there is none on the board.
- Two-line ticket cards squashing — flex:none prevents it.
- Confusing bare bars — the ETA label explains the bar.
- "Which course is this?" — the chip + the section headers say so.

That's the whole point of this module: the line cooks, the system stays
out of the way.
