# POS — fast, dense, calm

← back to [README](../README.md)

The money surface. The hardest test of the system — has to be **clean,
calm, and fast at once** — and the highest daily-use surface for staff.

**Live code:** `src/components/admin/AdminPos.tsx`.
**Mockups:** `pos.html` + `pos-tender.html` + `pos-tables.html`.

## Layout — two-pane, iPad-first

```
+--------+---------------------------------+------------------+
|        |  ──── Open checks (tab rail) ────                  |
| sidebar+---------------------------------+------------------+
|        | cat-  |  menu grid              | live ticket      |
|        | rail  |                         | (persistent)     |
|        | (86px)|                         | (396px)          |
+--------+-------+-------------------------+------------------+
```

- **Vertical category rail** on the left (86px) — short thumb travel on
  an iPad. Each category shows a capacity-true promise time
  (`Pizze · ~14m`).
- **Menu grid** — 3-column responsive grid of product cards (see below).
- **Persistent live ticket** on the right (396px) — never disappears,
  never collapses. The ticket *is* the order.

## Concurrent open checks — tab rail

A horizontal rail of tabs above the body. Each tab is a status pill:

| Status | Tone |
|---|---|
| `Open` | success-soft / success text |
| `Ready·Pay` | warning-soft / warning text |
| `Parked` | surface-hover / fg-subtle text |

Tab top-border accent encodes channel:
- `dine-in` → platinum top border
- `delivery` → info (steel) top border
- `takeaway` → neutral

Above the rail: summary stats (`4 tabs · 1 ready to pay · 1 parked ·
681 zł open`). The current tab gets the brand-accent top border.

## Menu cards — text-forward

**The empty image-box pattern is forbidden.** Until real food photography
exists, menu cards lead with type. The text-forward card contract lives
in the Core theme ([`../theme/`](../theme/)).

| Slot | Content |
|---|---|
| `.phead` | 17px category icon (`.catico`) + dish name (Fraunces) + role badge (right) |
| `.desc` | menu copy (12px muted, e.g. *"San Marzano, fior di latte, basil, EVOO"*) |
| `.row` | category badge + optional pace chip — price (pinned to bottom) |

Reserve a **2-line min-height on both the name and the desc** so every card
is identical and the price sits in the same place across every row.

## One primary action

`Charge` is the single primary CTA — burgundy fill, full-width `xl`, at the
bottom of the ticket. Everything else (Park, Send to KDS) is secondary.

```html
<a class="btn primary xl" href="/mockups/core-suite/pos-tender.html"
   style="width:100%;justify-content:center">Charge 280.80 zł</a>
```

The tender sheet (`pos-tender.html`) is a centered dialog with two big
buttons: **Card** (primary) + **Cash** (secondary). Both 18-pt Fraunces
display total above.

## Live pace steering — capacity-true promise times

A warning strip at the top of the menu pane surfaces the bottleneck:

> **Oven** at 86% — nearing capacity. Pushing **pasta & antipasti**; easing
> pizza. ··· *Delivery cap 2 / 20m*

Per-category chips on the cat-rail carry **promise times** (`~14m` /
`~9m` / etc.) computed from `analyzeTruck` on live orders. Per-product
**pace tags** sit inline in the menu card's tags row:

- `★ Make now` (success-soft) — off-bottleneck items the kitchen wants
- `Ease — oven busy` (warning-soft) — items the kitchen wants throttled

These are the same `--cmd-warn`/`--cmd-ready` palette used by the KDS pace
gauges — one system, both surfaces.

The active check carries a `Mains firing · ~14 min` promise badge in its
header (platinum soft, inset platinum hairline ring).

## Coursing — dine-in only

The defining POS feature for fine dining. **Coursing is per-order** and
only for dine-in.

### Kitchen-timing toggle

An order-level segmented control sits between the table block and the
ticket lines:

```
Kitchen timing                                [ Coursed ] [ All together ]
```

- **Coursed** — fire courses sequentially. Per-course **Fire / Hold** state.
- **All together** — fire the whole table at once. The KDS ticket lands
  tagged `All together` (platinum chip) with all course groups visible.

### Course sections in the ticket

Lines group into **Starters / Mains / Dessert / Drinks** sections, each
with its own state pill:

| State | Pill |
|---|---|
| `Fired 19:44` | `--success-soft` green check + timestamp |
| `Fire course` | A small brand-bordered button (the actionable one) |
| `Holding` | neutral `--surface-3` grey |
| `Sent` | success — for drinks fired immediately |

Firing a course pushes those items to KDS as one ticket tagged
`2 · Mains` etc.

### Drag-to-recourse

Every line is `draggable="true"` with a grip affordance. Drop zones are
the four `.course` sections. A small inline `<script>` does the
move (permitted by the `/mockups/*` CSP).

```js
l.addEventListener('dragstart', e => { dragged = l; l.classList.add('dragging'); });
c.addEventListener('drop', e => { e.preventDefault(); if (dragged) c.appendChild(dragged); });
```

The server can re-course on the fly without retyping.

## Fulfilment channel + table assignment

A segmented control in the topbar (`Dine-in` / `Takeaway` / `Delivery`)
sets the order's channel. Dine-in unlocks:

- **Table assignment** — opens `pos-tables.html`, a grid of tables with
  seats / zone / status / "in use" / over-capacity flags.
- **Covers stepper** — 1–50, with a soft warning if covers > seats.
- The kitchen-timing toggle (above).

Delivery unlocks the address dialog (textarea, 400-char). Takeaway has
neither.

## Tender sheet (`pos-tender.html`)

Centered dialog over a dimmed backdrop. Shows:

- Server-authoritative total (Fraunces 44px), `tabular-nums`
- `Card` primary + `Cash` secondary + `Cancel` ghost
- Footer hint: *"Server-authoritative total · marks paidAt and closes the
  tab. Card opens the terminal flow."*

## Suggestions — combo + cross-sell

A small `.offers` block below the lines:

| Type | Tone | Example |
|---|---|---|
| Combo completion | success | *"Complete the Famiglia — add tiramisù, save 12 zł"* |
| Cross-sell | platinum | *"2× espresso — fire with dessert"* |

Driven by `getCartSuggestions()` / `getActiveComboDeals()` in
`src/lib/upsell.ts`. The discount line in the totals is **success-tinted**
(`color: var(--success)`).

## Real fullscreen

The topbar fullscreen button is wired to a real `requestFullscreen()`
toggle via a small inline script (CSP-permitted). The POS goes
**kiosk-fullscreen** on iPad on click.

## Keyboard

Inline hint row at the bottom of the ticket pane:

```
N new       1–9 switch tab       F fullscreen       Esc close
```

The hint is `11px var(--fg-subtle)` with `kbd` chips for the keys.

## What never happens

- No image placeholder boxes on cards.
- No two-line modifier dropping the prices out of alignment — heights are
  reserved.
- No `Send to KDS` button being more prominent than `Charge`.
- No card height drifting with name length — 2-line reserve makes them
  uniform.
- No `Signature SIGNATURE` duplication — the role badge and category
  badge must be different (anchors badge **DOP / Veg**, not Signature).
