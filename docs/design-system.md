# Sud Italia — Design System

The shared visual + interaction language for the whole operating system: POS,
KDS, CRM, Concierge, WhatsApp, and every admin surface, plus the guest
storefront.

**Code is the source of truth.** The canonical tokens live in
`src/app/globals.css` (the `[data-admin-theme]` blocks + the `:root --cmd-*`
command palette + the public `@theme inline` tokens) and are mirrored for
JS/Recharts in `src/components/admin/v2/theme.ts`. The current mockup target
lives at `public/mockups/core-suite/` — open **`/mockups/core-suite/index.html`**
on any deploy.

---

## 1. Philosophy

Three ideas held together:

1. **Dieter Rams — "as little design as possible."** Every element earns its
   place. Hairlines, not boxes. Shadows describe elevation, not drama.
2. **Jony Ive — soul through obsession.** Restraint is not sterility. Warmth in
   the palette, an optical serif on the wordmark, the easing curve of a
   panel — that's where the product feels considered.
3. **Quiet power.** The system should feel like a proprietary advantage —
   calm, fast, certain — never loud. Confidence shown by how little it needs.

**Operating principle that resolves conflicts:**

> *In high-pressure surfaces (POS, KDS) operational clarity outranks brand
> expression. In exploratory surfaces (CRM, Concierge, dashboards) beauty is
> allowed to breathe.*

When a kitchen ticket and a guest profile disagree about how loud a colour
should be, the kitchen wins on its own screen and the guest profile wins on
hers.

### Investment-grade, not consumer-friendly

The visual target is Bloomberg / Linear / Stripe Dashboard — **flat solids,
precise hairlines, neutral shadows, restrained colour, considered typography.**
Not gradients, not glow shadows, not glossy sheens, not playful emoji in UI.

---

## 2. Colour

One signature accent (**deep burgundy / oxblood**), one metallic
(**champagne platinum**), a calm steel-blue for focus/info, and a disciplined
semantic set. Burgundy matures the old Italia red into fine-dining territory
and finally separates *brand* from *danger*.

### Dark (canonical) — `[data-admin-theme="dark"]`

| Role | Token | Value |
|---|---|---|
| Page background | `--bg` | `#0c0b0e` (warm-neutral charcoal) |
| Sidebar / modal | `--surface-1` | `#17161c` |
| Input / inset | `--surface-2` | `#1d1b23` |
| Active / raised | `--surface-3` | `#262430` |
| Hover | `--surface-hover` | `#2f2c39` |
| Hairline | `--border` | `rgba(255,255,255,.10)` |
| Strong hairline | `--border-strong` | `rgba(255,255,255,.16)` |
| Text | `--fg` | `#f5f3ee` (warm off-white) |
| Text muted | `--fg-muted` | `#c0b9b0` |
| Text subtle | `--fg-subtle` | `#978e85` |
| **Brand** | `--brand` | **`#a62d49`** burgundy |
| **Platinum** | `--platinum` | **`#cbb48a`** |
| Focus / info | `--border-focus` / `--info` | `#8fa9c9` / `#6e92c0` |
| Success | `--success` | `#2fa875` |
| Warning | `--warning` | `#d9a441` |
| Danger | `--danger` | `#e2504b` |

### Light theme — `[data-admin-theme="light"]`

Same DNA on warm paper: `--bg #faf7f2`, `--surface-1 #ffffff`, `--fg #1c1815`,
`--brand #97283f`, `--platinum #9c7e4e`, `--info #3f6493`. Light mode is
**opt-in only** — the boot script in `theme.ts` does not honour
`prefers-color-scheme`, so operators never hit a half-lit surface by accident.

### Command palette — `:root --cmd-*` and `.kds-floor-dark`

