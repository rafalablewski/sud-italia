# Core — Theme

The clean-room theme for `/core/*`. One stylesheet, one scope, zero
admin inheritance.

- **Live code:** `src/app/themes/core/index.css` (`@import`s
  `tokens.css`). Loaded **only** by `src/app/core/layout.tsx` — no
  admin `base/index.css`, no `suite.css`.
- **Scope:** everything sits under `.core` (the layout wrapper) or the
  `core-` class prefix, so it can never leak into Admin or Homepage.
- **Fonts:** the layout's own `next/font` instances — `--font-core-display`
  (Bricolage Grotesque, `opsz` axis) · `--font-core-ui` (Inter) ·
  `--font-core-mono` (JetBrains Mono). No `--font-admin-*`.

## Tokens

Defined per-mode on `.core[data-theme="dark|light"]` in `tokens.css`.
**Dark is the default** (the bare `.core` block = dark) for night trucks +
kitchen glare; light is the option. The theme toggle
(`CoreThemeToggle`) writes `data-theme` on the `.core` root and persists
to `localStorage["core-theme"]`; a pre-paint script in the layout applies
the saved choice without a flash.

| Group | Tokens |
| --- | --- |
| Surfaces | `--bg` · `--panel` · `--panel-2` · `--panel-3` · `--hover` |
| Ink | `--ink` · `--ink-2` · `--ink-3` |
| Lines | `--line` · `--line-2` |
| Brand | `--brand` · `--brand-bright` · `--brand-ink` · `--brand-wash` |
| Semantic | `--basil` · `--amber` · `--info` · `--danger` (+ each `*-wash`) |
| Accent ink | `--on-accent` (white-on-brand/danger) · `--on-basil` (ink on a green fill) |
| Tier metals | `--tier-platinum` · `--tier-silver` · `--tier-bronze` (+ each `*-wash`) |
| Elevation | `--sh-1` · `--sh-2` · `--sh-pop` |
| Type | `--display` · `--ui` · `--mono` |
| Radius | `--r-sm` 7 · `--r-md` 10 · `--r-lg` 14 · `--r-xl` 20 · `--pill` |
| Motion | `--fast` · `--base` |

KDS re-declares the surface/ink + tone tokens in its own `.core-kds` scope —
dark by default, but the **in-shell board** follows `data-theme` (a light
override on `.core-body .core-kds`). Only the **fullscreen kiosk** stays a fixed
dark wall.

## Material

Flat. 1px hairlines (`--line` / `--line-2`), crisp small shadows
(`--sh-1` / `--sh-2`), no glass / gradient / glow. That's the deliberate
line between Core (crisp) and Admin (glass) — see the design-language
decisions in [`../README.md`](../README.md).

## Components (class reference)

The shell + shared primitives, all `core-` prefixed. Anatomy of each
surface lives in [`../modules/`](../modules/).

### Shell (`CoreShell` · `src/core/shell/`)

The command bar is the **"Command"** terminal chrome — one all-monospace row,
left→right: traffic lights · shell prompt · view-tab chips · spacer · the
surface's own controls · ⌘K launcher · telemetry cluster · global tools.

**Bar contract — keep it minimal.** The bar carries only what the "14 —
Command" mockup gives each surface: the prompt, the view tabs, a *short* set of
surface tool icons, an optional primary action, an optional live pill, then the
global cluster. Per surface: **POS** = QR + fullscreen · **KDS** = *nothing*
(board-only) · **Orders** = refresh · **Service** = refresh + a primary
(Floor "Add table", Slots "New") · **Guest** = the 3 inbox tools + WhatsApp-live.
Anything heavier — KDS's lane filter + board actions, POS's channel/held flags,
Slots' view filters + date, Book's date — lives **on the surface**, not the
chrome (see `.core-kds-toolbar` / `.core-surf-toolbar` below). When you add a
control, ask "does the mockup put this in the bar?" — if not, it goes in a
surface toolbar.

- **`.core-bar`** — the command bar itself: `font-family: var(--mono)`, a
  `--panel` row with a `--line` bottom hairline.
- **`.cm-lights`** — decorative macOS traffic-light chrome; the three dots are
  tokenised `--danger` · `--amber` · `--basil`. **`.cm-div`** — a 1px vertical
  divider (`--line-2`) flanking the prompt.
- **`.cm-prompt`** — the live shell prompt `core ❯ surface:tab` (`CorePrompt`):
  `.u` = the green `core` user (`--basil`), `.g` = the `❯` glyph, `.c` = the
  `surface:tab` location (surface read from the pathname, tab from the active
  view tab). **`.cm-caret`** — the blinking block caret (`core-caret-blink`;
  stilled under `prefers-reduced-motion`).
