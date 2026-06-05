# Components

← back to [README](./README.md)

The v2 library lives in `src/components/admin/v2/ui/`. Mockup equivalents
live in `public/mockups/core-suite/system.css`. **All components read tokens
— none hardcode colour.**

## Buttons — investment-grade

`.v2-btn-*` (live app) and `.btn` (mockups) share the same refined
treatment:

- **7px radius.** Tight, not friendly. The whole button family lives here
  (sm / md / lg / xl all 7px).
- **1px defining border** on every variant. Secondary uses `--border-strong`
  (hairline); filled variants (primary/danger/success) use a *darker* edge
  via `color-mix(<accent> 74%, black)`.
- **No glossy top-light sheen.** No `inset 0 1px 0 rgba(255,255,255,.12+)`
  on filled buttons. Flat fill + darker edge.
- **No glow shadow.** No burgundy-tinted `box-shadow`. Use `--shadow-sm` if
  elevation is needed at all.
- **Letter-spacing `-0.005em`**, weight 500, centered label.
- **Active press:** `:active { transform: translateY(0.5px) }`.

### Sizes

| Size | Height | Padding | Use |
|---|---|---|---|
| sm | 26px | 0 10px | Inline actions in tables |
| md | 34px | 0 13px | The default |
| lg | 38–42px | 0 17–18px | Page-level CTAs |
| xl | 46px | 0 22px | Hero CTAs (Charge, big bumps). Full-width when alone. |

**Icon-only buttons.** A `.v2-btn` rendered with an icon but **no** `.v2-btn-label`
(i.e. `<Button leadingIcon={…} />` with no children) auto-collapses to a square
via `.v2-btn:not(:has(.v2-btn-label))` — no width/padding overrides needed. This
is the standard for **all `PageHero` action buttons** (New, Save, Refresh,
Export…): icon only, always with an `aria-label` + `title` carrying the dropped
text for accessibility + a hover tooltip. Keep text labels on in-body / table /
dialog buttons.

### Variants

| Variant | Bg | Border | Use |
|---|---|---|---|
| `primary` | `--brand` | darker burgundy edge | The one money/commit action per view |
| `secondary` | `--surface-2` | `--border-strong` | Default neutral action |
| `ghost` | transparent | `--border-strong` | Tertiary / cancel / inline |
| `danger` | `--danger` | darker red edge | Destructive |
| `success` | `--success` | darker green edge | Confirm / mark-ready |

**One primary per view.** If two things feel primary, you have a hierarchy
problem — fix that instead of adding a second.

## Badges & status chips

### Default badge — `.badge` / `.v2-badge`

Small soft fill (`--*-soft`) + a brighter hex text for ≥ 4.5:1 contrast on
dark. Pill-shaped. Tones: `brand`, `platinum`, `info`, `success`, `warning`,
`danger`, `neutral`.

```html
<span class="badge success"><span class="d"></span>Ready</span>
```

The leading `<span class="d">` dot is optional — use it when the badge
carries a live state (Live / Awaiting pay / Open).

### Product-card category badge (POS) — **squared & refined**

The category tag on a menu card (Classica, Piccante, DOP, Veg, Acqua,
Aperitivo, Caffè):

```css
height: 18px;
padding: 0 7px;
border-radius: 4px;                /* squared, not pill */
font: 600 9px var(--ui);
letter-spacing: .09em;
text-transform: uppercase;
```

This is the *one* place we use the squared treatment. Reads as a tag in a
printed menu rather than a soft pill — editorial / investment-grade.

### Role badges (menu-engineering)

`Hero` / `Profit` / `Signature` — same 9px squared chip, semantic tone:

| Role | Tone |
|---|---|
| Hero | `brand-soft` (burgundy) |
| Profit | `success-soft` (green) |
| Signature | `platinum-soft` (champagne) — the `.role.anchor` class |

**Never duplicate** the role label and the category badge text. If a card
has `role="Signature"`, the category badge must be something else (DOP,
Veg, etc.).

### Course chips (KDS dine-in tickets) — outline

```css
border: 1px solid var(--border-strong);
color: var(--dim);
padding: 2px 7px;
border-radius: 5px;
font: 600 10px / .04em uppercase;
```

Text: `1 · Starters` / `2 · Mains` / `3 · Dessert`. The "all-together"
variant `.course.together` swaps the border for `--platinum-soft-strong` and
the text for `All together`.

