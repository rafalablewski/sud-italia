# Core — Components

← back to [Core README](../README.md)

The primitive vocabulary every Core surface composes from. **Don't add
to it casually** — a new primitive here lands on five modules at once
and earns or loses operator trust on every one.

## Two vocabularies

- **`.core-suite` primitives** (`suite.css`, ported from the mockup's
  `system.css`) — used by **POS** and the **Guest hub** inside
  `<CoreShell>`: `.shell` / `.sidebar` / `.topbar` / `.viewnav` (shell),
  `.card` / `.btn` (`.primary` / `.ghost` / `.lg` / `.xl` / `.icon`) /
  `.badge` (`.brand` / `.platinum` / `.success` / …) / `.input` / `.seg`
  / `.stat` / `.sw-toggle` / `.meter` / `.fchip` / `.cap` / `.matrix`,
  plus per-page layout (`.prod`, `.conv`, `.cust`, `.panel`, …). Generic
  names, all scoped under `.core-suite`.
- **`.cmd-*` chrome** (`index.css`) — used by **KDS** (the kitchen
  wall): the header / eyebrow / subbar / segmented / button / chip
  documented below, plus `.ka-*` ticket primitives.

The two share token *values* (warm-neutral, burgundy, platinum) but not
class names. Everything below is the `.cmd-*` set (KDS); the
`.core-suite` set mirrors `public/mockups/core-suite/system.css` 1:1.

## Shared chrome (every Core module uses)

### Command header — `.cmd-head`

The header bar that sits at the top of every Core surface. Holds the
wordmark / module name, the eyebrow row, the primary actions.

- Background: `--cmd-panel` (step 1 elevation).
- Border-bottom: 1px `--cmd-hair-strong`.
- Height: 56px desktop, 64px tablet.
- Layout: `flex; align-items: center; gap: 16px;`.

### Eyebrow row — `.cmd-eyebrow*`

The micro-text strip above the main grid: brand mark + module name +
contextual meta (location, current pace, count).

- `.cmd-eyebrow-brand` — the brand mark + module name; 10px Inter
  700, `letter-spacing: 0.16em`, uppercase, `--cmd-dim`.
- `.cmd-eyebrow-meta` — the contextual meta; 10px Inter 500,
  `letter-spacing: 0.08em`, uppercase, `--cmd-faint`. Wraps a `<b>` for
  the emphasised value (`--cmd-text`, 700).
- `.cmd-eyebrow-sep` — the flex-grow spacer between brand and meta.

### Subbar — `.cmd-subbar`

The filter / quick-action strip directly under the header. Tabs,
segmented controls, search.

- Background: `--cmd-canvas` (same as page — visually attached to the
  content, not the header).
- Border-bottom: 1px `--cmd-hair`.
- Sticky on scroll; doesn't shadow.

### Segmented control — `.cmd-seg-group` / `.cmd-seg` / `.cmd-seg-count`

The horizontal pill group for status / window / role switches.

- Background: `--cmd-raised`.
- Border: 1px `--cmd-hair-strong`.
- Active state: `background: --cmd-text; color: --cmd-canvas;`
  — full inversion, no halo, no shadow.
- Count chip (`.cmd-seg-count`) — small 5px-radius pill carrying the
  count for each segment; lives inside the segment.
- **Guest hub switcher** (`.guest-viewnav`) — the Inbox / Guests /
  Concierge cross-view switcher rides the same `.cmd-seg-group`, but its
  segments are Next.js `<Link>` anchors (not buttons), so the
  `.guest-viewnav .cmd-seg` rule clears the default anchor underline.
  `<GuestViewNav>` (`src/components/admin/guest/GuestViewNav.tsx`) drops
  it into each module's `cmd-head`. Active segment uses the normal
  `[aria-pressed="true"]` inversion.

### Button — `.cmd-btn`

The Core button.

- Default: `--cmd-raised` background, 1px `--cmd-hair-strong` border,
  `--cmd-text` foreground, 7px radius, 9px 17px padding, 12.5px Inter
  600.
- Hover: border `--cmd-text`, background lifts +6%.
- Disabled: `opacity: 0.5; cursor: default;`.
- **Status variant** for primary actions tied to a status:
  `.cmd-btn.ready` (border `rgba(61,214,140,0.5)`, foreground
  `--cmd-ready`); hover fills with `--cmd-ready-soft`. Same recipe
  works for `.firing`, `.warn`, `.late`.

### Chip — `.cmd-chip`

The small dense pill — labels, status tags, role markers.

- Background: `--cmd-raised` or the matching `*-soft` for status chips.
- Border: 1px `--cmd-hair`.
- 10px Inter 600, `letter-spacing: 0.08em`, uppercase for status chips.
- Always a single value — chips don't wrap. If you need wrapping,
  use the chip strip pattern from mobile (`.v2-m-chip-strip`).

## KDS — `.kds-atlas` + `.ka-ticket`

### Ticket card — `.ka-ticket`

The fundamental KDS unit.

- Background: `--cmd-raised`. Border 1px `--cmd-hair`. Radius 12px.
  Padding 16px 16px 16px 20px (extra left for the rail).