Always-dark surface shared by KDS Fleet/Floor/Chef + POS till + CRM/Concierge/
WhatsApp command boards. Warm-neutral, matched to the canonical dark theme so
all "command" surfaces read as one product:
`--cmd-canvas #0a0a0c · --cmd-panel #141318 · --cmd-raised #222028 ·
--cmd-text #f1efe9 · --cmd-dim #b6afa6 · --cmd-faint #918880`.

Status: `--cmd-warn #e0a93f · --cmd-late #e5484d · --cmd-ready #3dd68c ·
--cmd-firing #4d90e8 · --cmd-risk #9a72e0`. Status hues exist for data-viz
(health rings, pace gauges) but **are not used as ticket-status colour** —
see KDS rules below.

### Colour rules

- **Never hardcode a brand/semantic hex in a component.** Read the token. The
  one exception: status *text* on soft badge fills uses a brighter hex to
  hold ≥4.5:1 contrast on dark.
- **No gradients.** Flat solids only. No `linear-gradient` fills, no decorative
  `radial-gradient`, no colored glow shadows (no burgundy / brand-tinted
  `box-shadow`). Neutral elevation shadows are fine; subtle 1px inset
  highlights on cards are fine (they're hairlines, not gradients).
- **Platinum is jewellery, not paint.** Use it for hairlines, the wordmark
  mark, owner-tier flourishes, key numerals, the "all-together" course tag —
  never as a fill or action colour.
- **Burgundy is brand, never status.** A red ticket means *late*, not *brand*.
- Soft tints come from `--brand-soft`, `--warning-soft`, etc.; RGB-triplet
  siblings (`--admin-accent: 166,45,73`, etc.) exist only so
  `rgba(var(--x), a)` overlays line up.

### Data visualisation

Categorical palette is burgundy-led and harmonised (see `theme.ts` `chart`):
`#a62d49, #cbb48a, #6e92c0, #2fa875, #c77f4a, #8e6fb0, #d98aa0, #7fa86b`.
Sequential ramps interpolate within a single hue (burgundy or steel) — never
rainbow. Gridlines use the hairline alpha; axes use `--fg-subtle`.

---

## 3. Typography

Loaded via `next/font` in `src/app/layout.tsx`. Previously named but never
imported — everything fell back to system fonts. Now real fonts ship.

- **Inter** (`--font-inter` → `--font-ui`) — the UI workhorse. All operational
  text: tables, tickets, forms, prices, KDS chrome.
- **Fraunces** (`--font-fraunces` → `--font-display`) — a high-contrast optical
  serif. The product's soul. **Reserved for**: the wordmark, hero headings,
  large display numerals (KPIs), **and the dish name** (POS product cards,
  KDS ticket items). *Never* used in dense operational chrome.
- **JetBrains Mono** (`--font-mono`) — IDs, timers, prices, tabular numerals.

Type scale on `[data-admin-theme]`: `--text-2xs` 11px → `--text-4xl` 40px,
base **14px**. Use the tokens, not literal rem values. **Tabular numerals**
(`font-variant-numeric: tabular-nums`) on every metric, price, timer.

### Where each face goes

| Element | Face |
|---|---|
| Wordmark, hero titles, large KPIs | Fraunces |
| POS dish name / KDS dish name | Fraunces (the only operational use) |
| Modifier text under a dish ("+ extra 'nduja") | Fraunces italic (amber) |
| Everything else operational | Inter |
| Timers, prices, IDs, tabular figures | JetBrains Mono |

Letter-spacing: `-0.005em` on UI text, `.04em–.14em` uppercase eyebrows /
small caps labels (tracked).

---

## 4. Material — depth, hairlines, radius, motion

- **Flat solids, hairlines for separation.** No surface gradients. Cards are
  `var(--surface-1)` + 1px `var(--border)` + `var(--shadow-xs)` + an optional
  1px inset top-light (`inset 0 1px 0 rgba(255,255,255,.04)` — this is a
  hairline, not a gradient).
- **Elevation = surface step + neutral shadow.** Raise a surface (e.g.
  surface-1 → surface-2) *and* deepen its shadow. Coloured glow shadows are
  forbidden.
- **Radii — tight, not friendly.**
  - Buttons / inputs / chips: **7–8px** (`--radius-sm`–`--radius-md`).
  - Cards: **10–12px** (`--radius-lg`).
  - Pills (badges, status chips, eyebrows): full radius / 4px squared for
    refined-investment-grade tags.
- **Motion** — `--duration-fast` 120ms / `--duration-base` 200ms /
  `--duration-slow` 320ms, easing `cubic-bezier(0.32,0.72,0,1)`.
  - *Operational* (POS, KDS): fast or none. 200ms is the ceiling. Never
    animate a ticket's position in a way that delays reading it.
  - *Exploratory* (CRM, Concierge, dashboards, storefront): the full,
    buttery range — panels slide, numbers count up, charts draw in.
  - Everything respects `prefers-reduced-motion`.

---

## 5. Components

The v2 library lives in `src/components/admin/v2/ui/`. All components read
tokens; none hardcode colour.

### Buttons — investment-grade

`.v2-btn-*` and `.glass-btn-*` share the same refined treatment:

- **7px radius**, hairline `border-strong` on secondary, a *darker* 1px
  defining edge on filled (`color-mix(brand 74%, black)`).
- **No glossy top-light sheen, no glow shadow.** Flat fills.
- Letter-spacing `-0.005em`. Centered label.
- Sizes: `sm` (26px) · `md` (34px) · `lg` (42px). Hero CTAs (Charge, Mark
  ready) get `xl` height ~46px when needed.
- Variants: `primary` (burgundy fill, darker edge), `secondary` (surface-2 +
  strong hairline), `ghost` (transparent + hairline), `danger`, `success`.
- One primary per view. Subtle `:active { transform: translateY(0.5px) }`.

### Badges / pills

- Default `.v2-badge` / `.badge`: small soft fill (`--*-soft` token) +
  brighter hex text for ≥4.5:1 contrast on dark. Tones: brand, platinum,
  info (steel), success, warning, danger, neutral.
- **Product-card category badges** (POS): refined — 18px tall, 4px corners
  (squared, not pills), `9px / weight 600 / .09em / uppercase`.
- **Role badges** (Hero/Profit/Signature): same squared chip, semantic tone
  (brand-soft / success-soft / platinum-soft).
- **Course chip** (KDS dine-in tickets): outline chip with `--hair-2` border;
  text "1 · Starters" / "2 · Mains" / "3 · Dessert". The platinum-bordered
  variant `.course.together` marks an "All together" ticket.

### Iconography — custom stroke, no emoji in UI

- Inline SVG stroke icons, `currentColor`, `stroke-width: 1.5–1.8`,
  `stroke-linecap: round`. The `.icn` / `.i` classes set sizing (14–16px
  default).
- **Never emoji in UI.** Replaced everywhere: capability icons, quick-action
  chips, identity icons, pin, reset, allergen warnings, tender buttons,
  product-card "photo" placeholders.
- Two narrow exceptions:
  1. **Genuine chat content** (a customer message containing 🥂 / 🍕) — those
     are real WhatsApp text and must render verbatim.
  2. **EU-14 allergen pictograms** in the Concierge matrix (🌾 🥛 🥚 🥜 🐟) —
     these match the live app's allergen convention and are a recognised
     domain language.

### Inputs / segmented controls

- `.v2-input` / `.glass-input`: surface-2 → surface-1 on focus, steel focus
  ring + 3px soft halo. 8px radius.
- `.seg` segmented (3-px padded track): selected tab gets `--surface-3` fill
  + `--shadow-xs`. Used for stage switches (KDS), period (Customers),
  fulfillment channels (POS), MCP/WhatsApp (Concierge).
- `.viewswitch` is the shared role/view switcher (KDS Fleet/Floor/Chef,
  Guest Inbox/Guests/Concierge) — same treatment as `.seg`.

### Card surfaces

- **Text-forward by default for menu/product cards** until real photography
  exists. The empty image-box pattern is forbidden — it reads as a wireframe
  placeholder. Lead with the dish name (Fraunces) + a line of menu copy,
  category + price at the bottom row pinned via `margin-top: auto`, with the
  category icon demoted to a 17px quiet accent next to the name.
- **Reserve a 2-line minimum height** on dish names so 1-line and 2-line
  names produce identical card heights (and the price row sits in the same
  place across every card). Reserve a 2-line min-height on the description
  too.

### Tables

- **48px row baseline** is the target across modules. Use `tabular-nums` on
  every numeric column. Hairline `--border` between rows. Hover lifts the row
  bg, not the whole row.

### Dialogs / overlays

- Portaled to `document.body` (admin layout traps fixed elements otherwise —
  see `CLAUDE.md` rule #4). `--shadow-lg` + `border-strong`. Backdrop:
  `rgba(0,0,0,.55)` + `backdrop-filter: saturate(120%) blur(4px)`.

---

## 6. Unified experience strategy — the density spectrum

Every module shares the **AdminShell** (`src/components/admin/v2/AdminShell.tsx`):
248px sidebar, glass topbar, single nav source of truth
(`nav.config.ts`). What differs per module is *density and tempo*, not the
language:

```
   glanceable / instant ←─────────────────────────→ exploratory / beautiful
   KDS ── POS ── Orders ── Inventory ── Reports ── Dashboard ── CRM ── Concierge
   (full brightness        (fast, dense          (data-viz       (whitespace,
    status, fast sans,      tables, one-tap       breathes)        serif accents,
    no animation,           actions,                              motion)
    colour=signal only)     no chrome)
```

Same tokens, same components — the spectrum is achieved by *how much* of the
system each surface uses, not by forking it.

---

## 7. Module rules

### 7.1 KDS — calm monochrome, colour reserved for exceptions

The single hardest rule in the system, and the most important.

- **Tickets are neutral by default.** No per-lane left-bar colour (no candy
  blue for "firing", no purple for "risk"). The thin left accent **only**
  turns:
  - `--warn` (amber) — approaching SLA / at-risk
  - `--late` (red) — late (the only loud signal; a faint outline glow, not a
    big blur)
  - `--ready` (calm muted green) — done, de-emphasised
- **Timers / SLA bars** are `--dim` (neutral) until they degrade; then warn,
  then late. Same logic.
- **Lane headers are monochrome.** The active lane gets the single platinum
  hairline under its rule — the one signature touch.
- **Bump buttons are refined neutral** (raised + crisp border + bright text).
  Late ticket's bump gets a red-tinted edge. No candy green/blue fills.
- **Dish names in Fraunces serif italic for modifiers** ("+ extra 'nduja ·
  well-fired"). The hero content of each ticket reads like a refined menu
  card, not a spreadsheet row.
- **ETA in the footer**, not a separate top line. Format
  `"Ready in ~9 min"` / `"Over promise · ~4 min"` / `"At risk · miss by ~2
  min"` / `"Ready for expo"` — the label sits with the SLA bar (its natural
  home), bump button full-width below.
- **Roles drive the view.** Owner → Fleet wall (data-viz, drill into floor).
  Manager → Floor board (ops header + 86 management + recall). Kitchen/staff
  → Chef line (station focus + stage switcher + sound + fullscreen).
- **Scroll model.** The board scrolls as **one page** (no per-lane internal
  scroll). The top controls + lane headers stick. `flex:none` on tickets so
  they never get squashed.
- **Course tag on dine-in tickets.** `1 · Starters` / `2 · Mains` /
  `3 · Dessert` outline chip next to the fulfilment type. `All together`
  uses a platinum-bordered variant + a hint line: *"Fire whole table at
  once · no holds."* A coursed ticket includes the context:
  *"Course 2 of 3 · starters away · dessert held."*
- **Group items by course.** Section headers within a ticket use course
  names (Starters / Mains / Dessert), not station names (Pizza / Antipasti),
  so every check reads as the courses the line is firing.

### 7.2 POS — fast, dense, calm

- **Two-pane, iPad-first.** Vertical category rail (short thumb travel) +
  menu grid + a *persistent* live ticket. The ticket never disappears.
- **One primary action.** Charge is burgundy, full-width xl. Send-to-KDS and
  Park are secondary.
- **Menu cards are text-forward** (no fake image tile until real
  photography). Name (Fraunces) is the hero; a line of menu copy fills the
  card; category icon is a 17px accent; refined squared uppercase badges.
- **Reserved card heights** (2-line name + 2-line desc + pinned price row)
  so the price sits in the same place on every card.
- **Coursing — dine-in only.**
  - Order-level "Kitchen timing" toggle: *Coursed* vs *All together*.
  - Lines grouped into Starters / Mains / Dessert / Drinks sections.
  - Each course has a state: **Fired** (with timestamp), a **Fire course**
    button, or **Holding**.
  - Lines are draggable between courses (HTML5 drag-and-drop, wired via a
    small inline script — permitted by the `/mockups/*` CSP).
- **Live pace steering.** A warning strip surfaces the bottleneck station
  with capacity-true promise times per category and per-product
  "make-now / ease" badges. The ticket carries a `"Ready ~16 min"` /
  `"Mains firing · ~14 min"` promise badge.
- **Tabular tab rail.** Concurrent open checks across the top, each with
  status pill (Open / Ready·Pay / Parked), summary stats above the rail.
- **Real fullscreen button** wired via inline JS (`requestFullscreen`).

### 7.3 CRM (Guest hub / Guests) — exploratory, relationship-rich

- **Three-pane.** Conversation / transcript / live guest profile.
- **Relationship health gauge** + RFM bars + Next-Best-Action with churn-risk
  %. Identity-signal graph (phone, email, WhatsApp). Favourites,
  completeness meter, consent toggles, GDPR export/erase.
- **Per-customer compose** (SMS/email), consent-gated, rate-limited.
- **Birthday/anniversary triggers** strip at top of the customer book.
- **Filters**: segment chips (All/VIP/Active/Repeat/New/Lapsed/Members/
  Contacts/No-email/Cancellations) · channel · period · sort.
- **Lifecycle**: new (0 orders) · active (≤30d) · repeat (≥2 orders) ·
  lapsed (>90d) — derived consistently in `/api/admin/customers` + `/crm`.

### 7.4 Concierge — AI capability layer

- 6 toggleable capabilities (get_menu, check_availability, get_allergens,
  place_order, create_payment, locate_truck), per-capability enable/disable
  with optimistic toast + persist via `PATCH /api/admin/concierge`.
- **Live test runner** — pick a capability + location, fire `GET /api/agent/
  <cap>`, inspect the JSON.
- **EU-14 allergen matrix** (the one place emoji is retained — domain
  convention).
- **MCP / WhatsApp transport toggle** at the top.

### 7.5 WhatsApp — messaging centre

- **Inbox tabs**: All / Live / Awaiting pay / Archived, with live counts.
- **Per-conversation funnel ladder** (location → cart → fulfillment → slot →
  payment) + active-order context (cart subtotal, fulfillment, slot,
  pay-link).
- **24h window state** prominently shown — free-text only inside, template
  only outside.
- **Operator quick-actions**: payment link, reservation, comp dessert,
  re-open template, reset session.
- **Broadcast composer** with segment targeting + batched send + cron drain.
- **Conversion-funnel analytics** dialog (7d / 30d / All) with stage
  drop-off + biggest-leak callout.
- **Settings hub** — business hours, AI concierge, auto-replies, abandoned
  cart, scripted flows.

---

## 8. Example-order canonicalisation

The mockups carry a coherent narrative; if you change one, change all:

- **Table 7** (Lucia Bianchi, 2 covers, anniversary) — order **#4821**, dine-in,
  slot 20:00. Coursed: Starters fired 19:44 (Bruschetta, Burrata), Mains
  firing (Margherita ×2, Diavola +nduja, Bufala DOP), Dessert held (Tiramisù),
  Drinks sent (San Pellegrino ×2). Subtotal **304 zł** · combo **−8** · loyalty
  Gold **−15.20** · total **280.80 zł** (display **281** in tab card).
- **Table 9** (#4823) — dine-in, **All together** course example: Bruschetta
  + Marinara + Capricciosa + Tiramisù.
- **Table 5** (#4825) — standalone **Starters** course example.
- **Table 2** (#4820), **Table 3** (#4816 ready) — additional mains tickets.
- **#4818** (delivery, late, Diavola + 'Nduja & Honey) — the late-ticket
  alarm example.
- One order = one number. KDS tickets carry the same order id the POS shows
  in tender + the Guest hub shows as "pending order".

---

## 9. Not-yet-shipped backlog

In rough priority order:

1. **Converge table row heights** to a 48px baseline across Orders /
   Customers / Loyalty / Staff (currently 40–60px).
2. **Tokenise inline `font-size`** literals in legacy admin `.tsx` (e.g.
   `AdminDashboard.tsx`) — replace `"0.75rem"` with `var(--text-xs)`. Low
   risk; do incrementally with visual checks.
3. **Mobile variants** for `/admin/capabilities` and `/admin/ai` (no
   `Mobile*` split today — desktop-only on phones).
4. **React port of the locked mockups** — POS first, then KDS, then the
   Guest hub. With a live `npm run dev` preview loop.
5. **Storefront depth pass** — apply Fraunces hero treatment + burgundy
   CTAs intentionally per section (the foundation already cascaded the
   tokens/fonts).
6. **Real food photography** — when it arrives, reintroduce the image
   region deliberately on the POS product card. Do not design around a fake
   image box until then.

---

## 10. How to extend without drifting

- **Add a colour?** It goes in **both** `[data-admin-theme]` blocks **and**
  `theme.ts`, plus an `--admin-*` triplet if overlays need it. Never inline.
- **Add a surface?** Use an existing `--surface-*`; don't invent a new
  grey.
- **New admin page?** Register it in `/admin/capabilities` (CLAUDE.md
  rule #9) and frame it in `AdminShell` with a `.v2-page-header`.
- **Reach for Fraunces?** Only if it's a wordmark, a hero, a display
  numeral, or a dish name. When in doubt, it's Inter.
- **Adding colour to a KDS ticket?** Stop. Re-read §7.1. Status escalates
  amber → red; everything else is neutral.
- **Gradient or coloured glow?** No. Use a flat solid + a defining 1px
  border + (if elevation is needed) a neutral `--shadow-*`.
- **Big empty image tile?** No. Go text-forward until you have real photos.
- **Emoji in the UI?** No. Use a stroke icon. Emoji are reserved for
  user-generated chat content and the EU-14 allergen matrix.

---

## 11. Where the mockups are

`public/mockups/core-suite/` — open `/mockups/core-suite/index.html` on any
deploy:

- `pos.html` — POS (text-forward cards, coursing, drag-to-recourse, tender).
- `kds-fleet.html` → `kds.html` → `kds-chef.html` — KDS role triad.
- `guest.html` → `guest-crm.html` → `guest-concierge.html` — unified hub.
- `guest-settings.html` / `guest-broadcast.html` / `guest-funnel.html` —
  WhatsApp secondary surfaces.
- `pos-tender.html` / `pos-tables.html` — POS overlays.

The mockups use the **real** shipped tokens (`system.css` mirrors
`globals.css`) so what you see is what's deployable. Per `/mockups/` CSP,
inline JS is permitted — used for the POS drag-and-drop and the fullscreen
toggle.
