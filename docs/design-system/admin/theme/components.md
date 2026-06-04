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

- **`.v2-input` / `.glass-input`** — surface-2 background → surface-1 on
  focus, steel focus ring + 3px soft halo. **8px radius.** Height 36px.
- **`.seg`** segmented — 3px-padded track, selected tab gets `--surface-3`
  fill + `--shadow-xs`. Used for stage switches (KDS), period filters
  (CRM), fulfilment channels (POS), MCP/WhatsApp transports (Concierge).
- **`.viewswitch`** — the shared **role/view** switcher (KDS Fleet / Floor /
  Chef, Guest Inbox / Guests / Concierge). Same look as `.seg` so the suite
  reads as one product.

## Location filter — one component, one look

Live code: `src/components/admin/v2/ui/LocationFilter.tsx` (exported from the
`v2/ui` barrel). **This is the only way to let an `/admin/*` page filter by
site**, and it renders **one thing everywhere: a pill row** (`MapPin` + city,
the selected pill in `--brand-soft`). It replaced two drifting patterns — the
hand-rolled `LocationTabs` pills and the inline `v2-field-inline` + `Select`
block copy-pasted into a dozen page headers — so every page now looks
identical, operational views and selling-rule editors alike.

**There is deliberately no `variant` prop.** A second rendering mode (a
dropdown) is exactly how the original drift started; one look is the whole
point. If a future need can't be met by pills, change the component once — for
everyone — rather than reintroducing a per-page branch.

It is **controlled** (`value` / `onChange`) and derives its option list from
`getActiveLocations()`, so a page never hand-builds `{ value, label }` arrays.
Wire it to whatever state the page already holds (page-local `pageLoc`, or the
sidebar's `useAdminLocation()` context).

```tsx
// every page — operational views and config editors
<LocationFilter value={pageLoc} onChange={setPageLoc} />
```

Live on: HACCP, Cash, Schedule, Slots, Floor, Inventory, Purchase orders,
Truck ops, Waste, Handover, Upsell, Cross-sell, Scheduled bundles.

Props worth knowing:

- `includeAll` (+ `allLabel`) — prepend an "all locations" pill (slug `""`).
  Off by default; operational views that can't span sites leave it off.
- `icon` — defaults to `MapPin`. **Keep it MapPin** for cross-page
  consistency; the override exists only for genuinely different contexts.

**Not the same as the sidebar switcher.** `v2/LocationSwitcher.tsx` is the
**app-wide** location selector in the shell (backed by `useAdminLocation()`,
persisted to `localStorage`). `LocationFilter` is the **per-page** filter. They
coexist on purpose: the sidebar sets a global default; a page may still scope
itself locally. Don't fold one into the other.

## Cards

### General card — `.v2-card` / `.glass-card`

```
background: var(--surface-1)
border: 1px solid var(--border)
border-radius: var(--radius-lg)              /* 12px */
box-shadow: var(--shadow-xs), inset 0 1px 0 rgba(255,255,255,.04)
```

The `inset 0 1px 0 …` is the **1px hairline top-light** — a refined
material touch, not a gradient. Hover lifts the border, not the whole card.

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
- **Footer:** `LocationSwitcher` + Log out, on every surface (POS/Guest gained
  these; the old core avatar foot is retired).
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
  radius clip the corners. See [material → Nested surfaces](./material.md#nested-surfaces--one-border-per-box)
  and the live use in `AdminDashboard.tsx` (Location performance).

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

`.sw-toggle` — 38×22 pill, off = `--surface-3` + `--border-strong`, on =
`--brand` + transparent border, thumb fades from `--fg-muted` to white.
Toggle = saved (persist immediately, no separate Save button) — see
`CLAUDE.md` rule #7.

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
