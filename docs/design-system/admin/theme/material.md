# Material — depth, hairlines, radius, motion

← back to [README](../README.md)

How surfaces sit on top of each other, where the lines go, how tight the
corners are, and how things move.

## The surface model

**Flat solids, hairlines for separation.** No surface gradients ever. A
surface is just a tone from the colour palette + a 1px border.

Layer stack (each step lifts):

| Layer | Token | Use |
|---|---|---|
| Canvas | `--bg` | The page behind everything |
| Surface 1 | `--surface-1` | Cards, sidebar, modals, ticket panes |
| Surface 2 | `--surface-2` | Inputs, inset wells, subtle internal sections |
| Surface 3 | `--surface-3` | Active nav item, selected segmented tab, raised state |
| Hover | `--surface-hover` | The hover/pressed state of an interactive surface |

**Elevation = surface step + neutral shadow.** Raising a card from
`--surface-1` to `--surface-2` *and* deepening its shadow (e.g.
`--shadow-xs` → `--shadow-md`) is how depth is communicated. Coloured glow
shadows (burgundy / brand-tinted) are **forbidden**.

## Shadows

| Token | Use |
|---|---|
| `--shadow-xs` | The default for a card. Barely visible — just enough to detach from the canvas. |
| `--shadow-sm` | Hover/active lift on raised cards. |
| `--shadow-md` | Dialogs in flow, dropdowns, popovers. |
| `--shadow-lg` | Modal sheets, overlays. |
| `--shadow-glow` | Reserved for the focus ring (steel + soft halo). Not a decorative glow. |

All shadows are **neutral** (black/dark alpha). No tinted shadows.

## The 1px inset highlight

A common refined touch on cards and primary buttons:

```css
box-shadow: var(--shadow-xs), inset 0 1px 0 rgba(255, 255, 255, 0.04);
```

This is a 1px hairline of warm light along the top edge — it gives the
surface a hint of dimensionality without being a gradient. It's a
**hairline**, not a fill. Use sparingly: on `.glass-card` / `.v2-card` and
the POS product cards.

## Hairlines

| Token | Alpha | Use |
|---|---|---|
| `--border` | `rgba(255,255,255,.10)` | Default dividers, table rows, card edges |
| `--border-strong` | `rgba(255,255,255,.16)` | Edges that need to read at a glance — secondary button borders, focused input, raised-card edge, KDS panels |

Hairlines do most of the structural work. Use them instead of boxed
backgrounds for separation wherever you can.

## Nested surfaces — one border per box

**A child surface never repeats the border its parent already drew.** A
`.v2-card` is the box; anything living inside it — a table, a tile strip, a
list — separates with **internal hairlines only**, not a second boxed border.
Wrapping a bordered element inside a bordered card produces the *box-in-a-box*
look (a line hugging a line, a corner radius inside a corner radius) — it reads
busy and cheap, the opposite of the platinum-hairline discipline.

Rules of thumb:

- **One border defines a box.** If the parent is already a card, the child gets
  `border: 0` and leans on `--border` dividers (row hairlines, a `border-right`
  between tiles, a `border-top` between sections).
- **Dividers, not boxes.** Reach for a single hairline (`border-top` /
  `border-bottom` / `border-right`) before you reach for a bordered, rounded,
  filled sub-panel. See [Hairlines](#hairlines).
- **Pull components flush.** When a self-bordered component (a table, an inset
  grid) is the card's main content, use `<Card padding="none">` + the
  component's flush variant so it fills the card edge-to-edge under the header,
  inheriting the card's single border + radius. The card's `overflow: hidden`
  clips the corners.
- **No badge pill for a hero number.** A plain `tabular-nums` figure (coloured
  by a 7px status dot when it needs a state) reads cleaner than wrapping the
  number in a soft `Badge` — that's yet another bordered box inside the tile.

Reference implementations: `.v2-table-flush` (see
[components → Tables](./components.md#tables)) and the dashboard's
`.v2-next60-*` strip (`AdminDashboard.tsx` → `Next60Widget`), which both drop
their own border to sit inside a single card.

## Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | tag / chip squared variants (e.g. POS category badge) |
| `--radius-sm` | 6px | small chips, segmented tab inner |
| `--radius-md` | 8px | inputs, segmented track |
| `--radius-lg` | 12px | cards |
| `--radius-xl` | 16px | dialogs, large panels |
| `--radius-pill` | 999px | pills, status dots |

**Buttons live at 7px** (between `sm` and `md` — a deliberate
"investment-grade tightness"). This is set directly in the button rules.

**Tight, not friendly.** Bigger rounded corners read consumer/playful. The
scale tops out at 16px for big panels.

## Spacing — the 8px grid

`--space-1` 4px → `--space-6` 32px, on a strict 8px baseline.

```
--space-1:  4px    /* hairline gaps, icon padding */
--space-2:  8px    /* default chip padding */
--space-3: 12px    /* row gap, button padding */
--space-4: 16px    /* card padding */
--space-5: 24px    /* section gap */
--space-6: 32px    /* page gutter */
```

When inventing a value that doesn't sit on the scale, **don't**. Pick the
nearest token. Pixel-perfect drift comes from people guessing.

## Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120ms | hover state, button press, focus ring |
| `--duration-base` | 200ms | the ceiling for operational surfaces |
| `--duration-slow` | 320ms | dialog enter, panel slide, count-up |
| `--ease` | `cubic-bezier(0.32,0.72,0,1)` | the system curve |

### Motion rules per surface

- **Operational** (POS, KDS): **fast or none.** 200ms is the maximum.
  Never animate a ticket's position in a way that delays reading it.
  Status changes are instant.
- **Exploratory** (CRM, Concierge, Dashboard, storefront): the full,
  buttery range — panels slide, numbers count up, charts draw in.
- **Reduced motion:** everything respects `@media (prefers-reduced-motion:
  reduce)`. Animation duration drops to ~0.01ms and the curve goes linear.

## Focus

A keyboard focus ring is **steel** (`--info` / `--border-focus`), not
burgundy — focus is functional, not branded.

```css
outline: 2px solid var(--border-focus);
outline-offset: 2px;
```

On interactive surfaces inside the admin theme, the outline colour is
sourced from the token so it adapts dark/light. Don't roll your own colour.

## What "depth" looks like in practice

A card sitting on the canvas:

- background `--surface-1`
- 1px `--border`
- `--shadow-xs`
- optional `inset 0 1px 0 rgba(255,255,255,.04)` (the warm hairline)

That's the entire vocabulary. Nothing else is needed. If a card needs more
presence, you raise the surface (→ `--surface-2`) and the shadow
(→ `--shadow-md`) and **not** add colour.

## Don'ts

- **No linear/radial gradient fills** on surfaces, buttons, swatches,
  vignettes — anywhere.
- **No coloured glow shadows.** Brand-tinted `box-shadow` is the most
  common toy-tell.
- **No glossy `inset 0 1px 0 rgba(255,255,255,.12)+`** on filled buttons —
  the soft sheen reads consumer/iOS-skeuomorphic. Filled buttons are flat
  with a darker 1px defining edge.
- **No invented opacities** on accents — use the `*-soft` tokens.
- **No fractional pixel padding/margins** off the 8px grid.