- **`.cm-tabs`** — the shell's `.core-tabs` in the bar: mono, `lowercase`,
  swipe-scroll; `.on` = a `--basil` chip with a basil inset ring.
- **`.cm-sp`** — the flex spacer that pushes the tail cluster right.
- **No surface tools in the bar.** The command bar is ONE standard on every
  surface (prompt · tabs · ⌘K · risk/loc/clock · bell · theme). A surface's own
  controls — passed as `subRight`, plus richer filters/segments/date pickers —
  live in a **`.core-surf-toolbar`** at the top of the Canvas body (see the
  "Chrome" section), never the chrome. `CoreShell` renders `subRight`
  right-aligned in that toolbar automatically; a surface that builds its own
  richer toolbar (Slots) passes no `subRight`.
- **`.core-surf-toolbar` tools** keep the flush terminal treatment there: every
  `.core-iconbtn` inside it (and the global `.cm-right` bell/theme) shares one
  32px transparent mono style, hover → `--basil`; icon-only tools stay a 32px
  square, labelled ones (KDS `86` / `Σ`, the QR count) grow, the amber
  `.core-recall-btn` keeps its emphasis (excluded). `.core-chip` status flags
  (the Guest concierge live pill) go mono too. The shared SVG glyphs (QR ·
  expand · refresh · sound · pause) come from
  [`src/core/shell/toolIcons.tsx`](../../../src/core/shell/toolIcons.tsx) — one
  24-viewBox, 1.6-weight line set — so no surface hand-rolls a unicode/emoji
  glyph. (Semantic text labels like KDS `86` / `Σ` stay as text.)
- **`.cm-primary`** — a surface's primary action (Service "add table" / "new"):
  a basil-outlined mono pill with a leading `PlusIcon`, hover-fills basil. Lives
  in the `.core-surf-toolbar`, not the command bar.
- **`.cm-k`** — the ⌘K launcher chip (`CmdkLauncher`, fires `core:cmdk`): a
  leading **`.cm-k-ico`** magnifier glyph + `.cm-k-label` (the "search" word,
  collapses to just the `⌘K` kbd on narrow).
