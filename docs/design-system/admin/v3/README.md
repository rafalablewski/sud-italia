# Admin v3 — "Operator Terminal"

> **Status: in active build (preview).** v3 is a ground-up rebuild of the
> admin back-office, fully isolated from v2 so that once it reaches parity
> the v2 system (`src/components/admin/v2/`, the top-level `Admin*.tsx` page
> bodies, the `src/app/admin/*` routes) can be deleted without touching v3.
> The shared base stylesheet (`src/app/themes/base/index.css`, formerly
> `themes/admin`) is **kept** — it backs the staff/kitchen portals +
> Core, so it outlives v2 (the login door **and the shared-device PIN terminal**
> now run on av3 — see [Auth door](#auth-door--the-login-surface)). **This doc grows with the code**
> per design-system Rule #11.

## Why a v3

v2 is mature, polished, and governance-locked — but it was built for
*identity and breathing room*. The operator running two trucks across Kraków
and Warszawa needs the opposite: **maximum signal per screen, fewer clicks,
and a modern data-forward surface**. v3's brief, decided with the owner:

- **Density / efficiency** — more live numbers in view, tighter controls,
  one-glance KPI rails, compact tables, a collapsible icon rail. Built for a
  power user who lives in this product all day.
- **Modernization** — current dashboard idioms (inline sparklines, delta
  chips, restrained motion, tabular numerals everywhere) on a deeper,
  cleaner dark canvas. The reference remains Linear / Stripe / Bloomberg —
  but pushed denser.

The philosophy is unchanged from the admin theme — **Rams restraint, Ive
soul, quiet power** (see [`../theme/philosophy.md`](../theme/philosophy.md)).
v3 spends that restraint differently: the brand still appears once (wordmark,
the single money CTA), colour is still signal, but the *grid is tighter* and
*every pixel of chrome is justified by a number it reveals*.

## Isolation contract (so v2 stays deletable)

| Concern        | v2 (to be deleted)                          | v3 (the rebuild)                               |
| -------------- | ------------------------------------------- | ---------------------------------------------- |
| Theme CSS      | `src/app/themes/base/index.css` (**shared base — kept**; backs the staff/kitchen portals + Core — login + PIN terminal moved to av3 §23) | `src/app/themes/admin-v3/index.css` (incl. the login door + PIN terminal, §23) |
| Class prefix   | `.v2-*`, `.glass-*`, `.admin-*`, `.app-sidebar` | `.av3-*` (single prefix, no legacy aliases) |
| Token scope    | `[data-admin-theme]` on `<html>`            | `.av3-root` (reads the same `[data-admin-theme]` attr) |
| JS token mirror| `src/components/admin/v2/theme.ts`          | `src/admin-v3/theme.ts`             |
| Components      | `src/components/admin/v2/*`                 | `src/admin-v3/*`                     |
| Mount route    | (retired) | **`/admin/*`** — the canonical route (no `/admin-v3` URL; `src/app/admin/(shell)/*`). `src/proxy.ts` only folds legacy detail URLs + redirects `/admin/capabilities`. Managers/franchisees rewrite onto `/admin/*`. |

**The one shared dependency v3 keeps:** the framework-level libs that are
*not* part of either theme — `@/lib/permissions`, `@/lib/admin-roles`,
`@/lib/admin-auth`, `@/lib/admin-base`, `@/data/locations`, and the
PLN-pinning `CurrencyGuard`. These are app infrastructure, not v2, and
survive a v2 deletion. v3 imports nothing from `components/admin/v2/`.

**Theme boot reuse, not coupling:** v3 reads the same `[data-admin-theme]`
attribute the existing boot script sets on `<html>`, but ships its **own**
boot script (`themes/admin-v3/theme.ts` → `themeBootScriptV3`) so deleting v2
leaves it intact. Dark is canonical; light is opt-in.

## Tokens

All v3 tokens are `--av3-*` and live only inside `.av3-root` in
`src/app/themes/admin-v3/index.css`, mirrored in
`src/admin-v3/theme.ts` for charts / inline SVG. Never hardcode a
hex in a v3 component — use the token.

| Group     | Tokens (dark canonical)                                                  |
| --------- | ----------------------------------------------------------------------- |
| Canvas    | `--av3-bg` `--av3-s1` `--av3-s2` `--av3-s3` `--av3-hover`                |
| Hairlines | `--av3-line` `--av3-line-strong`                                         |
| Text      | `--av3-fg` `--av3-muted` `--av3-subtle`                                  |
| Brand     | `--av3-brand` `--av3-brand-soft` · `--av3-platinum` (active / premium)   |
| Status    | `--av3-ok` `--av3-warn` `--av3-bad` `--av3-info` (+ `-soft` mixes)       |
| Geometry  | `--av3-r-{sm,md,lg,pill}` radius · `--av3-gap-{1..5}` spacing            |
| Motion    | `--av3-ease` · `--av3-t-{fast,base,slow}`                                |
| Charts    | `--av3-c1 … --av3-c8` (mirrors `theme.ts` palette)                       |

## Shell

`AdminShellV3` (`src/admin-v3/AdminShellV3.tsx`) — a denser frame:
a **232px sidebar that collapses to a 60px icon rail** (state persisted), a
**44px topbar** with breadcrumb + the single shell-level scope switcher +
theme toggle + notification bell, and a content well on a tight grid. Nav
taxonomy mirrors v2 (`v3/nav.config.ts`, same sections).

**Access gating mirrors v2's two ANDed gates** (this is the UX layer — the
server still enforces every `/api/admin/*` call). `SidebarV3` reads
`/api/admin/me` and passes the viewer's role **and** effective permissions
(`allAccess` / `permissions`) into `filterNavForRoleV3`:
1. **Role-rank floor** — `requiredRole` via `@/lib/admin-roles`; the only gate
   for items whose page has no mapped permission (Alerts, Payments,
   QR ordering, Integrations).
2. **Granular permission** — each item is shown only when the viewer's effective
   permissions include the key `permissionForAdminPage(href)` requires, so the
   admin's **Permission Matrix is the source of truth** for the rail. A
   role-default user's effective set *is* their preset (no-op, same nav as
   before); a per-user custom grant shows exactly the pages it permits. Owners
   (`allAccess`) skip it.

`AdminShellV3` also runs a **client page guard** (parity with `CoreProviders`):
for any non-owner (`allAccess` skips) it `router.replace`s to their landing when
the current page maps to a permission their effective set lacks, so a typed URL
/ stale bookmark to a forbidden surface bounces home instead of loading a shell
the API would 403. It gates the whole-preset, not just custom grants — because
the manager default now excludes the owner-by-default surfaces (see below), a
role-default manager is bounced from `/manager/reports` too.

## Responsive & touch

v3 is **desktop-dense first**, but every surface stays usable down to a phone
through a single responsive cascade in `themes/admin-v3/index.css` §9 (plus a few
component-scoped sections that own their own reflow — e.g. Agent HQ §24
`.av3-ahq-*`) — keep new responsive rules in §9 or the owning component section,
not as one-off media queries scattered through the file. Four breakpoints,
narrowing in:

| Width   | What changes |
| ------- | ------------ |
| ≤1180px | Two-column page splits (`.av3-bodysplit`) collapse to one column. |
| ≤900px  | The sidebar becomes an **off-canvas drawer** — `AdminShellV3` toggles `data-mobile-open`, `TopbarV3` grows the hamburger (`.av3-side-toggle-mobile`), a scrim covers the content, and the drawer **ignores the desktop rail-collapsed state** so a phone user who left the sidebar collapsed still gets full labels. The breadcrumb keeps only its last segment. |
| ≤720px  | Content gutter tightens; `.av3-grid-2` / `.av3-grid-2-1` / `.av3-formrow` / `.av3-formrow-4` / `.av3-od-grid` stack one-per-row; dense editor rows (`.av3-locrow`, `.av3-reciperow`) get a `min-width` so header + rows scroll together inside the dialog body rather than crushing. |
| ≤560px  | Phone: tap targets hit the 44px floor (`.av3-icon-btn`, `.av3-nav-item`, `.av3-fchip`, `.av3-toggle`, `.av3-switch`, `.av3-iconbtn-sm`), KPI tiles/levers go one-up, dialogs go near-full-bleed (`.av3-dialog-root` padding shrinks, footer buttons stack full-width), and **page-level config/editor rows (`.av3-cfgrow`) stack one control per line** so a `label + fixed controls` row never crushes its label to a few pixels (the `.av3-cfgrow-head` column-label strip hides). |

A `@media (pointer: coarse)` floor gives a touchscreen real hit areas at any width.

**Grid/flex tracks must be allowed to shrink.** The layout grids (`.av3-col`,
`.av3-grid-2`, `.av3-grid-2-1`, `.av3-cols-*`, `.av3-mini2`, `.av3-bodysplit`)
carry `min-width: 0` on their items in §9. Without it a grid/flex child keeps its
default `min-width: auto` and refuses to shrink below its content's intrinsic
size, so one wide descendant (a chart, a dense number row, a long unbreakable
string) holds its column wider than the phone — and since iOS Safari *expands the
layout viewport* to absorb horizontal overflow, that one column defeats **every**
breakpoint below at once (the whole page shrinks/clips, not just that element).
The `min-width: 0` lets the tracks collapse to device width and leaves real
overflow to the inner scroll-wrappers (`.av3-table-wrap`, `.av3-heat-wrap`). When
you add a new layout grid, give its items `min-width: 0` too.

**Responsive helpers (use these, not an inline `grid-template-columns`).** An
inline grid style beats the media-query override and silently defeats stacking —
so reach for a class:

- `.av3-cols-2` / `.av3-cols-3` / `.av3-cols-4` — equal-column grids that reflow
  (3/4-up → 2-up at ≤720 → 1-up at ≤560). Set `gap` inline at the call site.
- `.av3-formrow` (3-up) / `.av3-formrow-4` (4-up) — dialog form scaffolds that
  stack at ≤720. Don't override their `grid-template-columns` inline.
- `.av3-formgrid` — 2-up dialog field grid that **bottom-aligns** (`align-items:
  end`) so a label-above-input field lines up with a single-row toggle; collapses
  to 1-up at ≤560.
- `.av3-ahq-split` (+ `.av3-ahq-aside`) — Agent HQ's master/detail shell (§24): a
  `268px + 1fr` grid that stacks at ≤860 and drops the agent list's desktop
  `position: sticky` once stacked. Used by the Agents console and the Inbox.
- `.av3-ahq-rail4` — Agent HQ's 4-up per-agent stat rail (runs / cost / last-run /
  success); 2-up at ≤680 (§24).
- `.av3-ahq-pair` — a 2-up field-row grid (gap 12) for the agent editor + the
  Assign-work form; 1-up at ≤560 (§24).