### Pace chips (POS / KDS hint)

Small chip carrying steering signal:

| State | Bg | Text |
|---|---|---|
| `make` | `--success-soft` | `--success` — "★ Make now" |
| `ease` | `--warning-soft` | `--warning` — "Ease — oven busy" |

Placed inline in the tags row on a POS product card.

## Inputs & segmented

- **`.v2-input`** (the `Input` primitive) — surface-2 background → surface-1 on
  focus, steel focus ring + 3px soft halo. **8px radius.** Height 36px. (The
  legacy `.glass-input` alias on the old `--admin-*` tokens is being retired —
  Phase 4 cleared it from the Growth island; don't add new usages.)
- **`.seg`** segmented — 3px-padded track, selected tab gets `--surface-3`
  fill + `--shadow-xs`. Used for stage switches (KDS), period filters
  (CRM), fulfilment channels (POS), MCP/WhatsApp transports (Concierge).
- **`.viewswitch`** — the shared **role/view** switcher (KDS Fleet / Floor /
  Chef, Guest Inbox / Guests / Concierge). Same look as `.seg` so the suite
  reads as one product.
- **`.v2-tabs-pill`** — the `Tabs` segmented variant (period filters, Kanban/
  Table toggles). Sized to **34px to match `.v2-btn-md`** (3px track pad + 1px
  border + 26px tab; 8px radius ≈ the button's 7px) so it sits flush beside
  buttons in a page-header toolbar.

## Location → Scope (one switcher, shell-level)

> **`LocationFilter` and the sidebar `LocationSwitcher` were removed in Phase 2.**
> Location is operating **context**, not a per-page filter, so there is now **one**
> control: `ScopeSwitcher` in the **topbar breadcrumb**, backed by the persisted
> `useAdminLocation()` context. The two old components (the per-page pill row and
> the sidebar switcher) coexisted and drifted — that coexistence was the bug.

**How a page reads the current site:** consume the shell scope, don't render a
control.

```tsx
const { location: scope } = useAdminLocation();   // "" = all locations
// operational pages that can't span sites:
const pageLoc = scope || FALLBACK_LOC;            // "all" → first active location
```

The `ScopeSwitcher` (topbar) writes the scope; every page re-derives + re-fetches
from it. See [ScopeSwitcher](#redesign-primitives--the-command-surface)
for how the control scales 1 → N sites. Never reintroduce a per-page location
pill — the lint guard + this doc are the contract.

## Cards

### General card — `.v2-card` (the `Card` primitive)

> The legacy `.glass-card` alias (old `--admin-*` tokens) is being retired — Phase 4
> migrated the Growth island onto `.v2-card`. Don't add new `.glass-card` usages.

```
background: var(--surface-1)
border: 1px solid var(--border)
border-radius: var(--radius-lg)              /* 12px */
box-shadow: var(--shadow-xs), inset 0 1px 0 rgba(255,255,255,.04)
```

The `inset 0 1px 0 …` is the **1px hairline top-light** — a refined
material touch, not a gradient. Static content cards stay flat.

**Interactive cards lift.** A clickable card — `.v2-card-interactive`, or an
`a`/`button` that *is* a `.v2-card` — gets a tactile hover: border → `--border-strong`,
`--shadow-sm`, and `translateY(-1px)` on `--duration-fast`, settling back on
`:active`. KPI tiles (`.v2-kpi`) share the same lift. Reduced-motion drops the
transform. Don't put the lift on a static card — motion implies "click me."

**KPI tiles are clean & minimal.** No coloured top bar. A `KpiCard`'s `tone`
(`brand`/`info`/`success`/`warning`/`danger`) colours **only the icon chip**
(`.v2-kpi-tone-*`) — the surface stays calm and standardised. The label is a
**2xs uppercase eyebrow** (`.07em` tracked, `--fg-subtle`); the value is the
**Fraunces display numeral** (`--font-display`, `--text-3xl`, weight 500,
`tabular-nums`) — the "investment-grade tell" per
[typography → Display numerals](./typography.md#display-numerals-kpis); the icon
sits in a `--radius-md` tone chip. Crisp metric eyebrow → refined serif hero
number is the KPI rhythm.

### Menu / product cards — text-forward

Until real food photography exists, **menu cards are text-forward**. The
empty image-box pattern is forbidden — a wireframe placeholder reads
childish regardless of what's inside it.

Structure:

```
+----------------------------------+
| [icon] Name                Role  |   .phead (Fraunces name + icon)
| desc desc desc desc desc         |   .desc (12px muted, reserved 2 lines)
| desc desc desc                   |
|                                  |
| [Cat] [Pace]            42 zł    |   .row (pinned bottom)
+----------------------------------+
```

Key rules:

1. **Reserve 2-line min-heights** on both `h3` (name) and `.desc`
   (description). This makes 1-line and 2-line names produce identical
   card heights so the price row sits at the **same place on every card**.
2. **Pin the price row to the bottom** with `margin-top: auto`.
3. **Category icon is a 17px quiet accent** beside the name. Not a hero,
   not an image-tile substitute.
4. **No corner overlay badges.** The role badge lives inline in the
   `.phead` row (top-right by flex, not absolute).

## Dialogs / overlays

- **Portaled to `#admin-portal-root` (the admin layout wrapper), falling back
  to `document.body`** — via the shared `adminOverlayTarget()` helper in
  `v2/ui/portal.ts`. Every portaled admin overlay uses it: `Dialog` /
  `ConfirmDialog` / `InfoButton` (which build on `Dialog`), plus `Popover`,
  `Tooltip` and the `Toast` stack. The wrapper is an ancestor of `.admin-bg`,
  so an overlay portaled here still escapes the `.admin-bg > *` stacking trap
  (`CLAUDE.md` rule #4) — but it is *also* where the `--font-admin-*` next/font
  vars are declared **and** (since the font-scope fix) carries an explicit
  `font-family` rule, so the overlay inherits **Inter** instead of the
  browser-default **serif**. Two things were both required: (1) portal *into*
  `#admin-portal-root` so the overlay is inside the admin font scope, and
  (2) the `#admin-portal-root { font-family: var(--font-admin-body), … }` rule
  in `themes/admin/index.css`. The subtlety behind (2): the theme's `--font-ui`
  token is declared on `[data-admin-theme]` (= `<html>`) as
  `var(--font-admin-body), …`, but `--font-admin-body` is only defined on
  `#admin-portal-root` — and a `var()` inside a custom property is substituted
  at the element where that property is *declared*. So `--font-ui` resolves to
  empty up on `<html>` and inherits down empty; **every** `font-family:
  var(--font-ui)` rule (the shell, the `.v2-page-loading` pill, the overlays)
  silently failed and fell back to serif. The fix sets `font-family` directly
  from `var(--font-admin-body)` (which *is* defined on `#admin-portal-root`),
  so the wrapper renders Inter and the broken `var(--font-ui)` consumers below
  it fall back to `inherit` → Inter. Verified in a real browser with
  `getComputedStyle` (page card and dialog body both resolve to Inter).
  Same escape hatch the KDS loading pill uses (see the loading-state note
  below). All four overlays use `position: fixed` and `#admin-portal-root`
  carries no transform, so the move doesn't shift their viewport-anchored
  coordinates. `--font-display` had the **same** var-scope bug (the only admin
  consumers are the sidebar brand wordmark `.v2-brand-name-line` /
  `.as-brand-name`), so it's repaired the same way: `#admin-portal-root`
  re-declares **both** `--font-ui` and `--font-display`, so the brand wordmark
  now resolves to **Fraunces** while body/overlays stay Inter (verified via
  `getComputedStyle`).
- Backdrop: `rgba(0,0,0,.55)` + `backdrop-filter: saturate(120%) blur(4px)`.
- Dialog box: `--surface-1` + `--border-strong` + `--shadow-lg` +
  `--radius-xl` (16px).
- Header / footer of the dialog have 1px `--border` dividers.

## Metric explainers — the ⓘ contract

Live code: `src/components/admin/Explainers.tsx` (+ `InfoButton` in
`v2/ui/InfoButton.tsx`, which portals the dialog).

Any ⓘ `InfoButton` on a KPI card, metric or what-if lever (reports,
sandboxes, the Calculator) explains itself in **five fixed sections, in this
order, with these labels** — the **CLAUDE.md Rule #12** contract:

1. one-line **description** (plain paragraph, no rail)
2. **INSTITUTIONAL ANALYSIS** — slate left-rail (`rgb(71,85,105)`), `Scale` icon
3. **IN PLAIN TERMS** — orange left-rail (`rgb(234,88,12)`), `Sparkles` icon
4. **TIPS — HOW TO PUSH THIS LEVER** — green left-rail (`rgb(22,163,74)`), `Lightbulb` icon
5. **METHODOLOGY — HOW THIS IS DETERMINED** — blue left-rail (`rgb(59,130,246)`), `Calculator` icon

- **Build it from `MetricExplainer`** (`Explainers.tsx`) — it fixes the order
  and labels and its five props are all required, so a half-written
  explanation won't compile.
- **Page-level intro cards use `PageExplainer`** (`Explainers.tsx`) — the
  "How to read these numbers" / "How this projects" card that sits below the
  KPI row on every report and sandbox. It renders the **same five sections in
  the same order with the same labels** as `MetricExplainer`, wrapped in a
  `<Card>` with a heading + optional hint (`title` defaults to "How to read
  these numbers"; pass `title`/`hint` to override). Its five content props are
  all required too, so a page intro can't ship missing the institutional
  framing or with the sections reordered — the page intro and the per-metric ⓘ
  dialog read as one voice. **Never hand-assemble** the individual blocks into
  a card; reach for `PageExplainer`. As of the 2026-06 unification all five
  intro cards (Cohort report, LTV/CAC report, Cohort/LTV-CAC/Menu-engineering
  sandboxes) are built from it.
- The individual blocks (`InstitutionalAnalysis` / `PlainTalk` / `Tips` /
  `Methodology`) remain exported as the shared primitives both wrappers
  compose, and `Tips` defaults its headline to "Tips — how to push this lever"
  (override via the `headline` prop). The Calculator's `HELP` registry is the
  origin of this vocabulary and imports the same shared blocks.
- **Colour exception:** the four accent left-rails are intentional semantic
  hex (orange/slate/green/blue), *not* theme tokens — the one sanctioned
  deviation from "all colour from tokens", because the rails are a fixed,
  cross-surface reading language. Don't recolour them per surface.
- Render the ⓘ trigger via `InfoButton` (`size="sm"` inside a KPI-card label;
  `size="md"` in a card header). The dialog is portaled (Rule #4).

## Loading states — the `.v2-page-loading` pill

Live code: `.v2-page-loading` in `src/app/themes/admin/index.css`. A small
fixed-position pill (`position: fixed; bottom: 16px; left: 50%`) that reads
"Loading X…" while a page resolves its data.

**The pill is `position: fixed`, so it needs a tall containing block — and on
mobile it does not anchor to the viewport.** The mobile `.v2-m-page-transition`
wrapper carries the page-slide `transform` (kept alive by
`animation-fill-mode: both`), and any non-`none` transform makes that element
the containing block for fixed descendants. Two safe patterns:

- **Sole render → wrap it.** When a component early-returns the pill *as its
  entire output*, wrap it in `.v2-page`:
  `return (<div className="v2-page"><div className="v2-page-loading">Loading X…</div></div>)`.
  `.v2-page` carries `min-height: calc(100vh - 53px)`, so the transition box
  has real height and the pill sits as a centred bottom pill. Mirror of the
  fixed-element trap in [Dialogs / overlays](#dialogs--overlays) / Rule #4.
- **Alongside content → conditional child.** When the page chrome already
  renders, drop the pill inside the existing `.v2-page`:
  `{loading && <div className="v2-page-loading">Loading X…</div>}`. The box
  already has height, so nothing extra is needed.

**Never early-return a bare `<div className="v2-page-loading">`** with no
`.v2-page` wrapper — on mobile the transition box collapses to ~0 height and
the pill renders full-width, clipped under the topbar instead of as a pill.
(`AdminSimulation`/Calculator hit exactly this.)

- **Core route → portal to `#admin-portal-root`.** Core surfaces (KDS) render a
  fixed `.kds-core` overlay and the `/core` layout carries no `.v2-shell` chrome
  at all, so there's no `.v2-page` to drop the pill into and rendering it inline
  traps it in the `.admin-bg > *` stacking context (rule #4). Portal it instead:
  `createPortal(<div className="v2-page-loading">…</div>, document.getElementById("admin-portal-root") ?? document.body)`,
  gated on a client `mounted` flag. `#admin-portal-root` is the layout wrapper —
  `src/app/admin/layout.tsx` under `/admin/*`, `src/app/core/layout.tsx` under
  `/core/*` (each re-creates the same id) — an ancestor of `.admin-bg` (escapes
  the trap), with no transform (the fixed pill anchors to the viewport), that
  holds the `--font-admin-*` next/font vars. **Do not portal to `<body>`:** it's
  outside that font scope, so `var(--font-ui)` can't resolve and the pill
  renders in the browser-default **serif** (`AdminKDS`/`AdminKdsFleet` hit
  exactly this). See [KDS → Loading pill](../../core/modules/kds.md#loading-pill).
- **Core route Suspense fallback (`loading.tsx`) → wrap in `.core-suite`, not
  `.v2-page`.** `.v2-page`'s `min-height: calc(100vh - 53px)` reserves space for
  the admin topbar; core routes don't render one, so the fallback came up 53px
  short and a strip of the layer behind showed at the bottom. Paint the same
  full-viewport `.core-suite` surface the real page uses
  (`src/app/core/pos/loading.tsx`).

The pill **declares `font-family: var(--font-ui)` itself** so it doesn't depend
on inheriting Inter from a `.v2-shell` ancestor — required for the portaled
core-route case above, harmless everywhere else (it already resolves to Inter
inside the shell).

## Sidebar — one component, one vocabulary (`.app-sidebar`)

There is a **single** sidebar: `components/admin/v2/Sidebar.tsx`, class
`.app-sidebar` (`.as-brand` / `.as-eyebrow` / `.as-item` / `.as-scroll` /
`.as-foot`). Both **AdminShell** and **CoreShell** (POS / Guest) render it, so
the nav is pixel-identical everywhere. The Core suite was the source of truth
for the look; the old parallel `.v2-sidebar` / `.v2-brand-name-sub` markup is
retired (its CSS is dead, pending cleanup). `.app-sidebar` styles live here in
admin CSS but use only tokens that resolve in **both** the `[data-admin-theme]`
and `.core-suite` scopes, so the one component looks right in either shell.

- **Full nav, role-filtered**, from `useNavSections()`
  (`components/admin/v2/useNavSections.ts`); active state by `pathname`.
- **Role-prefixed hrefs.** `nav.config` hrefs are canonical `/admin/*`, but
  `useNavSections` re-roots each onto the prefix the page is served under
  (`withAdminBase` — owner `/admin/*`, manager `/manager/*`, franchisee
  `/franchisee/*`), and the brand link points at that base's home. So the
  active-state `pathname` match lines up with the prefixed hrefs. The `g`+letter
  shortcuts (`AdminShell.onGoto`) and the command palette prefix the same way.
  See [README → Role-prefixed back-office URLs](../README.md#role-prefixed-back-office-urls)
  and `src/lib/admin-base.ts`; the filter still gates on the canonical href, so
  the prefix is cosmetic.
- **No `g`-key chips** (the old `.v2-nav-kbd`). The `g`+letter shortcuts still
  work via the global handler in `AdminShell.tsx` off `nav.config`, and the
  full list is in the **`?` shortcuts modal** (`ShortcutsHelp.tsx`). Keep
  `shortcut` in `nav.config`; it feeds the handler + the modal.
- **Footer:** Log out, on every surface. (The location switcher moved out of the
  sidebar footer to the topbar `ScopeSwitcher` in Phase 2 — one switcher, shell-level.)
- **Scrolls with no visible scrollbar** (`.as-scroll`: `overflow-y:auto` +
  `scrollbar-width:none`). KDS is the exception — its own full-screen wall, no
  sidebar.

See the core side in [core components → Sidebar](../../core/theme/components.md#sidebar--the-shared-app-sidebar).

## Tables

- **48px row baseline.** Convergence target across Orders / Customers /
  Loyalty / Staff (some still drift 40–60px — see [`backlog.md`](../../backlog.md)).
- `tabular-nums` on every numeric column.
- Hairline `--border` between rows. Hover lifts the row background only.
- Column header eyebrows: `11px uppercase 600 / .08em tracked` in
  `--fg-subtle`.
- **`flush` inside a Card (no double border).** By default `.v2-table-wrap`
  carries its own border + `--radius-lg` + `--surface-1` — correct when the
  table stands alone on a page. But dropped inside a `<Card>` that already
  supplies all three, you get the **box-in-a-box** look (a border hugging a
  border). Pass `<Table flush>` to strip the wrapper chrome
  (`.v2-table-flush`), and set the card to `<Card padding="none">` so the table
  fills edge-to-edge under the card header. The card's `overflow: hidden` +
  radius clip the corners. **This is the standard for any card-nested table** —
  it ships across the admin (Dashboard, Reports, Inventory, Customers,
  Suppliers, Staff, Users, AI, Compliance, Surveys, …). When the card body has
  mixed content (a header row or controls beside the table, e.g.
  `AdminLocationsManager`), keep default card padding and pass `flush` alone —
  the table inset loses its border without forcing the rest edge-to-edge. A
  table that stands **alone on the page** (not in a card, e.g. `AdminOrders`)
  keeps its own wrapper border — don't flush it. See
  [material → Nested surfaces](./material.md#nested-surfaces--one-border-per-box).

## Callouts — `.v2-callout`

The standard inline **info panel** (the "only an owner can…" notice, simulator
caveats, security notes). A `--surface-2` inset well with a **left accent rail**
and a **CSS-chipped icon** (the leading `<svg>` gets a padded tinted background —
no markup wrapper needed; usages just set the class). Structure:

```
<div className="v2-callout v2-callout-platinum">
  <ShieldCheck className="h-4 w-4" />     {/* auto-chipped by CSS */}
  <span><strong>Lead-in.</strong> Body copy…</span>
</div>
```

- **Tones:** base (neutral rail), `-info`, `-warning`, `-danger`, `-platinum`.
  The tone colours both the rail and the icon chip. **Platinum is the owner-tier
  tone** — use it for owner-only notices (per the platinum-for-owner doctrine).
- **Don't wrap a lone callout in its own `<Card>`** — the callout already carries
  surface + border, so a card around just a callout double-borders. Render it
  standalone (e.g. the AdminUsers owner notice) or as one item inside a larger
  card body.
- **Not to be confused with `.v2-note`**, which is the **CRM customer note card**
  (`AdminCustomerDetail` — body + foot + delete). The two used to share the
  `.v2-note` name and collided; the callout is now its own `.v2-callout`.

## Kanban (Orders board)

`.v2-kanban-col` lanes carry a **2px status-colour cap** (`.v2-kanban-col-{warning
|info|success|danger|neutral}` → `--kcol-accent`, mapped from `ORDER_STATUS_TONE`)
so pending / in-progress / ready / cancelled read at a glance — the same accent-cap
language as the KPI tiles. `.v2-kanban-card`s lift on hover
(`translateY(-1px)` + `--shadow-sm`, reduced-motion-aware), matching the
interactive-card behaviour.

## Page command surface (`PageHeader` + `ViewToolbar`)

> **Redesign Phase 3 retired the platinum-railed hero panel for admin pages.**
> The command surface is now two slim, panel-less bars — `PageHeader` (identity)
> + `ViewToolbar` (control) — see
> [Redesign primitives](#redesign-primitives--the-command-surface) below for the
> full spec and the preferred call pattern.

**`PageHero` is now a compatibility composition.** It no longer renders the
`.v2-page-header` panel / `.v2-hero` rows; it composes `PageHeader` + `ViewToolbar`
from its existing data props (`title`→title, `subtitle`→the ⓘ help, `actions`→
primaryAction, `nav`→underline tabs, `filter`→pill `Tabs` in the toolbar,
`dropdowns`→`Select`s). So all existing call sites render the new split surface
unchanged. **New pages call `PageHeader` + `ViewToolbar` directly.**

The slot-by-role guidance still holds (it now maps onto the toolbar): **few short
mutually-exclusive options → `Segmented`** (direct) / the `filter` pill (via
PageHero); **many/long options → `Select`** (`dropdowns`); **switch sub-views →
the underline `nav` tabs**. `actions` are the page's primary action (+ compact
secondaries); icon-only buttons auto-collapse to a 34px square via the global
`.v2-btn:not(:has(.v2-btn-label))` rule.

> **Legacy CSS note:** `.v2-page-header` / `.v2-page-title` / `.v2-page-subtitle`
> are **retained only for the `/core` KDS header** (which still uses them) — admin
> pages no longer render them. The `.v2-hero*` rules are dead-for-admin legacy,
> pending a later CSS tidy; don't build on them.

- **`.v2-section-eyebrow`** — a 2xs uppercase, `.1em`-tracked `--fg-subtle` label
  trailed by a hairline rule (`::after`, `flex:1`), pulled tight to the group
  below (`margin-bottom:-6px`). It bands the page: **Headline** (the 4 primary
  KPIs) / **Operations & risk** (the 4 secondary KPIs) / **Performance** (trend +
  alerts) / **Demand** (top sellers + heatmap) / **Network** (location table).
  KPIs are split into two `.v2-kpi-grid` tiers under their eyebrows for hierarchy.

## Redesign primitives — the command surface

> Shipped in the admin redesign (`../redesign-blueprint.md`,
> tracked in `../redesign-progress.md`). As of **Phase 3**, `PageHero` itself
> composes these (so every page already renders the new surface); new pages call
> `PageHeader` + `ViewToolbar` directly. `LocationFilter` was removed in Phase 2.
> **Selection language for all of them is selection-as-raise** — see
> [material → Selection](./material.md#selection--the-neutral-raise).

### Page command surface — `PageHeader` + `ViewToolbar`

The redesign **splits the monolithic `PageHero` panel into two slim, panel-less
bars** so *identity* and *control* never merge (the cause of three switcher idioms
stacking in one 120px panel). The heavy platinum-railed `.v2-page-header` is no
longer rendered by admin pages (Phase 3) — `PageHero` composes the two bars below.

- **`PageHeader`** (`v2/ui/PageHeader.tsx`, `.v2-pagehead`) — **identity only**: a
  ~52px hairline-based bar (no card, no rail, no shadow). Slots: `title` (serif
  display, the only h1), optional `info` (a quiet ⓘ → `Popover` of page help —
  this **replaces the always-on subtitle**; it is page help, *not* a metric ⓘ),
  `primaryAction` (the one labelled `<Button variant="primary">` — never
  icon-only), `menu` (secondary actions collapsed under a `⋯` `Popover`, rows are
  `.v2-menu-item`), and an optional `back` slot for detail pages. **No location,
  no filters here.**
- **`ViewToolbar`** (`v2/ui/ViewToolbar.tsx`, `.v2-toolbar`) — **control only**, a
  ~48px bar attached to the data: `tabs` (underline `Tabs`, sub-view navigation
  only) on the left; `children` (the filter / sort / display cluster) on the
  right. `sticky` pins it under the header on long tables. The toolbar owns the
  tabs' bottom border so the inner `Tabs` drops its own. Omit entirely when a page
  has neither navigation nor filters.
  - **One control height (34px).** Every control in the toolbar's right cluster
    **and** the `PageHeader` actions snaps to **34px** — the pill `filter`,
    `Segmented`, `Select`, `Input`, `Button` (md) and `IconButton` all align to a
    single height + baseline (CSS: `.v2-toolbar-controls`/`.v2-pagehead-actions`
    normalise it; intrinsic `Select`/`Input` padding is dropped to hold 34px).
    Underline nav tabs stretch full-height so the active 2px rule meets the
    toolbar's bottom hairline. This kills the 34/36/38 height drift between
    buttons, tabs, selects and the pill — the row must read as one system.

```tsx
<PageHeader title="Orders" info={<>…how to read this…</>}
            primaryAction={<Button variant="primary">New order</Button>}
            menu={(close) => <button className="v2-menu-item" onClick={close}>Export CSV</button>} />
<ViewToolbar
  tabs={{ value: view, onChange: setView, options: [{value:"kanban",label:"Kanban"},{value:"table",label:"Table"}] }}
  sticky
>
  <Segmented value={status} onChange={setStatus} options={STATUS} ariaLabel="Status" />
</ViewToolbar>
```

### `Segmented` — the filter control

`v2/ui/Segmented.tsx` (`.v2-seg`). The canonical **filter** widget for ≤ 4
mutually-exclusive short options (status, view-mode, period). For 5+ / long
options use `Select`; for stackable multi-dimensional filtering use filter chips;
for sub-view navigation use the underline `Tabs`. `role="radiogroup"`, arrow-key
roving. Active option is **selection-as-raise** (`--surface-3` + `--border-strong`
+ `--shadow-xs` + full `--fg`), never a brand flood — so there's zero layout shift
between states. (Distinct from the legacy pill `Tabs variant="pill"`, which it
supersedes for filtering.)

### `ScopeSwitcher` — the one location selector

`v2/ui/ScopeSwitcher.tsx` (`.v2-scope`). Location is operating **context**, not a
per-page filter, so this **one** control replaced both `LocationFilter` (per-page
pills) and the sidebar `LocationSwitcher` — both removed in Phase 2. It now lives
in the **topbar breadcrumb** (`Topbar.tsx`), wired to the persisted
`useAdminLocation()` context, so a scope change drives every page.
It **changes shape with scale, never identity**: 1 location → a static label
(nothing to switch); 2–N → a trigger → searchable `Popover` list (search appears
past `searchThreshold`, default 7). Selected row is selection-as-raise. Region
grouping / multi-select aggregate / saved scopes are the documented next step,
gated on adding region metadata to the locations store.

### `SaveDock` + `useSaveState` — the editor save language

`v2/ui/SaveDock.tsx` (`.v2-savedock`). The **one** save surface for editor pages
(Menu, Recipes, Growth, Users…): a transient pill-bar pinned bottom-centre that
exists **only while dirty** (or while a save resolves), portaled to
`#admin-portal-root` (Rule #4) and floating on `--shadow-md` (elevation = "this is
transient / above", per [material → elevation](./material.md)). States:
`dirty → saving → saved (auto-dismiss 1.5s) → idle`, plus a persistent `error`
with Retry. `useSaveState(saveFn)` drives the saving/saved/error transitions;
dirtiness stays page-owned. **Settings/toggles never use this** — they autosave
(Rule #7). Replaces the parked, perpetually-disabled hero Save button.

### `PageLoading` — the one loading state

`v2/ui/PageLoading.tsx`. Wraps the `.v2-page-loading` pill and **guarantees the
`.v2-page` wrapper** (the mobile-pill trap — see [Loading states](#loading-states--the-v2-page-loading-pill)).
`<PageLoading name="Orders" />` for a sole render; add `inline` when page chrome
already renders. Replaces the hand-written `Loading X…` early-returns that drifted
(bare "Loading…", missing wrappers).

## Iconography — custom stroke, no emoji in UI

- Inline SVG, `stroke: currentColor`, `fill: none`,
  `stroke-width: 1.5–1.8`, `stroke-linecap: round`,
  `stroke-linejoin: round`.
- The `.icn` / `.i` classes set default sizing (14–16px).
- **Never emoji in UI chrome.** Two narrow exceptions:
  1. Genuine **chat content** — a customer message containing 🥂 / 🍕 must
     render verbatim, it's real WhatsApp text.
  2. **EU-14 allergen pictograms** in the Concierge matrix
     (🌾 🥛 🥚 🥜 🐟 …) — a recognised domain language, matches the live app.

For everything else (capability icons, quick-action chips, identity icons,
pin, reset, tender buttons, product-card category accents) — use a custom
stroke icon.

## Toggles

`.v2-switch` (the `Switch` primitive, `v2/ui/Switch.tsx`) — a 40×22 pill,
`role="switch"`. Off = `--surface-3` track + `--border` hairline + `--fg-subtle`
thumb; on = `--success-soft` track + `--success` border-mix + `--success` thumb,
thumb travels 18px on `--duration-base`/`--ease`. The green "on" reads as a
live/enabled state and keeps "brand" reserved for primary actions.

**On/off settings always use `Switch`, never a native `<input type="checkbox">`.**
A native checkbox is reserved for **genuine multi-select** (picking several items
in a list — table row-select, menu modifiers, bundle item pickers), not a switch.
If a control means "enabled / disabled," it's a Switch. Toggle = saved: persist
immediately on change, no separate Save button — see `CLAUDE.md` rule #7. (The
whole admin Settings page follows this — every sandbox/layout toggle is a `Switch`.)

The native checkboxes/radios that remain (the genuine multi-select ones) are
brand-tinted globally via `accent-color: var(--brand)` scoped to
`[data-admin-theme]`, so no raw blue OS control appears in admin chrome.

## Component checklist (when building a new one)

- [ ] All colour from tokens (no inline hex)
- [ ] Radius from the scale (7px button / 12px card / etc.)
- [ ] Spacing on the 8px grid
- [ ] `tabular-nums` if it renders any digits
- [ ] Focus ring uses `--border-focus` (steel)
- [ ] No gradient, no coloured glow shadow
- [ ] If interactive: subtle `:active` press, no flashy hover
- [ ] If has emoji: confirm it's content or allergen, not UI chrome
- [ ] If it early-returns a `.v2-page-loading` pill: wrapped in `.v2-page` (see [Loading states](#loading-states--the-v2-page-loading-pill))