- **`.cm-tel`** — the telemetry cluster; each reading is a **`.cm-tel-item`**
  (an optional leading **`.cm-tel-glyph`** + `.lbl` dim key + `.val` bright
  value): `▲ risk N` from `PressureBadge` (`.ok`/`.warn`/`.risk` colour the
  glyph + count basil/amber/red — matching the mockup's `▲ risk`),
  **`.cm-tel-loc`** the click-to-cycle `◈ loc <slug>` from `CoreLocationChip`
  (ember diamond glyph), and
  **`.cm-tel-clock`** the basil mono HH:MM clock.
- **`.cm-right`** — the global tools (notifications bell · theme toggle) as
  flush 32px terminal icon buttons (hover → `--basil`).
- **`.core-body`** — the surface body; `.bleed` lets a surface paint its
  own full-bleed background (KDS).
- **Stat strip** — ONE look across every surface: KDS's `.core-kpi`, the
  Guest `.core-kpi-strip` and POS's / Floor's / Orders' / Slots' `.core-statstrip` are
  **undivided** columns (no inter-cell hairlines — the cells read as one open,
  continuous row, held apart by their own padding) with an uppercase mono label
  and a big **mono tabular** value. `.core-kpi` / `.core-kpi-strip` use `gap: 0`
  over a transparent track (the per-cell `.k` fill tiles seamlessly);
  `.core-kpi-strip` lays its cells out with `grid-auto-flow: column` (auto
  `minmax(0,1fr)` tracks), so 4-, 5-, 6- or 7-cell strips all distribute evenly
  in one row — no fixed column count to overflow. Only a single `border-bottom`
  hairline separates the strip from the content below. Same component language
  everywhere — a KDS KPI, a Floor KPI and a Loyalty KPI read identically.
  - **`.core-statstrip`** — the dense-console variant used at the top of a
    surface body (POS, **Floor**, **Orders**, **Slots**, **CRM**, **Loyalty**, **Book**, **Inbox**, **Dispatch**): a bordered glass panel of `.cell`s, each an
    uppercase mono `.lab`, a big mono-tabular `.val` (tone with `.brand`/
    `.basil`/`.amber`/`.info`/`.danger`, optional `<small>` unit), and a
    colour-coded `.delta` sub-line (`.up` basil / `.dn` danger / `.warn` amber).
    The cells carry **no divider** — the panel border frames them and the cell
    padding sets the rhythm. Every figure MUST be real surface data (Rule #1).
    Matches the mockup's `.statstrip`.
- **`.core-crumb`** — the dense-console breadcrumb line (mockup `.cap`): an
  uppercase mono `CORE — SURFACE · … · liquid glass · [context]`, with `b`
  basil and a `.fix` ember pill for the location/mode tag. Sits directly above
  the `.core-sectionhead` (Floor).
- **`.core-sectionhead`** — the surface page head: a grotesk `<h1>`/`<h2>` title
  beside an uppercase-mono `.sub`, with a `.core-sp` spacer for a right-aligned
  context tag. Sits under the sub-toolbar, over the stat strip.
- **`.core-surf-toolbar`** — a thin control strip at the TOP of a surface body
  for the working controls the bar omits (Slots' view filters + date, Book's
  date). `.core-surf-tb-lbl` = its small uppercase field label. Belongs to the
  surface, not the global chrome.
- **`.core-kds-toolbar`** — the KDS board's own toolbar (lane filter left,
  board actions + fullscreen right, split by `.core-kds-tb-sp`) — because the
  KDS command bar carries no tools.

### Global-action primitives

- **`.core-chip`** — pill (surface status flags, a `Dine-in` flag, the Orders
  channel tag). `.dot` = a small status dot. `.on` = filled brand (active toggle).
- **`.core-iconbtn`** — 34px square icon button (the default in surface bodies —
  KDS lane toolbar, inbox conversation actions); reskinned to a flush 32px
  terminal button inside a `.core-surf-toolbar` and the global `.cm-right`, above.
- **`.core-switch`** — the segmented pill switcher (`.sm` = compact; Orders
  scope tabs). `.on` = active.
- **`.core-tabs a/button`** — the shell's view tabs; `.on` = active. In the
  command bar they carry `.cm-tabs` for the mono/lowercase treatment.
- **`.core-seg button`** — a segmented filter (KDS stage filter, etc.).
  `.core-seg.icons` = square icon-only cells (centred 16px glyph) for an
  icon-only switcher / filter pod; pair each button with a `title` /
  `aria-label` so the dropped text stays accessible.
- **`.core-gfilters`** — the shared **glyph-only filter bar** for the guest
  surfaces (Inbox / Loyalty / CRM): one flex-wrap row where every control is a
  uniform 34px, a `.core-search` (leading magnifier glyph) flex-grows to fill,
  and the filters are `.core-seg.icons` pods. Loyalty's tier pod adds
  `.core-tierseg` (gems tinted per metal). Glyphs come from
  `src/core/guest/glyphs.tsx`.

### POS

`.core-pos` grid (rail · menu · ticket) — three **floating rounded glass cards**
with `gap:10px` + a 14px body inset (mockup `pos-grid`), each frosted under
liquid-glass: `.core-rail.core-rail-icons` (the
**pure icon-only** 56px category rail, `align-self:start`) + `.core-cat` icon buttons (glyph +
corner count badge, label as tooltip) · `.core-menu` + `.core-menu-grid` +
`.core-prod` cards (`.pn` name ·
`.pd` desc · `.core-tagrow`/`.core-tag` · `.pp` price · `.add`) · `.core-ticket`
+ `.core-ticket-empty` (the no-open-check state). Full anatomy:
[`../modules/pos.md`](../modules/pos.md).

## Reset specificity (a recurring trap — read this)

A scoped reset must never out-rank the components it resets. The footgun:
a reset written as `.core button { background: none; border: 0; padding: 0 }`
has specificity **(0,1,1)** — higher than a single-class control like
`.core-prod` **(0,1,0)** — so it silently strips the panel / border /
padding off every button. (This is the same bug that lives in the old
`/core`: `.core-suite * { margin: 0; padding: 0 }` at suite.css:81 zeroes
the padding of any shared `src/ui` control or Tailwind utility dropped
inside a Core surface, because it ties at (0,1,0) and wins on source
order.)

Two defences, both applied here:

1. **The reset is wrapped in `:where()`** so its scope contributes zero
   specificity — `:where(.core) button` = **(0,0,0)**. Now *anything* with
   a class beats it (our `core-*` rules, a shared `.v2-btn`, a Tailwind
   `.px-3`), while bare `<p>` / `<ul>` / `<button>` still reset.
2. **Component rules are double-scoped** `.core .core-foo` **(0,2,0)** — the
   same discipline suite.css uses (`.core-suite .card`). Belt and braces.

Net: a reset can only ever *lose* to a real style. Never write a
single-class component rule that a `.core element` reset could beat, and
never give a reset more than zero specificity.

## Extending

Add a token? Put it in `tokens.css` under **both** `data-theme` blocks
(or just the dark default if mode-invariant) and document the row above.
Add a component class? Prefix it `core-`, build it from tokens (never
hard-coded hex), and add it to the reference here in the same commit
(Rule #11). Never reach into admin or suite.css classes — Core owns
its whole surface.

## Chrome — command bar + left Lens Rail

`CoreShell` renders the **"Command"** terminal command bar on top and the
**left Lens Rail** (`CoreNav`, `.core-lens`) down the side — no brand
wordmark, no second subbar row, no bottom switcher:

- **`.core-bar`** — the mono terminal row, tail-to-tail: `.cm-lights` (traffic
  lights) · `.cm-div` · `.cm-prompt` (the live `core ❯ surface:tab` prompt +
  `.cm-caret`) · `.cm-div` · `.cm-tabs` (the surface's swipe-scroll view tabs) ·
  `.cm-sp` (spacer) · `.cm-k` (⌘K launcher) · `.cm-tel` (risk · loc · clock
  telemetry) · `.cm-right` (bell · theme). ONE standard on every surface — no
  surface tools here; those live in a `.core-surf-toolbar` on the body. Only
  `.cm-tabs` scrolls; everything else is `flex:none`.
- **`.core-surf-toolbar`** — the surface sub-toolbar at the top of the Canvas
  body that carries the surface's own controls (`subRight` right-aligned, plus
  any filters/segments/date the surface builds). An optional **`subLeft`** slot
  renders a left-aligned **`.core-surf-tb-lbl`** context label (POS's
  "TILL 1 · DINNER SERVICE", mockup toolbar). Keeps the command bar standard.
- **`.core-lens`** — the icon-only 56px Lens Rail that switches the four room
  lenses (**Floor · POS · KDS · Book** — the plain names, not "Line"/"Pass"),
  then a `.core-lens-div` divider and the two ops adjacencies the dense-console
  mockup pins below it (**Reports · Settings**, linking into the admin shell).
  Icons trace the mockup 1:1: Floor = 2×2 grid, POS = register with legs, KDS =
  split pass panel, Book = calendar, Reports = line chart, Settings = gear. Each
  row is `.core-lens-ico` + a `.core-lens-txt` (mono label + `.core-lens-sub`
  caption); the **active** lens gets the ember `--brand-wash` fill, an inset
  ring, and an ember `::before` left accent bar. Collapsed by default; it
  expands to labels only when **pinned** — a click on the `.core-lens-pin`
  toggle adds `.open` — never on hover, so a stray cursor never shoves the
  Canvas. The pinned choice persists (localStorage, `core-lens-pinned`). It
  sits inside `.core-main`, beside the Canvas, spanning the full body height
  under the command bar. Distinct from the POS category `.core-rail`. Orders +
  Guest are cross-cutting surfaces reached from ⌘K.

## Responsive — tablet & phone

Core runs on iPads and phones, not only desktop. Breakpoints at the end of
`index.css`:

| Width | What changes |
| ----- | ------------ |
| **≤1100** (tablet landscape) | Command bar sheds the low-priority `loc` telemetry (`.cm-tel-loc`); POS panes narrow (`160 · 1fr · 320`); menu cards shrink. |
| **≤900** (tablet portrait) | Command bar drops the decorative traffic lights + dividers (`.cm-lights` / `.cm-div`) and collapses the ⌘K launcher to just its chip (`.cm-k-label` hidden); POS panes `148 · 1fr · 296`. |
| **≤1040 / ≤1000** | The dense **two-column bodies collapse to one column** — CRM (`.core-crm-grid`), Loyalty (`.core-loy-grid`), Dispatch (`.core-disp-grid`), Slots (`.core-slots-grid`), Book (`.core-book`, incl. resetting the form rail's `grid-column`), Concierge (`.core-concierge`) all stack their side panel/rail below the main column. Wide data tables (`.core-roster`, `.core-otable`, the Loyalty roster) **scroll horizontally** (`overflow-x: auto`) rather than clip, so every column stays reachable on a phone. |
| **≤820** (phone / iPad portrait) | The telemetry clock (`.cm-tel-clock`) hides from the bar. **POS → single column**: the category rail becomes a horizontal scroll strip, the menu fills, and the **ticket becomes a bottom drawer** — slid up by the fixed `.core-ticket-fab` bar ("View ticket · N · total"), dismissed by tap-backdrop (`CorePos` `mobileTicket` state + `.core-ticket.is-open`), offset above the bottom nav via `--core-navh`. Dialogs become bottom sheets; KPI strips → 2-col. |
| **≤560** (phone) | The Lens Rail stays a narrow icon-only 52px rail; the pin toggle still expands it (to a slimmer 176px). |
| **≤480** (phone) | Menu grid 2-col; table tiles shrink; the notifications panel goes full-width fixed. |

The POS ticket is **never hidden** on small screens (the old behaviour) —
it's always reachable as the drawer, so a phone can take and settle a check.
KDS keeps its own `≤1000` lane collapse (the board follows the theme; the
kiosk stays dark); Guest/Service keep their existing `≤1000–1100` two-pane
collapses.
