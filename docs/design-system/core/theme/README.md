# Core v2 — Theme

The clean-room theme for `/core/*`. One stylesheet, one scope, zero
admin inheritance.

- **Live code:** `src/app/themes/core/index.css` (`@import`s
  `tokens.css`). Loaded **only** by `src/app/core/layout.tsx` — no
  admin `base/index.css`, no `suite.css`.
- **Scope:** everything sits under `.core` (the layout wrapper) or the
  `core-` class prefix, so it can never leak into Admin, Homepage, or the
  current `/core`.
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

- **`.core-bar`** — command bar (row 1): `.core-brand` (mark + wordmark) ·
  `.core-switch` (the segmented surface switcher, `CoreNav`) ·
  `.core-right` (global actions).
- **`.core-switch a`** — a surface tab; `.on` = active (pathname-derived).
- **`.core-sub`** — context subbar (row 2): `.core-eyebrow` + `.core-tabs`
  (the surface's view tabs) + `.core-sp` spacer + the surface's own
  controls (passed as `subRight`).
- **`.core-body`** — the surface body; `.bleed` lets a surface paint its
  own full-bleed background (KDS).

### Global-action primitives

- **`.core-chip`** — pill (location chip, status, a `Dine-in` flag).
  `.dot` = a small status dot. `.on` = filled brand (active toggle).
- **`.core-iconbtn`** — 34px square icon button (theme toggle, fullscreen).
- **`.core-clock`** — the mono HH:MM clock.
- **`.core-tabs a/button`** — subbar view tabs; `.on` = active.
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

`.core-pos` grid (rail · menu · ticket): `.core-rail` + `.core-cat` category
buttons · `.core-menu` + `.core-menu-grid` + `.core-prod` cards (`.pn` name ·
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
(Rule #11). Never reach into admin or suite.css classes — Core v2 owns
its whole surface.

## Chrome — command bar + bottom switcher

`CoreShell` renders a **single command bar** on top and a **centred bottom
surface-switcher** (no second subbar row):

- **`.core-bar`** — `.core-brand` (pinned left) · `.core-bar-ctx` (the contextual
  strip: `.core-eyebrow` + the surface's view `.core-tabs` + its own `subRight`
  controls — scrolls horizontally, `scrollbar-width:none`, when it can't all
  fit) · `.core-right` (pinned right: location · clock · notifications bell ·
  theme). Brand + controls never scroll; only the middle does.
- **`.core-bottomnav`** — a layout row (`flex:none`, reserves its own height
  `--core-navh`) that centres the `CoreNav` `.core-switch` pill at the very
  bottom. Because it's a real row, body content never hides behind it; only
  the POS fixed ticket drawer + FAB offset above it via `--core-navh`.

## Responsive — tablet & phone

Core runs on iPads and phones, not only desktop. Breakpoints at the end of
`index.css`:

| Width | What changes |
| ----- | ------------ |
| **≤1100** (tablet landscape) | POS panes narrow (`160 · 1fr · 320`); menu cards shrink. |
| **≤900** (tablet portrait) | Command bar drops the brand wordmark + the `.core-eyebrow`; POS panes `148 · 1fr · 296`. |
| **≤820** (phone / iPad portrait) | Location chip + clock hide from the bar. **POS → single column**: the category rail becomes a horizontal scroll strip, the menu fills, and the **ticket becomes a bottom drawer** — slid up by the fixed `.core-ticket-fab` bar ("View ticket · N · total"), dismissed by tap-backdrop (`CorePos` `mobileTicket` state + `.core-ticket.is-open`), offset above the bottom nav via `--core-navh`. Dialogs become bottom sheets; KPI strips → 2-col. |
| **≤560** (phone) | Bottom switcher → compact **icon-only** pill so all surfaces fit. |
| **≤480** (phone) | Menu grid 2-col; table tiles shrink; the notifications panel goes full-width fixed. |

The POS ticket is **never hidden** on small screens (the old behaviour) —
it's always reachable as the drawer, so a phone can take and settle a check.
KDS keeps its own `≤1000` lane collapse (the board follows the theme; the
kiosk stays dark); Guest/Service keep their existing `≤1000–1100` two-pane
collapses.