- **The coloured rail** — `::before` pseudo-element, 4px wide,
  full-height, positioned `left: 0`. Colour shifts through
  `--cmd-queued` → `--cmd-firing` (`.firing`) → `--cmd-warn`
  (`.warn`) → `--cmd-risk` / `--cmd-late` (`.risk` / on-late class)
  by state class. Instant transition — no easing.
- Header row: ticket ID (`#4821`, Inter 700, 22px), pace timer
  (JetBrains Mono 500, 22px, tabular), action button on the right.
- Item rows: ingredient name + modifier + quantity badge (`.ka-q`).
- The `:is(.kds-atlas, .kds-floor-dark)` selector scope ensures the
  same card CSS works on both the fleet board and a single-truck
  floor view.

### Quantity badge — `.ka-q`

- Inter 600, 13px, `min-width: 34px`, centred, tabular nums.
- `rgba(255,255,255,0.05)` background, 1px `--cmd-hair` border,
  5px radius, 2px 6px padding. A neutral data tag — no status colour.

### Action button — `.ka-act`

The bump / ready / undo button on a ticket.

- Same recipe as `.cmd-btn` but `min-height: 52px` on the immersive
  floor view (`.kds-os`) for thumb-target reach.
- The `.ready` state variant is the canonical green "bump it" affordance.

## POS — `.pos-tabs`

### Tab card — `.pos-tab`

A tab is an open check at the till.

- Background: `--cmd-raised`. Same radius + elevation as a ticket.
- Header: party name / table number (Inter 600), open time, current
  total (Inter 700, 22px, tabular).
- Body: line items grouped by course (see Course divider below),
  modifier inline beneath each item.
- The tab rail (`.pos-tabrail`) is the vertical chrome that lists
  every open tab — sidebar to the active tab card.

### Tender pad

The numeric input + tender breakdown.

- Numeric pad: 4×3 grid of 56px buttons, `--cmd-raised` background.
- Tender total: 26–32px Inter 700, tabular, currency suffix at 14px
  trailing (`87.40 zł`).
- Tender method buttons: full-width, `.cmd-btn` size variant, status
  tinted for cash / card / split.

### Course divider

The visual separator between courses within a tab.

- Full-width hairline `--cmd-hair-strong`.
- Centred label badge: 10px Inter 700 uppercase, `letter-spacing:
  0.16em`, `--cmd-dim`. "FIRST" / "MAIN" / "DESSERT" / "DRINKS".
- Optional fire-now button on the right edge of the divider when the
  course is queued.

## CRM — `.crm-atlas`

### Regular row

A row in the customer book.

- 36px row height. `.cmd-hair` separator. Hover lifts
  `rgba(255,255,255,0.04)`.
- Columns: name + masked phone, channels chips, RFM status chip,
  loyalty tier badge, lifetime value (tabular), last order date.
- Expanded state: row grows to a card with the deep profile drawer
  inline (only one row expanded at a time).

### Health gauge

The relationship-health indicator on a profile.

- A small radial gauge — 0..100 score, three bands (red / amber /
  green using the status hues), centre number Inter 700 22px tabular.
- Underneath: the reasons line (recency, frequency, monetary, no-show
  penalty) as inline chips.

## Concierge — `.cncrg-atlas`

### Tool card

A row in the MCP / WhatsApp capability list.

- `.cmd-raised` card; left rail in `--cmd-risk` (the AI violet, the
  one place that hue lives outside of risk-state badges).
- Header: tool name (Inter 600), surface tags (`MCP` / `WhatsApp`),
  enable toggle.
- Body: input schema preview, output schema preview, last-call timestamp.

### Allergen matrix

The EU-14 grid — the only place emoji appear in the system (per
`../modules/concierge.md`).

- 14 columns (one per allergen), N rows (one per menu item).
- Cell: filled red dot if the item declares the allergen, empty hairline
  ring if not.
- Header row: the emoji pictogram + the 2-letter allergen code.
- This is the legal-affordance surface — the emoji are not decoration.

## WhatsApp — `.wa-console`

### Thread card

A row in the conversation inbox.

- 56px row height. `.cmd-raised` background. Border 1px `--cmd-hair`.
  Radius 0 (rows in the list don't round — they're sliced from a single
  surface).
- Avatar circle (32px) + name + last-message preview (truncated).
- Trailing: timestamp + unread count chip + status indicator (active /
  paused / handed-off).

### Live thread

The middle pane — the message bubbles.

- Inbound bubble: `--cmd-raised`, 12px radius (with a 4px notch on
  the bottom-left).
- Outbound bubble: `--cmd-firing-soft`, same radius (notch on
  bottom-right).
- Timestamp inside each bubble at 10px, `--cmd-faint`.

## What this component set is not

- It is **not** the Admin component set. Admin has `glass-card`,
  `v2-btn`, `v2-input`, `v2-table` primitives. Core does not use them —
  they're a separate component vocabulary scoped to the Admin theme.
- It is **not** customisable per module. A `.cmd-btn` looks the same
  on POS, KDS, CRM, Concierge, and WhatsApp. The shared chrome is the
  reason Core reads as one product.
- It is **not** a closed list — new primitives can be added when a real
  cross-module need emerges, but they have to be reviewed against all
  five modules, not just the one that prompted them.

The Core component set is **the productised UI vocabulary** — the
muscle memory the operator builds across modules, the visual contract
that makes the suite read as one.
