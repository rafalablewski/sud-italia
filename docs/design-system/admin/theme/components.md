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

- Portaled to `document.body`. The admin layout traps fixed elements
  otherwise — see `CLAUDE.md` rule #4.
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
  explanation won't compile. The individual blocks (`InstitutionalAnalysis` /
  `PlainTalk` / `Tips` / `Methodology`) are exported for the page-level "How to
  read these numbers" / "How this projects" cards; `Tips` defaults its
  headline to "Tips — how to push this lever" (override via the `headline`
  prop). The Calculator's `HELP` registry is the origin of this vocabulary and
  imports the same shared blocks.
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
  fixed `.kds-core` overlay and AdminShell drops the `.v2-shell` chrome, so
  there's no `.v2-page` to drop the pill into and rendering it inline traps it
  in the `.admin-bg > *` stacking context (rule #4). Portal it instead:
  `createPortal(<div className="v2-page-loading">…</div>, document.getElementById("admin-portal-root") ?? document.body)`,
  gated on a client `mounted` flag. `#admin-portal-root` is the admin layout
  wrapper (`src/app/admin/layout.tsx`) — an ancestor of `.admin-bg` (escapes the
  trap), with no transform (the fixed pill anchors to the viewport), that holds
  the `--font-admin-*` next/font vars. **Do not portal to `<body>`:** it's
  outside that font scope, so `var(--font-ui)` can't resolve and the pill
  renders in the browser-default **serif** (`AdminKDS`/`AdminKdsFleet` hit
  exactly this). See [KDS → Loading pill](../../core/modules/kds.md#loading-pill).

The pill **declares `font-family: var(--font-ui)` itself** so it doesn't depend
on inheriting Inter from a `.v2-shell` ancestor — required for the portaled
core-route case above, harmless everywhere else (it already resolves to Inter
inside the shell).

## Tables

- **48px row baseline.** Convergence target across Orders / Customers /
  Loyalty / Staff (some still drift 40–60px — see [`backlog.md`](../../backlog.md)).
- `tabular-nums` on every numeric column.
- Hairline `--border` between rows. Hover lifts the row background only.
- Column header eyebrows: `11px uppercase 600 / .08em tracked` in
  `--fg-subtle`.

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