- `.av3-togglerow` (+ `.av3-togglerow-label`) — a label-left / `Switch`-right
  bordered row, height-matched to inputs/selects. Use this for a labelled boolean
  inside a form **instead of** stacking an `.av3-field-label` above a bare
  `.av3-switch` (which wraps the uppercase label and collides at narrow widths).
  Greens its border via `:has()` when the switch is on.
- `.av3-clonebar` (+ `-head` / `-targets` / `-count`) — fan a per-site config out
  to any chosen subset of sites (e.g. the Menu editor's per-site modifiers).
  Source = the site in view; a head row holds the label + a **filter** input
  (shown past ~8 sites) + **All/None** + selected count + Clone, over a capped,
  scrollable well of `ChipToggle` targets — so 2 sites or 25 both fit.
- `.av3-scroll-x` — momentum horizontal-scroll wrapper for anything that must
  keep its width (wide tables already wrap in `.av3-table-wrap`).
- `.av3-dtabs` — the tabbed-dialog editor bar (Menu / Recipes) keeps its `flex:1`
  equal-width tabs when they fit, but **scrolls horizontally** (momentum, hidden
  scrollbar) once the labels + counts can't — so the last tab never clips against
  the pill's rounded edge in a near-full-bleed phone dialog.
- `.av3-cfgrow` / `.av3-cfgrow-head` — a **page-level** inline-grid editor/config
  row (`label + a few fixed controls`, e.g. Currency/Languages rate rows, the
  location hours editor, truck-route stops, the Calculator shift-plan table).
  Set its desktop `grid-template-columns` inline; at ≤560 it stacks one control
  per line and the `-head` column-label strip hides. Use this — **not**
  `.av3-locrow`/`.av3-reciperow`, which `min-width`-scroll and only work inside a
  dialog body (where `overflow-x` computes to `auto`); on a bare page that scroll
  would overflow the whole layout instead.

## Primitives (so far)

`v3/ui` — `Card`, `Button`, `Badge`, `Chip`, `Switch` (the **one** on/off
control — see below), `Kpi` (the dense metric tile
with inline sparkline + delta), `Sparkline` (dependency-free inline SVG),
`Skeleton` / `SkeletonKpiRail` / `SkeletonRows` / `SkeletonKanban` /
`SkeletonPage` (shimmer loading stand-ins — see Loading & empty states below),
`Table` (compact, sticky header, right-aligned numerics), `Dialog` (portaled
to `#admin-portal-root` per rule #4), and the **charts** (`Chart.tsx`:
`AreaChart` / `BarChart` / `Donut` / `ChartLegend`). The set grows as pages
migrate.

**Switch (`v3/ui/controls.tsx` → `.av3-switch`).** THE enable/disable control
for v3 — a real sliding toggle with `role="switch"` + `aria-checked`, not a
text button. One definition, restyle `.av3-switch` once and every toggle
follows (same contract as v2's `.v2-switch`). Props: `checked` + `onChange`
(persist on change per rule #7), optional `label` (text beside the slider —
clicking it also toggles), `disabled`, `size` (`"sm"` for dense rows like the
Calculator ingredient-stress cards), and `onClick` (runs before `onChange`,
e.g. `e.stopPropagation()` inside a table row). Reach for this for any
boolean; never hand-roll a `<button className="av3-toggle">{x ? "On" : "Off"}</button>`.
`.av3-toggle` survives only for the **non-boolean** "Set / Default" action in
Languages & Currency (it picks one option, it doesn't flip a boolean).

**Form controls (CSS-only — section 14 of `themes/admin-v3/index.css`).** The
plain controls are styled by class/element, no wrapper component needed:
- `.av3-input` / `.av3-select` / `.av3-btn` — the **one standard control height
  is 32px**, shared across input, select and button so they line up in any
  toolbar/form row. (Deliberate exceptions: the dense `.av3-btn-sm` (26px) and a
  handful of context-scoped 28/30px inputs — clonebar, locrow, reciperow — stay
  smaller on purpose.) On `:hover` the input/select hairline lifts to
  `--av3-muted`; on `:focus` the border goes brand + a 3px `--av3-brand-soft`
  ring. `.av3-select` is `appearance: none`, so it **paints its own chevron**
  (a muted inline-SVG background, theme-flipped via the `[data-admin-theme="light"]`
  override) — don't remove the chevron when restyling, an `appearance:none`
  select with no arrow reads as a bare box.
- **Checkboxes** — every `.av3-root input[type="checkbox"]` is fully restyled
  (`appearance: none`): a 16px box that fills `--av3-brand` with a white
  inline-SVG check when `:checked`. No class needed — style by element so a
  bare `<input type="checkbox">` looks right anywhere. Reserved for genuine
  multi-select; booleans use `Switch`. Radios keep their native shape with
  `accent-color: --av3-brand`.
- **Chips** — `.av3-chip` is the bare pill (transparent, no border) used inside
  an `.av3-chiprow` segmented track, where the track's own border frames the
  group. For **free-standing multi-select choice chips** that aren't in a track
  (e.g. the Comms "New daily routine" / announcement audience role + location
  pickers), add `.av3-chip-outline`: it gives each option a `--av3-line` hairline
  + `--av3-s1` surface so the choices read as distinct pills instead of bare
  text, and `.is-active` fills `--av3-s3` and rings in `--av3-brand`. Reach for
  the outline variant any time chips float directly on a card with no track.
- **Focus rings** — keyboard `:focus-visible` on every interactive control
  (`.av3-btn`, `.av3-icon-btn`, `.av3-iconbtn-sm`, `.av3-chip`, `.av3-fchip`,
  `.av3-switch`, checkboxes) is a `2px solid --av3-brand` outline with offset;
  text fields use the soft ring instead. Match this when adding a new control.

**Surfaces — elevation & motion (section 5/6/13 + `.av3-dcard` of the CSS).**
The container surfaces share one elevation language: a resting `--av3-sh-1`,
lifting to `--av3-sh-2` on hover.
- **KPI tile (`.av3-kpi`)** — carries a per-tile accent: the `Kpi` component
  sets `--av3-kpi-accent` from its `accentVar`, which paints a 3px leading
  rail (`::before`) and tints the label icon. Hover lifts the shadow and
  tints the border toward the accent. Pass `accentVar` to give a rail of
  KPIs distinct identities (e.g. the chart palette `--av3-c1…c8`).
- **Table (`.av3-table`)** — the sticky `thead` sits on a `--av3-line-strong`
  hairline **plus** a faint drop shadow so body rows read as scrolling under
  it; row hover (`--av3-s2`) is transitioned, not instant. Clickable rows get
  `cursor: pointer` from the `Table` component's `onRowClick`.
- **Dialog (`.av3-dialog`)** — opens with a fade+scale entry (`av3-dialog-in`)
  over a fading, blurred scrim (`av3-scrim-in`), both guarded by
  `prefers-reduced-motion`. Keep new overlays on these keyframes rather than
  inventing per-dialog animation.
- **Board card (`.av3-dcard`)** — same hover shadow-lift; selection ring uses
  `--av3-platinum`.
- **Kanban (`.av3-kcol` / `.av3-ocard`)** — the lane header (`.av3-kcol-head`)
  is sticky **and opaque** (`--av3-s2` + drop shadow) so cards scroll under it
  cleanly; order cards carry the resting→hover shadow-lift and a focus ring.

**Navigation & shell.** The active nav item (`.av3-nav-item.is-active`) is
distinguished from hover three ways: a faint `--av3-platinum`-tinted fill, a
`--av3-platinum` leading rail (`::before`), and a `--av3-platinum` icon +
600 weight — hover alone only changes the background, so active always reads
as "you are here". The topbar's scope `<select>` and every shell control share
the same `2px --av3-brand` `:focus-visible` ring as the form controls.

**Loading & empty states.**
- **Skeletons** (`v3/ui/Skeleton.tsx` → `.av3-skeleton`) — shimmer placeholders
  guarded by `prefers-reduced-motion`. Prefer over a bare `.av3-loading`
  spinner whenever the content has a known shape: `SkeletonKpiRail` mirrors a
  `.av3-kpi-rail`, `SkeletonRows` mirrors a list/table body, and bare
  `Skeleton` takes `width`/`height`/`radius` for anything else, and
  `SkeletonPage` is the whole-page stand-in (title strip + optional KPI rail +
  card of rows) for `if (loading) return …` branches. Mark the region
  `aria-busy`; the shimmer blocks are `aria-hidden`. **Rolled out across all v3
  pages** — every `.av3-loading` spinner was replaced (full-page returns →
  `SkeletonPage`, in-tree content → a card of `SkeletonRows`). Per-page tuning
  where the generic shape misled: Orders uses `SkeletonKanban` (view-aware) and
  Cash leads with a `SkeletonKpiRail` since its loaded view does.
- **Empty state (`.av3-empty`)** — a leading `<svg>` is lifted into a tinted
  round chip (`--av3-s2` + hairline); keep the `…-title` + `…-text` pair
  (text caps at ~300px for readability).

**Charts (`v3/ui/Chart.tsx`).** v3-native, dependency-free inline-SVG charts —
the same technique as `Sparkline`, scaled up. v3 **cannot** import the v2
Recharts wrappers (`components/admin/v2/charts`) under the isolation contract,
so these are the equivalents: `AreaChart` (time series, gradient fill +
last-point dot + caption row), `BarChart` (vertical bars; per-bar value labels
auto-hide above 12 bars), `Donut` (part-to-whole with optional centre value)
and `ChartLegend`. Every fill / stroke is a CSS custom property applied via
`style`, so the charts track the active `[data-admin-theme]` (dark / light)
with **no JS re-render**; each uses a fixed `viewBox` + `width="100%"` and
scales uniformly. Inputs are already-converted display units (e.g. zł, not
grosze). Reach for these instead of CSS bar-tracks whenever a surface needs to
show a *trend, distribution, or part-to-whole* (a ranking can stay a table /
`.av3-bar`).

**Chart interactivity (the `.av3-chart*` CSS).** `AreaChart` tracks the pointer
and shows a follow tooltip (`.av3-chart-tip`) with a dashed guide line + value
dot at the nearest point — pass `labels` (per-point x label) and `format`
(value formatter, also used for the new y-axis max/min labels) to make it
meaningful (see ReportsV3 for the reference call). `BarChart` dims sibling bars
on hover so the hovered one reads as focused (`.av3-barchart:hover .av3-bar`)
and every bar carries a native `<title>`; it also draws a baseline axis + y-max
label. `Donut` segments get the same hover-focus + a `<title>` of
`label: value (pct%)`. The `<title>` tooltips are the accessible, zero-JS
fallback; keep them when adding new series.

**Accessibility (CSS §"A11y").** Baked-in guarantees: (1) the text tokens clear
**WCAG AA (4.5:1)** for small text on `s1`/`s2`/`bg` in both themes — `--av3-subtle`
is tuned to that floor (don't darken-light / lighten-dark past it), and light
`--av3-ok`/`--av3-warn` are darkened to pass (the brighter chart greens/ambers
stay on the separate `--av3-c*` tokens). Status **badges** put the status colour
on its `-soft` tint; all pass except `bad`, whose badge text is mixed toward
`--av3-fg` (`.av3-badge-bad`) to clear AA on that tint — reuse that fg-mix if a
new badge fails on its soft bg. Segmented view toggles are `role="tablist"` +
`role="tab"` (so `aria-selected` is valid — never put `aria-selected` on a bare
`<button>`). (2) a
low-specificity `:where(a, button):focus-visible` safety net guarantees every
interactive element has a visible `--av3-brand` focus ring even if its own rule
is missing one (the tuned per-control rings still win); (3) a global
`prefers-reduced-motion` guard neutralises all `.av3-*` animation/transition
(shimmer, dialog/scrim entry, hover lifts, the spinner). New surfaces inherit
all three for free as long as they live under `.av3-root`.

Shared list-page chrome lives in `themes/admin-v3/index.css` §11–13: the
filter-chips-with-counts + view toggle (`.av3-filterchips` / `.av3-viewtoggle`;
add `.is-text` to the toggle when buttons carry an icon+label instead of a bare
icon — e.g. the Permission matrix "By role / By user"),
the Kanban board (`.av3-kanban` / `.av3-kcol` / `.av3-ocard`), and the dialog
(`.av3-dialog-*`).

## The Dashboard — "Operator Terminal"

The v3 home surface (`v3/DashboardV3.tsx`) is **not** an analytics report — it's
a live operations cockpit, owner-gated like the v2 `/admin` HQ. Layout (top →
bottom, then a 2-column split):

- **Revenue → daily-goal hero** — fills against a *real, operator-set* daily
  goal (`getOpsGoals`/`updateOpsGoals` in `store.ts` → `GET/PUT
  /api/admin/ops-goals`, owner-only; chain default + per-location override,
  edited inline). No goal set ⇒ the bar hides and it reads pace-vs-forecast.
  The "on pace for X by close" projection is real: labour-efficiency
  `forecastOrders` × live AOV (never a hardcoded number — rule #1).
- **Live tiles** — Cooking / Ready / Due-late from `/api/admin/kds/fleet`
  counts; Covers from real orders.
- **Levers that move the goal** — AOV, items/order, margin, labour ratio, each
  vs a stated benchmark, with day-over-day deltas where available.
- **What moves it most** — ranked from real signals (goal gap in zł, late
  tickets, hottest KDS bottleneck, labour ratio, attach) — never fabricated
  impact figures.
- **Kitchen pace + Locations** — per-location bottleneck/util + open/closed
  (`isLocationOpenNow`) + on-line/on-shift + revenue-today, all from the fleet
  endpoint.
- **Order flow** — orders/min last 60 min, bucketed from `/api/admin/orders`.
- **Live feed + "Needs you now"** — the right-hand spine, from
  `/api/admin/notifications` (+ derived late/low-stock/slot signals).

CSS for these lives in `themes/admin-v3/index.css` §10 (`.av3-goalbar`,
`.av3-tiles`, `.av3-levers`, `.av3-move`, `.av3-station`, `.av3-truck`,
`.av3-flow`, `.av3-feedcard`). Scope is the shell-level switcher; all data
refetches every 30s.

## Auth door — the login surface

The sign-in surface (`src/components/auth/LoginForm.tsx`, shared by the universal
team door **`/login`** and the owner-only **`/admin/login`**) plus the
shared-device **PIN terminal** (`src/app/terminal/page.tsx`) are the av3
surfaces that render **outside** `AdminShellV3`. Because every door does the same
job — authenticate, then route — they share the **`AuthShell`** component
(`src/components/auth/AuthShell.tsx`): it owns the canvas → column → bracket →
brand-lockup chrome, and each door passes its `eyebrow` (portal label) +
`footer` (cross-door links) and drops its controls in as `children` (the
email/password form, or the PIN keypad), so the chrome can never drift between
doors. All three route layouts
(`src/app/login/layout.tsx`, `src/app/admin/login/layout.tsx`,
`src/app/terminal/layout.tsx`) load `themes/admin-v3/index.css` and the three
`--font-admin-*` typefaces, then wrap their body in `#admin-portal-root.av3-root`
(with `flex flex-col flex-1`, matching the shell, so the canvas fills the
`flex-col` body) — so each door inherits the exact tokens, fonts and focus rings
as the rest of admin, with no `AdminShellV3` chrome. Unlike the shell they ship
**no `themeBootScriptV3`**: the doors render the av3 **dark canonical** theme
(intentionally dark + pre-auth), which also means no `<html>` attribute mutation
and therefore no hydration mismatch.

CSS lives in `themes/admin-v3/index.css` **§23** (`.av3-auth*`). The chosen
direction is **"spotlight minimal"** — clean + futuristic **inside the token
system**, no new hue, no raw hex, no card chrome:

- **`.av3-auth`** — the bare canvas, the column centred on **both axes**
  (`place-items: center`, `min-height: 100dvh`). Its restrained lighting is two
  token-built layers: one overhead **brand spotlight** (`::before`, a single
  `--av3-brand` radial from the top — the only colour on the canvas) and a slow
  **scanline** (`::after`, a 1px repeating line, radially **masked** to a soft
  central pool so it never reaches the edges).
- **`.av3-auth-col`** — the centred column (no card border/background), entering
  with `av3-auth-in` (fade-rise, `prefers-reduced-motion`-guarded).
- **`.av3-auth-frame`** — a thin **platinum corner bracket** (top-left +
  bottom-right `::before`/`::after`) that frames the column without boxing it in.
- **`.av3-auth-lockup`** — the header is the **brand lockup** (`.av3-auth-mark`
  brand chip with the platinum inset + brand glow, beside `.av3-auth-wordmark`
  Fraunces + `.av3-auth-eyebrow`, the portal label in mono-tracked caps), centred
  as one inline unit.
- **`.av3-auth-form`** — composes the existing `.av3-field` / `.av3-field-label`
  controls but restyles `.av3-input` to **underline-only** (transparent box, a
  `--av3-line-strong` bottom rule going brand on focus) and the label to mono
  micro-caps; `.av3-auth-otp` keeps mono + wide tracking for the 6-digit TOTP.
  The CTA is the shared `.av3-btn-primary` (full-width, lifted on a soft brand
  shadow); the passkey is a quiet `.av3-auth-passkey` text action beneath it (no
  "or" divider). Plus `.av3-auth-error` (the `bad`-soft alert) and
  `.av3-auth-foot` (the cross-door links, in `--av3-platinum`).

It does **not** introduce a new button/input primitive — it reuses the §4/§14
`.av3-field` / `.av3-input` / `.av3-btn-primary` controls (restyled in scope) and
adds only the auth-specific scaffold (canvas, column, bracket, lockup). The
behaviour (email + password, optional TOTP reveal on `mfaRequired`, the
passwordless passkey path, the owner-only portal gate) is unchanged — see
[`../sections/system.md`](../sections/system.md) → sign-in & credentials.

**PIN terminal (`/terminal`).** The shared-device keypad door is the keypad
sibling of the form: same `.av3-auth` canvas, `.av3-auth-col`, `.av3-auth-frame`
bracket and `.av3-auth-lockup` (eyebrow "Staff terminal"), with the cross-door
link in `.av3-auth-foot`. Below the lockup it swaps the form for three
keypad-only pieces, all token-built (no new hue, no card chrome): **`.av3-auth-locs`**
/ **`.av3-auth-loc`** (the per-device location segmented control — `.is-active`
fills brand), **`.av3-auth-dots`** / **`.av3-auth-dot`** (PIN-progress dots, one
per digit down to `PIN_MIN_LENGTH`, brand on `.is-on`) and **`.av3-auth-keypad`**
/ **`.av3-auth-key`** (a 3-col touch keypad of 56px targets; **`.av3-auth-key-del`**
reads quieter, **`.av3-auth-key-go`** is the brand confirm CTA echoing
`.av3-btn-primary`). While a PIN is in flight (`loading`) the location buttons
and keypad are `disabled` — each has `:disabled` styling (dimmed, no
hover/press affordance) so the lock reads visually. Behaviour (location
remembered in `localStorage`, PIN length gate, `POST /api/terminal/login` →
role-routed landing) is unchanged.

## Role portal home — Manager & Franchisee

The standalone role dashboards (`src/app/manager/page.tsx`,
`src/app/franchisee/page.tsx`) are the manager's / franchisee's home — scoped
overviews that live **outside** `AdminShellV3` (the owner's HQ is `/admin`).
They render in **av3** so the home reads as the same surface as the sign-in door
the user just came through: their layouts load `themes/admin-v3/index.css` + the
three `--font-admin-*` typefaces on `#admin-portal-root.av3-root` (dark
canonical, no boot script), exactly like the doors. They previously rendered the
base/v2 `.admin-bg` + `.glass-*` theme — that drift is gone.

CSS lives in `themes/admin-v3/index.css` **§23** (`.av3-portal*`), reusing the
auth canvas's signature lighting and the sign-in lockup:

- **`.av3-portal`** — the canvas: same overhead **brand spotlight** (`::before`)
  and masked **scanline** (`::after`) as `.av3-auth`, but **top-aligned** and
  scrollable (it's an overview, not a centred form).
- **`.av3-portal-col`** — the max-1000px content column, entering with the same
  `av3-auth-in` fade-rise.
- **`.av3-portal-head`** — the header reuses the door's **`.av3-auth-lockup`**
  (mark + Ottaviano wordmark + role `eyebrow`) beside `.av3-portal-greet`
  (Fraunces welcome) + `.av3-portal-sub`, with the `.av3-btn-ghost` sign-out.
- **Body** composes the standard primitives — `.av3-kpi-rail` / `.av3-kpi` for
  the headline figures (per-tile `--av3-kpi-accent`), `.av3-card` (+ `.av3-card-head`)
  for the sections, `.av3-cols-2` for the splits — plus three portal helpers:
  **`.av3-portal-jump`** / **`.av3-portal-jcard`** (the permission-filtered
  "Jump to" link grid, manager only), **`.av3-portal-chip`** (on-shift people)
  and **`.av3-portal-stat-*`** (label/value/sub stat blocks). No new button or
  input primitive — it reuses §4/§14 controls in scope.

## What v3 is not

- **Not a re-skin of v2.** No `.v2-*` / `.glass-*` class is reused; v3 cannot
  import from `components/admin/v2/`.
- **Not Core.** POS / KDS / Guest stay on the Core theme — v3 never touches
  `/core/*`.
- **Not looser.** If a v3 surface ends up with more whitespace than its v2
  predecessor, it has missed the brief. Density is the point.

## Migration status

- [x] Foundation — tokens, theme mirror, isolation contract
- [x] Shell — sidebar (collapsible rail) + topbar + scope switcher
- [x] Dashboard — the **Operator Terminal** (live cockpit), owner-gated, wired
  to analytics / insights / KDS-fleet / labour / orders / notifications +
  the configurable daily-goal setting (`/api/admin/ops-goals`). **Executive
  overview restored (matches `public/mockups/admin-v3/dashboard.html`):** below
  the cockpit, a period-scoped (Today/7d/30d/90d) analytics block — a 7-KPI rail
  (revenue, orders, avg order, profit margin, gross profit, cancellations,
  labour ratio, each with vs-prior-period delta + sparkline), a **revenue-trend**
  `AreaChart`, a **top-sellers** bar list (`.av3-bars`) and the **Location
  network** comparison `Table` (revenue/orders/AOV/margin/cancel per site) — all
  from `/api/admin/analytics` (`dailyStats`/`topItems`) + `/api/admin/insights`
  (`locationComparison`) + `/api/admin/labor-ratio`, refetched on period change.
- [x] Welcome / **Morning Brief** (`/admin/welcome`) — the owner's **post-login
  landing** (`landingPathForRole("owner")`) and a full-bleed CEO catch-up
  surface that lives under `/admin` but renders **outside the AdminShell** (no
  sidebar, no nav — like the admin login door). Its own route group:
  `src/app/admin/welcome/{layout,page}.tsx`. Built on the **shared av3 design
  system** — the layout pulls the av3 stylesheet + the three admin typefaces
  onto `#admin-portal-root.av3-root`, and `welcome.css` (page-specific layout
  only — the stage, hero canvas, feed) references **`--av3-*` tokens
  throughout**, no parallel palette. Reuses the shared **`Monogram`** avatar,
  the shared **`formatPricePLN` / `formatPricePLNCompact`** formatters, and the
  five-section **`InfoButton`** (Rule #12) on the pacing, constraint,
  repeat-rate and Pulse metrics. The header's truck count + open-now status come
  from **`getActiveLocations` + `isLocationOpenNow`** (server-passed, never
  hardcoded). Live code: `src/admin-v3/WelcomeBrief.tsx` (design direction #5 from
  `tests/sketches/welcome-brief/`). Built as a **command brief** (the Cook/Musk
  lens), not a recap: it leads with **yesterday's close + delta** and **monthly
  goal-pacing** (MTD vs target with a run-rate **projection** + ahead/behind
  bar), then **decisions awaiting you** (the AI boardroom approval queue, owners
  named from the agents roster), **what needs you** (unread notifications), **the
  constraint** (your busiest hour / throughput ceiling), **leading indicators**
  (30-day repeat rate, new customers/mo, the 14-day bookings pipeline, and the
  **Pulse/NPS** score + 30-day trend), an **AI agents** module (LLM spend as a
  closed-day view — **yesterday**, the **trailing 30 days**, and the **day-over-day
  % change** — the "are the agents working / what do they cost" check, doubling as
  the Simulation-mode dry-run receipt; no partial-current-day figure on a morning
  brief), an **anomaly to copy** (the location whose avg ticket most beats the
  chain), the **per-location** split, **today's goal/forecast + profit-per-order**,
  and a demoted **yesterday recap**. The analytics half is computed **server-side
  in one pass** at `/api/admin/welcome/route.ts` (`getSummary` / `getInsights` /
  `getOpsGoals` / `computeLaborEfficiencyDaily` / `computeHourlyThroughput` /
  `computeCohortSnapshot` / `getTruckEvents` + `pulseBreakdown` over
  `getSurveyResponses` + `getAiSpendBriefGrosze`) so it can't drift from
  Dashboard / Reports / Calculator / Surveys / Agent HQ; decisions + alerts stay
  on `…/ai/boardroom/{approvals,agents}` + `…/notifications`. Every module is live data and **degrades to nothing** when
  its source 403s/empties — never a placeholder (pacing omits with no revenue
  goal set; Pulse omits below 3 recent answers). The constraint is the real
  busiest-hour load signal, **not** a fabricated capacity %; margin shows as
  profit-per-order, **not** a per-ingredient decomposition. Re-roots its links
  with `withAdminV3Base`. Nav: still listed first in Overview (clicking it leaves
  the shell). A one-tap **Enter the dashboard** returns to the `/admin` HQ.
- [x] Ops Agent (`/admin/ai/agent`) — the v3 home for the v2 `OpsAgentChat`
  (`AgentV3`). Claude with role-gated read+write tools over
  `/api/admin/ai-agent/*` (conversations + `…/turn`): single-column chat,
  **human-in-the-loop tool approval** (mutating tools render a pending card with
  a Confirm & execute button; re-sends the turn with the approved tool id),
  executed/error tool cards with expandable input/output, recent-conversation
  list, session-cost readout, and the API-key-not-configured empty state. The
  page is topped by `AiModelControl` (`AiModelControl.tsx`) — the global
  Claude/Gemini model picker (`/api/admin/ai/model`, persisted to ai-model.json),
  a `Card` with a provider-grouped `.av3-select` that saves on change. CSS
  §17 (`.av3-chat-*`, `.av3-tool-*`). Nav: Intelligence section.
- [x] Agent HQ (`/admin/agent-hq`) — the Boardroom rebuilt as an editable
  agent-operations console. Live code: `src/admin-v3/AgentHQ.tsx` (the eight-section
  shell), `src/admin-v3/agent-hq/shared.tsx` (shared `Monogram`,
  `StatusDot`, `KpiTile`/`StatTile` built on the real `.av3-kpi`, and the
  `ChatPanel`) and `src/admin-v3/agent-hq/AgentEditForm.tsx` (the full inline editor
  — every field editable, Configure / Live-prompt / Timeline tabs + save/reset),
  with `boardroom-explainers.ts` for the Rule #12 KPI explainers. (`/admin/boardroom`
  redirects here; the old `BoardroomV3.tsx` + the standalone per-agent page were
  deleted — editing + metrics live in the Agents/Scorecards sections, removing the
  redundant route.) **Everything in a
  section loads in one pass** — Command center pulls a single aggregate
  (`/api/admin/ai/boardroom/command`) so nothing pops in or shifts. **Sections**
  (`.av3-filterchips`): **Command center** — a fleet `.av3-kpi` rail (active
  agents · runs today · success rate 7d · cost 7d · scheduled), the
  Sales &amp; growth + Cost &amp; quality KPI rails
  (`KpiTile` with `StatusDot` + five-section `InfoButton`), then a 2-col card grid:
  org/reporting chart (click an agent → Agents console), a 7-day activity bar chart,
  recent activity, upcoming work, daily digest and month-to-date cost; **Agents**
  — a master-detail **console**: left the agent list, right a working panel with
  three sub-tabs — Overview / Goals / Logs. Overview = run/cost/last-run/success
  `StatTile`s + owned KPIs + recent activity; **Goals** = the full inline
  `AgentEditForm` (where everything is set — prompts, tools, schedule, spend, KPIs;
  it carries its own Configure / Live-prompt / Timeline tabs and save/reset);
  Logs = the agent's events (the `TimelineList`). Per-agent KPI target-vs-actual
  logging and the per-agent chat live in the standalone **Scorecards** and
  **Inbox** sections respectively. **Scorecards** — a per-agent
  scorecard card (status + model + authority badge, a 7d success-rate bar,
  runs 7d / cost 7d / last-run `StatTile`s, and the agent's KPIs as
  **target-vs-actual** where operators log an actual value per KPI), over
  `/api/admin/ai/boardroom/scorecards` (GET cards + POST a logged actual);
  **Work** — operator-assigned board: an "Assign work" form,
  agent drop-targets (HTML5 drag-to-assign), and Unassigned / Queued / Recent
  columns with per-item Run + delete (`…/work`, `…/work/[id]`, `…/work/[id]/run`);
  **Approvals** — the human-in-the-loop queue (Action / Mark done / Dismiss,
  `…/approvals`); **Inbox** — escalations panel + agent list + `ChatPanel`;
  **Reports** — meeting transcripts + decisions with CSV + print-to-PDF export;
  **Settings** — fleet-wide controls (not per-agent): the global AI model
  (`AiModelControl`, moved here from Command center), the daily AI budget (a
  persisted override of `AI_DAILY_BUDGET_GROSZE` via `getEffectiveDailyBudgetGrosze`,
  with a today's-spend bar) and an auto-daily-briefing `Switch` + time the
  briefing cron honours — over `…/settings` (GET/PATCH).
  **Editable
  agents:** nine seed agents (four C-suite + five specialists) defined in
  `src/lib/ai/boardroom/personas.ts`; each is fully editable via `AgentEditForm`
  (name, role, status, reporting line, model, effort, authority, runtime memory,
  mandate, responsibilities, KPIs, guardrails, escalation threshold, tone,
  collaborators, tool allowlist, spend caps, schedule). The editor's **Live
  system prompt** tab renders `buildLiveSystemPrompt(config)` from
  `src/lib/ai/boardroom/agent-config.ts` — exactly what the agent runs on — and a
  **Timeline** tab shows the agent's run/edit history. Config = seed defaults ⊕
  operator override (`agent-configs.json`); edits drive the runtime (the agent
  loop + meetings + scheduled runs read the resolved config: generated prompt,
  tools ∩ role ∩ authority, model, effort, spend caps, status). The editor's tool
  picker lists the full role-gated registry (`…/tools`) with `·writes` badges on
  mutating tools; **Reset to defaults** (DELETE on the agent) drops the override;
  a PATCH writes a before/after audit row. Every agent carries an
  `escalate_to_admin` tool (non-mutating, observer-safe) that lands an item in the
  **Inbox** escalations panel + the agent timeline. **Approvals** transitions
  decision status (Action / Mark done / Dismiss) via `POST …/approvals` so an
  actioned/dismissed item leaves the queue. **Command center** shows an org chart
  (from `reportsTo`) + today's spend vs cap per agent. API: `…/agents` (GET
  roster), `…/agents/[id]` (GET + PATCH + DELETE), `…/agents/[id]/timeline`,
  `…/tools`, `…/overview` (KPIs + live status + spend), `…/approvals` (GET +
  POST), `…/timeline`, `…/meeting` (run daily/weekly). Two crons:
  `/api/admin/cron/boardroom-briefing` (whole board) and
  `/api/admin/cron/agent-runs?cadence=daily|weekly` (per-agent self-reviews,
  `src/lib/ai/boardroom/scheduled.ts`). **Chat** reuses the Ops Agent
  endpoints (`/api/admin/ai-agent/*`) with a `personaId` body field; each thread
  persists per agent (`…/conversations/latest?persona=`, `HistoryView` flattening
  stored Anthropic blocks). Same human-in-the-loop tool-approval card flow + CSS
  (§17 `.av3-chat-*`, `.av3-tool-*`). Degrades to live-KPIs-only when
  `ANTHROPIC_API_KEY` is unset — the read-only notice sits at the very bottom of
  the page (below the section), not above the fold. **Responsive:** Agent HQ and
  every sub-section reflow on a phone via the §24 `.av3-ahq-*` helpers — the
  Agents/Inbox master-detail (`.av3-ahq-split` + `.av3-ahq-aside`) stacks and
  unpins at ≤860, the per-agent stat rail (`.av3-ahq-rail4`) goes 2-up at ≤680,
  the editor + Assign-work field rows (`.av3-ahq-pair`) go 1-up at ≤560, and the
  card grids use `minmax(min(Npx, 100%), 1fr)` so they never force horizontal
  scroll. Nav: Intelligence section (icon `Bot`).
- [x] Alerts (`/admin/alerts`) — the v3 home for the v2 `MobileAlerts` action
  queue (`AlertsV3`). Full-screen inbox over `/api/admin/notifications`: filter
  chips with live counts (Unread/All/Orders/Slots/Stock/Money), Today/Yesterday/
  Earlier recency buckets, per-type tone+icon, mark-read / mark-all-read (`PATCH`),
  and tap-to-jump to the relevant v3 surface. CSS in `themes/admin-v3/index.css`
  §14 (`.av3-alert-*`). Nav: Overview section.
- [x] Tasks, daily routines & announcements (`CommsV3`) — the internal comms
  board, split into **two separate Overview nav entries / routes** (no more
  `ChipRow` tab): **Tasks** (`/admin/comms/tasks`) — assign a to-do to a person
  or a whole role+location, fans out to one row per assignee, each with its own
  done-state; this view ALSO hosts **Daily routines** (a "New daily routine"
  card + list): the recurring "regular to-do list" (orders, delivery, clean
  walls, coffee-machine maintenance), targeted by role + location like a task,
  pausable via an **Active** `Switch`, over `/api/admin/routines` (GET/POST
  upsert/DELETE, gated `comms`) — and **Announcements**
  (`/admin/comms/announcements`) — post to everyone / roles / locations / named
  people, with a **Title (subject) + textarea body**, pinnable, edit-in-place +
  delete (the POST upserts on `id`). One component takes a
  `view: "tasks" | "announcements"` prop and renders just that surface; the bare
  `/admin/comms` index redirects to Tasks. Built from the standard primitives
  (`Card`/`Button`/`Badge`/`Switch` + `.av3-input`/`.av3-select`/`.av3-field`),
  no new CSS. Gated by `comms.view` / `comms.manage` (owner-default, grantable).
  The receiving half is **`PortalInbox`** (`src/components/portal/PortalInbox.tsx`)
  on the Manager/Franchisee portals: announcements **lead the portal as a
  Gmail-style notification inbox** (sender avatar + subject + snippet + a
  **relative age** — "3h" / "Yesterday" / weekday / date, via `fmtRelative` in
  `src/lib/relative-time.ts`; unread bold with a brand dot, pinned flagged; tap a
  row to open the full message — which swaps the relative age for the precise
  absolute date+time at the foot of the body — and mark it read) above a
  **two-column row** (`.av3-todo-grid` — side by side on a wide portal, stacked
  ≤720px) holding the **"Daily routine"** checklist and the personal
  **"Your to-do list"**, over the
  unmapped `/api/admin/my-tasks` + `/api/admin/my-routines` +
  `/api/admin/my-announcements` (any authed user). **Daily routine** is a
  checkbox list that **resets every day** — it's *derived* (team routines that
  match you by role+location + your personal routines) and annotated with
  today's tick from `routine-completions.json`, so a new day (Europe/Warsaw)
  starts fresh with **no cron**; ticking is per-person (`PUT /api/admin/my-routines
  {templateId, done}`), the box shows a `Team`/`Yours` tag, and a **quick-add**
  adds a personal recurring item (scope `personal`, owned by you — `POST`), with
  **remove** on your own routines only (`DELETE`). The **to-do list** isn't
  read-only: a **quick-add box** (title + priority + optional due date, Enter or
  **Add**) lets any teammate add a one-off item to their **own** list — `POST
  /api/admin/my-tasks` always stamps the session user as both assignee and
  creator, so it can never push a task onto someone else (that stays the gated
  board) — and carries the **full lifecycle** across four tabs
  (**To-do / Done / Archived / Deleted**, counts in the chips): per-row
  **Done · Archive · Delete · Reopen · Restore** (`PUT /api/admin/my-tasks` with
  `status open|done|archived|deleted` — a single axis since one task = one
  owner). A self-added item (`createdBy === assigneeId`) reads "added by you" and
  can be **purged for good** from the Deleted tab (`DELETE /api/admin/my-tasks`,
  restricted to items you created — manager-assigned tasks keep the record). The
  announcements inbox carries three **mailbox tabs — Inbox / Archived / Deleted** —
  with per-row actions **Mark read · Archive · Delete** (Archived/Deleted offer
  **Restore**); the Inbox shows only the most-recent 3 *unread* rows with a
  **"Load more"** beneath (read-but-kept rows follow). Mailbox state is
  per-recipient (`archivedBy` / `deletedBy` on the announcement, `deleted` wins
  over `archived`) so one person archiving doesn't hide it for everyone; each
  action `PUT`s `{id, action}` to `/api/admin/my-announcements`, which moves the
  state **and writes a `notification.{read,archive,delete,restore}` row to the
  central Audit log** (so an owner can review the open/archive/delete history —
  the logging target is the Audit log, not a portal-local feed). The unread +
  open-to-do + pending-routine count also surfaces in **`CommsBell`**
  (`src/components/portal/CommsBell.tsx`) — an **inbox**-icon button (count =
  unread Inbox announcements + open to-dos + routines not yet ticked today)
  rendered in the shell `TopbarV3` and
  on both portal headers; its glance dropdown is portaled to `document.body`
  (dodging stacking traps) and links to the portal inbox. The inbox + bell are
  built from tokens + inline styles on the existing `.av3-portal-section` /
  `.av3-card` / `.av3-icon-btn` / `.av3-bell-badge` scaffold; the routine + to-do
  **rows** add one dedicated class family — **`.av3-todo-*`** (§ after the
  `.av3-portal-*` block in `index.css`): `.av3-todo-row` (flush row that lifts a
  faint `--av3-s2` surface on hover/focus and **fades its actions in** —
  `.av3-todo-acts` / `.av3-todo-act[.is-danger]` — always-visible under
  `@media (hover:none)`), `.av3-todo-check` (the square tick whose checkmark
  scales in on `aria-checked`), `.av3-todo-progress > i` (the daily-completion
  bar in the Daily-routine header), `.av3-todo-scope.is-team|.is-mine` (the
  Team/Yours chips), `.av3-todo-title.is-done` / `.av3-todo-meta` /
  `.av3-todo-dot`, `.av3-todo-alldone` (the "all done for today" flourish),
  `.av3-todo-tabcount` (the lifecycle-tab count pill), `.av3-todo-grid` (the
  two-up routine/to-do row), `.av3-todo-head` (floors both columns' headers to
  one height so the cards align) and `.av3-todo-add` / `.av3-todo-add-row` (the
  quick-add box — a full-width field above a controls row with **Add** pushed to
  the right edge, all controls the shared 32px height).
  While the feeds resolve `PortalInbox` renders a `PortalInboxSkeleton`
  (three-section scaffold, shimmer rows via the shared `Skeleton` primitive)
  instead of `null`, so the space is reserved and the portal doesn't jump when
  the data lands. Types + recipient rules (`isAnnouncementForUser`,
  `isRoutineForUser`) + mailbox-state helper
  (`announcementStateFor`) in `src/lib/comms.ts`; routine persistence
  (`getRoutineTemplates`/`saveRoutineTemplate`/`set`/`clearRoutineDone`,
  `warsawToday`) in `src/lib/store.ts`. **Distinct from Alerts:**
  `CommsBell` (inbox icon, personal comms) sits *beside* the operational alerts
  **bell** in the topbar but never reads it — announcements are human-authored
  broadcasts; the bell + `/admin/alerts` are the *automated* operational
  `Notification` stream (orders/stock/disputes). Separate stores, separate APIs,
  no cross-writes — never wire one into the other. Nav: Overview section (two
  entries).
- [x] Orders (`/admin/orders`) — live Kanban + table + detail dialog over
  the real SSE order stream (`useAdminOrdersStream`); status advances via
  `PUT /api/admin/orders`, staff+. **Refund flow restored to v2 parity:** the
  detail dialog opens a `RefundDialogV3` (full/partial via `ChipRow`, reason
  code, notes, Stripe-reversal vs manager-comp note) wired to
  `POST /api/admin/orders/:id/refund` with a live `evaluateRefundGuard` preview
  (per-refund cap + daily comp budget → owner-approval gate); a refunded order
  shows the amount + reason in the detail.
- [x] Inventory (`/admin/inventory`) — stock table (value / low-out / 7d
  waste KPIs, status chips) + movements view + edit dialog (par/reorder/on-hand
  via `PUT /api/admin/stock`, log receive/waste/adjust via
  `POST /api/admin/stock-movements`). Aggregates across trucks when scope = all
- [x] Menu (`/admin/menu`) — chain-wide product board, **one row per dish**
  (deduped by `getBaseSlug`, rule #10): price range + "varies" badge when sites
  diverge, margin, availability, plus recipe/custom/hidden/edited/delivery/mods
  flags. **Full v2 parity (PR #138 follow-up):** multi-select with a sticky bulk
  toolbar (mark available / 86 / bulk-edit / clone-to-site / reset overrides /
  delete — via `POST /api/admin/menu/bulk`), a **Show hidden** toggle exposing
  soft-deleted seed rows, and **Add item** which creates a chain-wide custom SKU
  on every site (`POST /api/admin/menu/custom`, id = `slug.slice(0,3)-base`). The
  edit dialog covers chain-wide product metadata (name/description/category/tags/
  menu-role), service (delivery-only, packaging cost), a **modifier-group editor**
  (groups + options with price/cost deltas + KDS flag), regulatory disclosures
  (halal / Nutri-Grade / contains-pork / contains-alcohol / allergens) and
  per-site price/cost/availability/SKU — all written via `PUT /api/admin/menu`
  (`items` map), with per-dish **Reset** + **Delete** in the footer. Recipe-
  attached dishes lock the cost field (derives from the recipe, rule #10).
  **Visual upgrade:** a **KPI rail** (dishes / avg margin / low-margin / 86’d /
  no-recipe), a **search** box + **Board⇄Table** view toggle, and a default
  **Board view** — category-grouped dish cards (status dot, badges, price range,
  margin badge) with the same multi-select + edit-on-click as the table. CSS §18
  (`.av3-board`, `.av3-dcard`). **Editor upgrade:** the edit dialog is now
  **tabbed** (Product / Pricing / Modifiers / Disclosures, with counts on the
  last two) under a live **price·margin recap**, instead of one long scroll;
  money inputs carry a `zł` affix. CSS §19 (`.av3-dtabs`, `.av3-recap`, `.av3-affix`).
  **Product** shows the read-only **slug** (chain key — recipes/orders reference
  it, so it's surfaced not renamed here). **Modifiers are per-site:** the tab
  picks the site being edited — a `.av3-viewtoggle.is-text` toggle for a handful
  of sites, a `<select>` once past ~8 (so the picker never overflows). A **clone
  bar** (`.av3-clonebar`) fans the viewed site's modifiers out to any chosen
  subset of other sites — filter + All/None + a capped scrollable target well, so
  it works whether there are 2 sites or 25. Not just "all", so Katowice→Gdańsk and
  Warszawa→Kraków are independent one-click clones. Each variant persists its own
  `modifierGroups`. Chain-wide product facts (name/description/dietary/disclosures)
  still write to every site (rule #10). Selects + booleans in Pricing/Disclosures
  use `.av3-formgrid` + `.av3-togglerow` so they align instead of wrapping.
  **Live preview (Operations interactivity pass):** the editor is now a
  **two-column workbench** (`.av3-bodysplit`, 940px) — the tabbed form on the
  left, a sticky **live customer menu-card preview** on the right that re-renders
  as you type: category eyebrow + menu-role/delivery badges, name + price range,
  description, dietary-tag + Nutri-Grade chips, an allergen "Contains:" line,
  halal/pork/alcohol notes, and an availability state (Available / 86'd at some
  sites / Currently 86'd from the per-site switches). It's the same dish the
  customer sees, updating from the same edit state — so you frame the card while
  you edit it.
- [x] Recipes (`/admin/recipes`) — chain-wide formula board + ingredient
  catalog, **one recipe per dish** (keyed by base slug, rule #10). **Full v2
  parity (PR #138 follow-up):** two tabs — **Recipes** (board with food cost /
  cost-% / kcal) and **Ingredients** (the catalog). The recipe editor now shows
  per-portion KPIs (cost / food-cost% / batch cost / kcal), a cost-breakdown bar
  with legend, live per-portion macros (protein/carbs/sugar/fiber/fat),
  missing-kcal + no-distributor flags per line, prep time + notes, and saves the
  formula chain-wide via `POST /api/admin/recipes` (`DELETE` to remove). **Bug
  fixed:** `wasteFactor` is now stored as the multiplier the store expects
  (`1 + waste%`) instead of a fraction — the old code under-costed every line.
  The **Ingredients** tab is a searchable catalog with add/edit/delete
  (`/api/admin/ingredients`) and a per-ingredient **distributor offerings**
  manager (`/api/admin/ingredient-products`): add/edit/delete offerings with
  supplier, SKU, display name, cost + per-unit macros, and a **make-active**
  star (`PATCH`) that points `activeProductId` at the offering driving recipe
  cost + nutrition. Suppliers are read for the picker (managed on Suppliers).
  Per-item dietary disclosures live on the **Menu** editor (rule #10).
  **Visual upgrade:** a **KPI rail** (costed coverage / avg food-cost % / over-
  target / uncosted / ingredient count), a **search** box + **Board⇄Table**
  toggle, and a default **Board view** — category-grouped recipe cards with a
  food-cost health bar + cost/portion + kcal + ingredient count; uncosted dishes
  render a clear “+ Cost this dish” card. CSS §18 (`.av3-board`, `.av3-fcbar`).
  **Editor upgrade:** the recipe editor now keeps a **sticky per-portion recap**
  (cost / food-cost % / batch / kcal) above a **tabbed** body (Ingredients /
  Nutrition / Notes — Nutrition & Notes flag with a dot when relevant); ingredient
  rows gained unit + `%` affixes. CSS §19 (`.av3-dtabs`, `.av3-recap`, `.av3-affix`).
  **Live economics panel (Operations interactivity pass):** the editor is now a
  **two-column workbench** (`.av3-bodysplit`, 920px) — the tabbed builder on the
  left, a sticky **live economics panel** on the right: a big **food-cost %** with
  a **health gauge** (green ≤30 → amber ≤38 → red band, a marker tracking the live
  figure), a **margin readout** (menu price · food cost · gross profit · GP
  margin, computed against the dish's avg price), and an always-visible
  **per-portion macros** grid (kcal + protein/carbs/sugar/fiber/fat) — so the
  cost/health/nutrition consequences of every ingredient edit are visible without
  switching tabs.
- [x] HACCP log (`/admin/haccp`) — per-location temperature checks with
  live in/out-of-range verdict (`@/lib/haccp`); record + today's log table.
  **Workbench pass (Operations interactivity):** a **KPI rail** (readings ·
  compliance % · out-of-range) with five-section ⓘ explainers on compliance +
  out-of-range; a **live safe-range gauge** under the record form that shades
  the safe band and marks the entered temp as you type (red when it breaches);
  **search + All/Out-of-range filter chips**; a **Board⇄Table toggle** with a
  default board of reading cards (big temp, per-sensor gauge, OK/breach); and a
  **row → detail popup** (large temp, gauge, safe range, recorded time, +
  corrective-action reminder when flagged).
- [x] Waste log (`/admin/waste`) — reason-coded write-offs; record + today's
  entries + write-off cost KPI (`POST /api/admin/waste`).
  **Workbench pass (Operations interactivity):** a **KPI rail** (entries ·
  write-off today · top reason) with a five-section ⓘ on write-off; a **live
  entry preview** under the form (item · qty · reason · cost → projected new
  daily write-off); **search + reason filter chips**; a **Board⇄Table toggle**
  with a default board of waste cards (cost, qty, share-of-today); and a
  **row → detail popup** (qty/reason/cost/share/time + an "uncosted = invisible"
  nudge when no cost was recorded).
- [x] Shift handover (`/admin/handover`) — end-of-shift sign-off (shift, cash
  counted → variance, temp/waste/equipment checks, managers, comment) + the
  week's log (`POST /api/admin/handover`). A **KPI rail** (this-week count /
  issues flagged / net cash variance / last sign-off) sits above the form.
  **Workbench pass (Operations interactivity):** five-section ⓘ explainers on
  Issues flagged + Net cash variance; a **live sign-off summary** under the form
  (shift · managers · the three check pills · cash, warn-tinted when a check is
  not clear); **search + shift filter chips**; a **Board⇄Table toggle** with a
  default board of handover cards (manager, shift, check pills, variance); and a
  **row → detail popup** (both managers, cash counted + variance, all three
  checks, the manager comment).
- [x] Suppliers (`/admin/suppliers`) — chain-wide distributor directory with
  add/edit/delete dialog (`POST/PUT/DELETE /api/admin/suppliers`). **Visual
  upgrade:** a **KPI rail** (suppliers / avg lead / fastest lead / with-contact)
  + a **search** box; the table splits email/phone columns and colour-codes the
  lead-time badge.
- [x] Purchase orders (`/admin/purchase-orders`) — per-location restock
  orders with status chips, a create dialog (supplier + ingredient lines +
  expected date, `POST`), and a detail dialog driving the draft→sent→received
  flow (`PUT`, receiving auto-credits stock) + cancel/delete. **Visual upgrade:**
  a **KPI rail** (open POs / on-order value / awaiting delivery / received).
- [x] People — Staff (`/admin/staff`): directory + clock in/out
  (`/api/admin/time-punches`) + add/edit/delete (`/api/admin/staff`), on-shift +
  active KPIs, **search** (name / role / email). Schedule (`/admin/schedule`): this week's shifts with
  add/edit/delete (`/api/admin/shifts`). **Visual upgrade:** a **KPI rail**
  (shifts / hours / labour cost from `hourlyRateGrosze` / on-rota / uncovered
  days), a **Week-grid⇄List** view toggle, and a default **week grid** — 7 day
  columns (horizontal-scroll on narrow, today highlighted) of role-coloured shift
  cards (time, name, role + status badge, hover-delete), per-column add. The shift
  dialog gained the missing **Notes** field. CSS §20 (`.av3-week`, `.av3-shiftcard`).
- [x] Customers (`/admin/customers`) — phone-based directory (search,
  repeat/CLV KPIs, per-customer detail) derived from real orders. **Flag #6
  restored:** a **"Send today"** outreach card (today's birthdays + first-order
  anniversaries from `/api/admin/campaigns/triggers`, tap-to-call `tel:` links,
  name opens the detail) above the fold (rule #5), plus the **loyalty-points**
  column + detail field (`lifetimePoints` = earned + manual, from the customers
  endpoint). **Detail dialog brought to v2 `AdminCustomerDetail` parity:** a
  760px dialog over `/api/admin/customers/[phone]` with points breakdown
  (earned/manual/redeemed/spendable), an inline **profile editor** (DOB/email →
  `PUT /api/admin/members/profile`), **order history**, **point-adjustment
  history**, **redemption history**, **notes** (add/delete via
  `/api/admin/customer-notes`) and **GDPR controls** — Art. 15 export
  (`/api/admin/gdpr/export`) + Art. 17 erasure (`POST /api/admin/gdpr/delete`,
  confirm-gated). CSS §16 (`.av3-detail-*`).
- [x] Feedback (`/admin/feedback`) — guest-review board with status chips +
  avg-rating KPIs, status flow new→reviewed→responded (`PUT /api/admin/feedback`)
  and AI sentiment (`POST /api/admin/feedback/analyze`). **Charts restored (flag
  #4):** a rating-distribution `BarChart` + a sentiment `Donut` + legend, both
  derived from the loaded reviews.
- [x] Corporate (`/admin/corporate`) — B2B wallet-backed accounts: members /
  pool / head-bonus KPIs + edit dialog (billing, bonus %, min staff, home site,
  auto-preorder) via `PUT /api/admin/corporate`
- [x] Pulse surveys (`/admin/surveys`) — NPS-style pulse + avg-rating KPIs
  (shared `@/lib/surveys`), survey catalogue with active toggles
  (`PUT /api/admin/surveys`), and a responses table. **Rule #12:** the
  Pulse-score KPI and a page-title "How Pulse surveys work" trigger now carry
  full five-section `InfoButton`/`MetricExplainer` blocks (restored from v2)
- [x] Reports (`/admin/reports`) — range presets, revenue/profit/margin/
  orders/AOV/tips KPIs, revenue-by-category bars, tips summary, top items, JPK
  export (`/api/admin/analytics` + `/reports/tips` + `/reports/jpk`). **Chart
  parity restored (flag #4):** a **Revenue-trend** `AreaChart`, a **Channel-mix**
  `Donut` + legend (dine-in/takeout/delivery), and an **Orders/day** `BarChart`
  — all from the same `dailyStats` + channel counts the analytics payload
  already returns — plus the **CSV export** (per-day revenue/cost/profit/margin/
  orders/items/AOV/channels) alongside JPK.
- [x] Business costs (`/admin/business-costs`) — operating-expense register
  with monthly-recurring / annualised / payroll / one-off KPIs (shared
  `monthlyGrosze`), category chips, add/edit/delete dialog (`/api/admin/business-costs`)
- [x] Cash (`/admin/cash`) — till session lifecycle: open float, record
  cash-sale/drop/payout entries, expected-drawer KPI, close with counted-cash →
  live variance, and a closed-session history (`/api/admin/cash` + `?action=drop|close`)
- [x] Growth (partial) — Scheduled bundles (`/admin/scheduled-bundles`):
  standing-pre-order status board (approve/pause/resume/cancel via
  `PATCH /api/admin/scheduled-bundles/:id`), rows sorted by weekday → ready-time
  so the list mirrors the operator's fulfilment order (v2 parity). **Workbench
  upgrade:** a reactive **KPI rail** (pending-approval · active · weekly units ·
  paused, computed real from the live list, rule #1) with five-section ⓘ
  explainers on the two levers (pending approval · standing weekly units), and a
  **drill-in detail dialog** on row click — cadence/ready-at/units/updated +
  the full standing-cart line items + the status actions, so the operator can
  see *what's in* a recurring order, not just its item count. Events & bookings
  (`/admin/truck`): events + run-sheets CRUD (incl. segment editor) over
  `/api/admin/truck-events` + `/api/admin/truck-routes`, plus the **KPI rail**
  (events / revenue / expected guests / live-upcoming). **Workbench upgrade:**
  five-section ⓘ explainers on Revenue + Expected guests, and a **Board⇄Table
  view toggle** for events with a default **Board** of event cards (status dot,
  date, revenue, expected guests; upcoming-first sort) that open the editor on
  click.
- [x] Growth complete — Campaigns (`/admin/growth`): loyalty levers
  (referral config + challenge/seasonal toggle = saved, `PUT /api/admin/growth`).
  **Restored to v2 parity (flag #5):** the **Loyalty tiers** editor
  (bronze/silver/gold/platinum — label / threshold / multiplier / perks, saved
  on blur), the **Live activity widgets** manager (7-type widget catalogue,
  add/edit/delete/toggle/reorder + per-widget type-config + location targeting,
  capped at `LIVE_WIDGET_LIMIT`), the **Rewards** catalogue (full
  add/edit/delete + toggle via `RewardDialogV3`, not toggle-only), and the
  **Referral codes** table (in-circulation codes with owner / phone / uses /
  earned-pts + remove, `GET`/`DELETE /api/admin/referrals`).
  Cross-sell (`/admin/crosssell`) — **full v2 parity (PR #139 follow-up):**
  four tabs over the per-location selling config (`PUT /api/admin/upsell`, full
  config round-tripped so nothing is lost): **Cart pairings** (Coffee/Dessert/
  Side/Drink item slots), **Combo deals** (add/edit/toggle/delete), **Time-of-day**
  windows (variant/hours/title/sub/badge/CTA/one-tap-add, add/edit/toggle/delete)
  and **Menu badges** (Hero / Pizzaiolo's Choice / Chef's Signature / New /
  Popular / Staff Pick multi-selects, with `menuRole`-intrinsic items shown
  auto-locked). Saves on change (rule #7).
  **Workbench upgrade (Menu/Recipes-parity interactivity):** the Combo deals tab
  is now a full workbench — a reactive **KPI rail** (active combos · avg discount
  with a five-section ⓘ · item-gated deals · windows-live-now with a five-section
  ⓘ, all computed real from the live config + clock, rule #1), a **search** box +
  **Board⇄Table** view toggle, and a default **Board view** of combo cards (each
  showing the discount/min-items/channel/required badges + a real-price worked
  example) with edit-on-click. The combo editor is a **two-column drill-in**
  (`.av3-bodysplit`, 900px): the form on the left, a **live customer nudge
  preview** + a **worked złoty example** (real cheapest-per-category / required
  items × discount = subtotal/saving/pay) on the right that recompute as you type.
  The Time-of-day editor gained the same split with a **live cart-banner preview**
  and a "showing now / parked" indicator; the windows table flags the window live
  at the current hour. Upsell (`/admin/upsell`) — **full
  v2 parity (PR #139 follow-up):** two tabs. **Bundles** restores the full
  bundle-ladder editor (CRUD with composition slots, fixed/dynamic pricing,
  anchor/decoy/default flags, loyalty gate, channel, members-only, scarcity
  date, active-days), the **bundle rules** card (lunch hours + family gating),
  an **A/B experiment** editor (variants + weights + per-bundle discount
  overrides + primary metric + control + start/stop + promote-winner) and the
  **ML ranker** panel (rollout slider → `mlUpsellRolloutPct`, Train-now via
  `POST /api/admin/ml-upsell`, model status, and the live ML-vs-rules attach/AOV
  comparison via `/api/admin/ml-upsell/compare`). **Item modifiers** is a
  read-only cross-location inventory. All config round-trips through
  `PUT /api/admin/upsell` (saves on change, rule #7).
  **Workbench upgrade (Menu/Recipes-parity interactivity):** the Bundles tab is a
  full workbench wired to **real 30-day analytics** (`/api/admin/bundle-analytics`,
  rule #1) — a reactive **KPI rail** with five-section ⓘ explainers (active
  bundles · penetration = applies/impressions · bundle AOV · 30d revenue · avg
  effective discount), a **search** box + **Board⇄Table** view toggle, and a
  default **Board view** of meal-period-grouped bundle cards (anchor/decoy/
  default/members badges, price/discount, and the bundle's real 30d sold +
  effective-discount + a 👎-rate flag joined from the analytics rollup). The
  bundle editor is a **two-column drill-in** (`.av3-bodysplit`, 940px): the full
  form on the left, a **live customer bundle-card preview** (tier, composition,
  fixed price + strikethrough/save or dynamic %) + this bundle's **live 30-day
  performance** grid (sold/ticket/saving/eff-discount/revenue/👍👎 + refund rate)
  on the right.
- [x] Intelligence (partial) — Multi-location (`/admin/locations`):
  cross-site comparison table + chain KPIs (`/api/admin/insights`), plus a
  **revenue-share `Donut`** + **orders-by-site `BarChart`** (flag #4, restored
  cross-site viz). Menu
  engineering (`/admin/menu-engineering`): star/puzzle/plowhorse/dog
  classification with window select, quadrant chips + per-dish verdict
  (`/api/admin/menu-engineering`); **Rule #12:** all four quadrant KPIs now
  carry full five-section `InfoButton`/`MetricExplainer` blocks (restored from
  v2). Expansion (`/admin/expansion`):
  new-site readiness checklists (toggle items, add planned site,
  `PUT /api/admin/expansion`).
- [x] Intelligence complete — Manage locations (`/admin/locations/manage`):
  site CRUD (hours editor, coordinates, active/alcohol) round-tripping the full
  record + re-seed (`/api/admin/locations`). Insights (`/admin/ai`): **five
  tabs restored to v2 parity (flag #5)** — **Forecast** bars
  (`/api/admin/ai/forecast`), **Anomalies** (today vs trailing 28-day avg from
  `/api/admin/analytics`), **Reorder** (SKUs ≤ reorder point from
  `/api/admin/stock`, suggested qty + est cost), **Staffing** (peak-hour
  headcount from `/api/admin/insights`), and the **Chatbot FAQ** manager
  (`/api/admin/chatbot-faq`).
- [x] System (partial) — Audit log (`/admin/audit-log`, filtered read +
  **field-level diff restored**: a row click opens a detail dialog with a
  v3-native `DiffRenderer` — added/removed/changed keys, before↔after blocks,
  pretty-JSON nested shapes — over the API's `before`/`after` snapshots; CSS
  §15 `.av3-diff-*`. **Owner-only purge** (gated on `/api/admin/me`
  `role === "owner"`): per-row + select-all checkbox columns and a toolbar
  with Delete selected / Delete filtered (current chip, disabled on "all") /
  Delete all, each behind a destructive confirm `Dialog`; calls
  `DELETE /api/admin/audit-log` with `{ ids }` or `{ all: true }`, then the
  purge is itself logged as `audit.purge`), SOC 2
  (`/admin/soc2`, owner-only, real `buildSoc2Register` introspection,
  **status filter chips** All/Met/Partial/Gap above the category groups),
  Currency (`/admin/currency`) + Languages (`/admin/languages`) settings,
  Capabilities (`/admin/capabilities` → canonical `/admin/capabilities`).
  **Visual upgrade:** Currency + Languages each gained a summary **KPI rail**
  (Currency: default / enabled / FX-rates-set / charges-in-PLN; Languages:
  default / enabled / translations-live) above their toggle editors. **Search
  added** to the two densest list surfaces that lacked it — **Inventory** stock
  (by ingredient/category, in a toolbar beside the status chips) and **Feedback**
  (by guest name / comment text, beside the status chips).
- [x] Users (`/admin/users`, owner-only): account directory + add/edit/delete
  dialog (role / status / site / optional password) over `/api/admin/users`.
  **Security surface restored to v2 parity (flag #2):** auth-posture KPIs
  (secured-2FA / no-2FA / passkeys), a per-user **Sign-in** column (posture +
  passkey-count + MFA tags), security filter chips (secured / no-2FA / passkey),
  and three management dialogs off the edit dialog — **Credentials** (password +
  terminal PIN, `…/credentials`), **MFA/TOTP** (begin → enable → disable,
  `…/mfa`, self-confirm + owner force-disable) and **Passkeys** (WebAuthn enrol
  via `@simplewebauthn/browser` + remove, `…/webauthn`). Granular permissions
  stay on the **Permission matrix** page (no duplication).
- [x] Permissions (`/admin/permissions`, owner-only): action-level RBAC matrix —
  per-user capability toggles from the shared `PERMISSION_GROUPS` catalog,
  persisting custom grants (`PUT /api/admin/users`). **Visual upgrade:** a **KPI
  rail** (capabilities / roles / user accounts / custom grants) and a
  **By-role ⇄ By-user** icon+label view toggle (`.av3-viewtoggle.is-text`,
  `Grid3x3` / `Users`; defaults to **By-role**) — the **By-role cross-tab**
  (`ROLE_DEFAULT_PERMISSIONS`, owner = all) is a read-only capability×role matrix
  grouped by permission group. CSS §21 (`.av3-matrix`).
- [x] Compliance (`/admin/compliance`): expiry calendar (licenses/inspections/
  insurance) with expired/≤7d/≤30d KPIs + add/edit/delete (`/api/admin/compliance`).
  **Search** added (by item / type / site).
- [x] Regulatory disclosures (`/admin/regulatory-compliance`, owner-only):
  default pack + per-site EU/NYC/SG zone + disclosure toggles
  (`PUT /api/admin/regulatory-compliance`). **Toggle = saved (rule #7)** — the
  zone select + disclosure toggles persist on change (no Save button); same
  consistency fix applied to Currency + Languages (enable/default persist
  immediately; FX rates save on blur). **Visual upgrade:** a summary **KPI rail**
  (sites / default pack / zones in use / disclosures active).
- [x] Settings (`/admin/settings`, owner-only): six tabs — **General**
  (business details + delivery fee / min order + social links, Save),
  **Storefront** (layout visibility toggles, toggle = saved), **Simulations**
  (every simulation in one explicit place — the **Calculator** toggle, plus two
  owner-only whole-app data modes: **Sandbox mode** switch + "Reset sandbox" that
  flips the whole app onto an isolated `sandbox:`-namespaced *seeded demo* dataset
  via `/api/admin/sandbox`, and **Simulation mode** switch + "Wipe simulation data"
  that flips it onto an isolated `sim:`-namespaced dataset that starts *empty* for a
  hand-entered pre-launch dry-run via `/api/admin/simulation-mode` — the two are
  mutually exclusive, enabling either forces the other off; a footnote names Floor
  Twin + Demand Exchange as always-on operational models, not toggled sandboxes),
  **Security** (restored, flag #5: read-only "how you sign in" panel from
  `/api/admin/me` + refund/comp caps + free-delivery thresholds editor —
  passkey/MFA *enrolment* lives in Users, not duplicated here), **Themes**
  (restored: read-only three-theme inspector from `design-system.json`) and
  **Advanced** (restored: seed demo data). The v2 Audit tab is intentionally
  **not** duplicated — it has its own `/admin/audit-log` page. All over
  `PUT /api/admin/settings`.
- [~] Calculator (`/admin/simulation`) — **Part 1 shipped**: the real P&L
  simulator. The compute engine was **extracted to a shared lib**
  (`src/lib/simulation-engine.ts`, pure `computeScenario` + `computeTornado`) so
  v3 runs the exact same math without importing from v2. Live input levers
  (volume/price, variable costs, labour, fixed costs, investment, capacity) →
  P&L + KPIs (margin, break-even, prime cost, CM1, capacity, payback,
  cash-on-cash) + sensitivity tornado, persisted via `PUT /api/admin/simulation`.
  **Part 2 shipped:** Investor Returns — NPV @ 10/15/20%, IRR (bisected),
  payback month + a 24-month cumulative cash-recovery view (`computeReturns` in
  the shared engine).
  **Part 3a shipped:** the seasonality × weather × inflation-composed 12-month
  projection. `projectMonths`/`projectTwelveMonths` (plus `monthVolumeMult`,
  `averageAnnualVolumeMult`, `MONTH_LABELS`, `MONTH_TO_SEASON`,
  `LABOR_SEASONAL_FLEX`, `DEFAULT_SEASONALITY`) were **extracted from v2 into the
  shared engine** — money returned in grosze (canonical unit) — and rendered as a
  grouped revenue/net-profit bar chart with a zero baseline (loss months dip red)
  plus year revenue/net totals.
  **Part 3b shipped:** the real-order **Sandboxes** card — a window selector
  (30/90/180d) over four tabs reading live order history: **Cohort / LTV-CAC**
  (`/cohorts` — customers, repeat rate, orders/revenue/GP per customer, new/mo,
  new-vs-returning revenue split), **Dayparts** (`/dayparts` — lunch/dinner/
  late-night/off-peak orders, share, ticket, revenue, GP, GP-rate), **Hourly
  throughput** (`/hourly` — 24-bar avg-orders-per-hour chart with amber≥85% /
  red>100% capacity colouring) and **Menu engineering** (`/menu-engineering` —
  star/plowhorse/puzzle/dog quadrant counts + per-item GP/unit, true-CM1 and
  margin-trap / prep-heavy flags). All accept `?days=N`.
  **Part 3c shipped:** the five-section ⓘ explainer pass (Rule #12). A
  v3-native `MetricExplainer` + `InfoButton` primitive
  (`src/admin-v3/ui/Explainer.tsx`, exported from `ui`) renders the
  five required sections in the fixed order/labels — description → INSTITUTIONAL
  ANALYSIS → IN PLAIN TERMS → TIPS → METHODOLOGY (all five props required, so a
  half-written explanation won't compile). It is the admin-v3 counterpart to
  `src/components/admin/Explainers.tsx` (which imports the v2 theme and dies at
  cutover). `Kpi` gained an optional `info` slot that renders the ⓘ trigger at
  the end of the label row; the Calculator's six headline KPIs (net profit, net
  margin, EBITDA, break-even/day, prime cost, payback) each carry a full
  five-section explainer. **Follow-up:** the **Unit economics** card header now
  also carries a five-section ⓘ (true CM1/order, CM%, food/labour %, capacity,
  cash-on-cash), extending Rule #12 coverage past the headline rail.
  **Part 3f shipped — v2 what-if depth ported:** a **Margin-of-safety** headline
  KPI (`marginOfSafetyPct`, with explainer); **Seed from last 30 days** (pulls
  orders/day · ticket · COGS from `/api/admin/analytics` into the input levers);
  a **Scenario comparison** card (conservative / base / optimistic re-run through
  `computeScenario` — net profit, margin, EBITDA, break-even/day, payback); and
  two **net-profit heatmaps** (orders/day × ticket, and food-cost × ticket) —
  7×7 grids recomputed cell-by-cell through the engine, colour-scaled, centre
  cell = today. CSS §22 (`.av3-heat`, `.av3-scn`). Each new metric/heatmap carries
  a five-section ⓘ (Rule #12).
  **Part 3g shipped — operational + menu depth (v2 parity complete):**
  **Menu strategy presets** (Balanced / Premium / Value one-tap attach-lever
  mixes, folded into ticket/COGS via `applyAssumptions`); an **Oven curve & peak
  saturation** card (hourly demand vs the `kitchenCapacity.pizzasPerHour` ceiling
  over a documented double-peak shape — peak/hr, line/hr, peak-util KPIs, queue
  wait + orders-lost/mo, over-ceiling bars in red); and a **Shift plan — labour
  by daypart** table (forecast orders + recommended line heads per daypart vs
  scheduled pizzaioli). All five-section-ⓘ'd. The v3 Calculator is now at
  **functional parity with the v2 AdminSimulation** (the demand-shape + queue
  model are declared modelling layers, like the engine's seasonality defaults).
  **Part 3h shipped — field-for-field input parity:** a model-level audit of
  `SimulationScenario` found 15 engine-backed variables v2 exposed but v3 didn't,
  now all wired into their existing cards: wage + ingredient inflation (Volume &
  price); labour flex % + anchor orders/day (Labour); Marketing = CAC toggle
  (Fixed costs); open hrs/day + oven physics (pizzas/cycle, cycle-s, efficiency)
  + prep-complexity × (Investment & capacity); combo add-on-COGS % + the
  cheapest-pizza-shift lever (Behaviour); 12 per-month seasonality overrides
  (Seasonality); build-out learning % + floor % (Fleet). Every scenario field
  the engine reads is now editable.
  **Part 3i shipped — menu-scenario system (full v2 parity, nothing left):** the
  named-scenario model is ported — a **Menu scenarios** card with the five baked
  archetypes (Takeaway / Balanced / Premium / Family / Aperitivo) + **Custom**,
  each resolving its `menuScenarioOverrides[id]` over the baked preset. **Apply**
  loads the full input set (orders/day · days · ticket · COGS + the six attach %,
  preserving enabled-state) and sets `menuScenario=id`; **Save current** captures
  the live inputs into the override; **Reset** drops it. The same overrides
  round-trip with v2 via `PUT /api/admin/simulation`. With this the v3 Calculator
  is at **field-for-field AND feature-for-feature parity** with the 17k-line v2
  `AdminSimulation` — every variable, lever, what-if, operational view and named
  scenario.
  **Part 3d shipped:** the behaviour & environment levers. `applyAssumptions`
  + `applyAnnualWeather` were extracted into the shared engine (same folding
  math as v2) and the headline P&L / tornado / returns now compute on the
  folded scenario (the projection takes the assumptions-folded scenario and
  applies weather per-month itself). New input cards drive them: **Behaviour
  assumptions** (6 attach levers + combo conversion + delivery share, each a
  toggle with inline attach%/price/COGS fields), **Ingredient cost stress** (10
  per-line cost-delta levers), and **Seasonality & weather** (four quarterly
  multipliers + a calibrated weather/holiday model). New CSS rows `.av3-leverrow`
  / `.av3-lever-name` in `themes/admin-v3/index.css` style the toggle+name+fields
  layout.
  **Part 3e shipped — Calculator parity complete:** the fleet/franchise model
  and the channel-economics breakdown (the last v2 sim depth) are now in the
  shared engine (`computeFleetEconomics`, `computeChannelEconomics`) and the v3
  Calculator. A **Channel mix & fleet** input card drives the per-channel fee mix
  (cash / on-site card / Glovo / Wolt) and the multi-unit model (units, HQ
  overhead, royalty + marketing-fund, DMA cannibalisation, supply-discount +
  commissary triggers); a **Channel economics** output table shows unblended CM1
  per channel, and a **Fleet economics** card (shown at >1 unit) gives fleet
  revenue/EBITDA, avg EBITDA per unit, HQ absorption and a per-unit table. With
  this the v3 Calculator is at functional parity with the v2 `AdminSimulation`.
- Every other admin page is migrated. At Calculator parity → flip `/admin` to v3, delete v2.
- [ ] Parity reached → flip `/admin` to v3, delete v2, register in `/admin/capabilities`
