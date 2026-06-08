# Core — Components

← back to [Core README](../README.md)

The primitive vocabulary every Core surface composes from. **Don't add
to it casually** — a new primitive here lands on five modules at once
and earns or loses operator trust on every one.

## Two vocabularies

- **`.core-suite` primitives** (`suite.css`, ported from the mockup's
  `system.css`) — used by **every** Core surface (POS, Guest, Service, and
  the windowed KDS) inside `<CoreShell>`: the unified shell —
  `.core-shell` / `.core-head` / `.core-nav` / `.subbar` / `.core-body`
  (**no sidebar**, see [Shell](#shell--core-shell-unified-header-no-sidebar)),
  plus `.viewnav` /
  `.card` / `.btn` (`.primary` / `.ghost` / `.lg` / `.xl` / `.icon`) /
  `.badge` (`.brand` / `.platinum` / `.success` / …) / `.input` / `.seg`
  / `.stat` / `.sw-toggle` / `.meter` / `.fchip` / `.cap` / `.matrix`,
  plus per-page layout (`.prod`, `.conv`, `.cust`, `.panel`, …). Generic
  names, all scoped under `.core-suite`.
- **`.cmd-*` / `.ka-*` chrome** (`index.css`) — **retired.** It backed the
  phone `MobileKDS`, which was deleted in the mobile-shell cleanup; the
  `.ka-*` ticket primitives documented below are no longer rendered. The
  desktop KDS kitchen wall was rebuilt onto `suite.css` `.kds-core` (`.tk` /
  `.ct` / `.cmdbar`; see [`../modules/kds.md`](../modules/kds.md)). This
  section is kept as a record of the retired chrome.

The two share token *values* (warm-neutral, burgundy, platinum) but not
class names. Everything below is the `.cmd-*` set (Mobile KDS + legacy
chrome); the `.core-suite` set mirrors
`public/mockups/core-suite/system.css` 1:1.

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
  `<GuestViewNav>` (`src/core/guest/GuestViewNav.tsx`) drops
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

## KDS — `.kds-atlas` + `.ka-ticket` (mobile only)

> **Scope:** the **desktop** KDS (Fleet / Floor / Chef) was rebuilt onto the
> `.kds-core` core-suite surface — `.cmdbar` / `.truck` / `.mt` (Fleet),
> `.kds-board` / `.tk` (Floor), `.kds-chefstrip` / `.kds-queue` / `.ct`
> (Chef). Its anatomy lives in [`../modules/kds.md`](../modules/kds.md). The
> `.kds-atlas` / `.ka-*` vocabulary below is **retired** — its only renderer,
> the phone `MobileKDS`, was deleted; kept here as a historical record.

### Ticket card — `.ka-ticket` (mobile)

The fundamental unit of the **mobile** KDS.

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

## POS · Guest — now `.core-suite` (`suite.css`)

POS and the Guest hub (CRM · Loyalty · Concierge · WhatsApp) were rebuilt
onto the **`.core-suite`** vocabulary ported from the mockup's
`system.css` — the `.pos-*` / `.crm-*` / `.cncrg-*` / `.wa-console`
thread classes documented here previously are **removed**. Their
component anatomy now lives in the module docs, which describe the real
shipped markup:

- **POS** — `../modules/pos.md` (`.tabrail` / `.cat-rail` / `.prod` /
  `.ticket` / `.course` / `.tk`-style ticket lines).
- **CRM** (Guests) — `../modules/crm.md` (`.book` / `.cust` / `.profile`
  / `.panel` / health ring + RFM `.rfm`).
- **Loyalty** — `../modules/loyalty.md` (`.loy` shell + `.loy-kpis` `.bk`
  cards + `.loy-filters` + `.tbl` roster + `.loy-wallets` cards + the
  `.badge.bronze` / `.silver` / `.gold` tier tones that complete the
  `.badge` ramp). The **Customer Intelligence** dialog adds self-contained
  `.ci-*` classes + `.ci-badge` tones scoped under `.v2-dialog-core` (the
  portal is outside `.core-suite`, so it can't inherit core primitives). The
  **Win-back** tab (Phase-2 retention) adds `.wb-*` classes — and, since it
  renders inside `.core-suite`, uses the core `.badge` tones directly.
- **Concierge** — `../modules/concierge.md` (`.cap` rows + `.matrix`
  allergen grid).
- **Service** — `../modules/service.md` (the merged Floor + Slots booking
  console: `.svc` shell + `.svc-grid` / `.svc-block` form + `.fchip` slot/table
  pickers + `.svc-side` bookings rail). Built from core primitives — no v2.
- **WhatsApp** (Inbox) — `../modules/whatsapp.md` (`.convs` / `.bub`
  bubbles / `.ctx` order context). The `.wa-console` / `.wa-fa-*` /
  `.wa-cfg-*` classes in `index.css` survive only for the Settings /
  Broadcast / Funnel dialogs.

The shared `.core-suite` primitives (`.card` / `.btn` / `.badge` / `.seg`
/ `.stat` / `.sw-toggle` / `.fchip` …) mirror `system.css` 1:1 and are
listed in [the README](./README.md#two-css-layers-mid-migration).

### Shell — `.core-shell` (unified header, no sidebar)

Core is a **separate entity** from `/admin`: `<CoreShell>`
(`core/shell/CoreShell.tsx`) renders **none** of the admin shell —
no `.app-sidebar`, no `nav.config`, no `/admin` links. There is **no sidebar
at all**. Every Core surface (POS, Guest, Service, and the windowed KDS) shares
this one chrome, so each surface's controls sit in the same place:

- **`.core-shell`** — the flex column that owns the viewport (`height: 100%`).
- **`.core-head`** (row 1) — `brand` (the SI mark + "Sud Italia / Core") ·
  **`.core-nav`** (the primary switcher: POS · KDS · Guest · Service, a
  pathname-highlighted `<CoreNav>`, `core/shell/CoreNav.tsx`) ·
  **`.core-head-right`** (global actions — location toggle, fullscreen, the
  KDS clock + controls).
- **`.subbar`** (row 2, only when the surface passes `eyebrow` / `viewnav` /
  `subRight`) — **`.subbar-left`** (an `.eyebrow` label + the surface's
  `.viewnav` sub-tabs: GuestViewNav, ServiceViewNav, the KDS Fleet/Floor/Chef
  switch) · **`.subbar-right`** (the surface's own controls — POS channel +
  steer, the Slots date picker, the KDS stage filter + Sandbox badge).
- **`.core-body`** — each surface owns its scroll/layout. `bleed` drops the
  padding so the dark KDS wall (`.kds-core.in-shell`) can fill it.

The old `.core-suite .shell` grid + `.sidebar*` / `.nav-item` / `.crumbs` /
`.topbar` rules and the `.app-sidebar` reset exemption are **gone** — the reset
is a plain `.core-suite *`. KDS keeps its own dark `.kds-core` body **inside**
this shell (light header over the dark wall); fullscreen kiosk drops the chrome
for the bare wall (see [KDS](../modules/kds.md)).

### Dialogs — `theme="core"`

Dialogs opened from a Core surface pass **`theme="core"`** to the shared
v2 `Dialog`. That tags the portal root `.v2-dialog-core`; a scoped block
in `suite.css` redefines the admin token vars so the modal renders in the
dark warm-neutral palette (chrome **and** body) without rewriting the
dialog body. Used by the WhatsApp Settings / Broadcast / Funnel dialogs
and the POS table-assign / address dialogs. The full-screen tender pad is
a bespoke `.core-suite-overlay` instead.

Like every shared v2 overlay, these portal to `#admin-portal-root` (via
`adminOverlayTarget()` in `src/ui/portal.ts`), not `<body>` — that wrapper
also wraps Core routes, so it keeps the dialog inside the `--font-admin-*`
font scope. See the Dialogs/overlays note in
[`admin/theme/components.md`](../../admin/theme/components.md#dialogs--overlays).

### Loading skeleton — `.skel*` + `Skeleton.tsx`

The client-fetched surfaces (CRM · Loyalty · Inbox · Slots · Book) fetch
their rows in a `useEffect`, so their first frame has no data. Instead of a
dead centered **`.pane-msg`** "Loading…" label, they render a **shimmer
skeleton** shaped like the content that's arriving — the cheapest way to
make a fetch read as *fast* rather than *stalled*.

Live code: `src/core/shared/Skeleton.tsx` (one shared primitive for the
whole suite) + `.core-suite .skel*` in `suite.css`.

- **`<Skeleton w h r />`** → `.skel` — a single shimmer block; `w`/`h`/`r`
  are inline so callers shape it to a name, a number, an avatar. The sheen
  is a `::after` gradient swept by `@keyframes core-skel-sheen`; it stops
  under `prefers-reduced-motion: reduce`.
- **`<SkeletonTable rows cols />`** → `.skel-tbl` / `.skel-row` — rows on
  the same **48px** grid + 12px gutters as `.tbl`, columns sized by `cols`
  (numbers → `fr`), so the placeholder lines up with the real table. Used
  by CRM (6-col), Loyalty roster (5-col), redemptions (4-col).
- **`<SkeletonList rows avatar />`** → `.skel-list` / `.skel-li` — two-line
  entries with an optional leading avatar circle. Used by the Inbox
  conversation list (`avatar`), Loyalty wallets, Slots, and Book.

Each container carries `role="status"` + `aria-busy="true"`; the Inbox
transcript composes raw `<Skeleton>` bubbles inline (alternating
left/right) rather than a list. This is **Core's own** loading idiom — it
does not use the admin `.v2-page-loading` pill (that stays the KDS
first-frame chip, see [KDS](../modules/kds.md#loading-pill)).

## What this component set is not

- It is **not** the Admin component set. Admin has `glass-card`,
  `v2-btn`, `v2-input`, `v2-table` primitives. Core does not use them —
  they're a separate component vocabulary scoped to the Admin theme.
- It is **not** customisable per module. A `.core-suite .btn` looks the
  same on POS and every Guest view; the `.cmd-btn` chrome is shared
  across the KDS lenses. The shared vocabulary is the reason Core reads
  as one product.
- It is **not** a closed list — new primitives can be added when a real
  cross-module need emerges, but they have to be reviewed against all
  five modules, not just the one that prompted them.

The Core component set is **the productised UI vocabulary** — the
muscle memory the operator builds across modules, the visual contract
that makes the suite read as one.
