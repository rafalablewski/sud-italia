# Homepage — Components

← back to [Homepage README](../README.md)

The primitive vocabulary the storefront composes from. Same rule as
the other themes: **don't add casually**. Every Homepage primitive
lands on a brand surface where the guest is judging the operation.

## Operator-controlled visibility — `<LayoutGate />`

`src/components/layout/LayoutGate.tsx`. The client wrapper that lets
an operator turn any storefront component on or off from
`/admin/settings → Layout` without touching code.

```tsx
<LayoutGate flag="showBundlesShowcase">
  <BundlesShowcase />
</LayoutGate>
```

- Fetches `/api/settings/public` on mount (single-flight cache via
  `fetchPublicSettings()`), reads the named flag in `data.layout`.
- If `false`, returns `null` — the wrapped subtree drops out of the DOM
  (no painted CSS, no event listeners, no layout impact).
- If `true`, `undefined`, or the fetch fails, renders children — the
  fail-open default protects the storefront when settings are briefly
  unavailable.
- Works for both client and server children: the server still renders
  the child HTML inside the client boundary; the gate decides at
  hydrate time whether to keep it mounted.

The full list of supported flags is the union of `LayoutSettings` in
`src/lib/store.ts`. Adding a new toggle is three steps documented in
[`../../admin/sections/system.md`](../../admin/sections/system.md).
This is the storefront's CMS-style operator-visibility primitive —
every operator-toggleable storefront component should wrap through it
rather than rolling its own visibility logic.

## Form primitives (`.pub-*`)

The form-element classes declared in `themes/homepage/index.css`. Used
by every input on the storefront — cart drawer, address forms,
identity capture, notify-me forms.

### `.pub-input` / `.pub-select`

The standard text + select field.

- `width: 100%; padding: 0.625rem 0.875rem;`
- `border: 1.5px solid #e5e7eb; border-radius: 0.75rem;`
- `font-size: 0.875rem;` (14px — `body-sm` from typography)
- `background: #fff;` (white card on cream)
- Focus state: `border-color: var(--color-italia-red); outline: none;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-italia-red)
  12%, transparent);` — the brand-red ring is the storefront's
  consistent focus signal.

### `.pub-label`

The label that sits above a `.pub-input`.

- `display: block; font-size: 0.875rem; font-weight: 500;
  color: var(--color-foreground); margin-bottom: 0.375rem;`
- Lora 500, sentence case.

### `.pub-card`

Generic card container — used by the order-confirmation summary, the
rewards tier card.

- `background: #fff; border: 1px solid #f3f4f6;
  border-radius: 1rem;` (16px)
- Resting `box-shadow: 0 1px 3px rgba(0,0,0,0.04);`
- Hover: `box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform:
  translateY(-1px);`

## Shared UI components (in `src/components/ui/`)

These are JSX components shared across the storefront and (sparingly)
admin. They render Tailwind utilities that compile from the
`@theme inline` tokens.

### `<Button />` — `src/components/ui/Button.tsx`

The standard CTA button.

- **Primary variant:** `bg-italia-red text-white
  hover:bg-italia-red-dark active:bg-italia-red-dark` —
  burgundy fill, white text. The brand CTA.
- **Secondary variant:** `bg-white text-italia-red
  border border-italia-red hover:bg-italia-red/5` — outlined.
- **Ghost variant:** `text-italia-red hover:bg-italia-red/5` —
  text only.
- **Sizes:** `sm` (12px text, 8px / 16px padding), `md` (14px text,
  10px / 20px), `lg` (16px text, 12px / 24px), `xl` (18px text, 16px
  / 32px — hero CTA).
- All variants: 12px radius (rounded fully — `9999px` — for the
  hero CTA only).

### `<Sheet />` — `src/components/ui/Sheet.tsx`

The bottom-sheet / side-drawer primitive used by the cart drawer,
item detail drawer, mobile menus.

- Portalled to `document.body` (CLAUDE rule 4).
- Backdrop: `rgba(0,0,0,0.4)` scrim, tap-to-close.
- Enter motion: `--animate-slide-up-sheet` (350ms cubic-bezier).
- Title row: Cormorant Garamond 600 (`font-heading`), close button right.
- Body scrolls; footer is sticky for action affordances.

### `<Container />` — `src/components/ui/Container.tsx`

The page-width wrapper. `max-w-[1200px] mx-auto px-6`. Every section
on the storefront wraps in `<Container />` for consistent gutter.

### `<StarRating />` — `src/components/rating/StarRating.tsx`

The 5-star display for feedback + reviews.

- Filled star: `fill-italia-gold text-italia-gold`.
- Empty star: `fill-transparent text-italia-gold` (outline only).
- Half star supported via SVG mask.
- Inline rating count: `text-italia-gray` at body-sm.

### `<CurrencySwitcher />` — `src/components/ui/CurrencySwitcher.tsx`

The currency picker (governed by `showCurrencySwitcher` in admin
Settings → Layout — when off, the component returns `null` and the
storefront falls back to PLN).

- **V8 pill segmented control.** Symbol-only buttons (zł / € / $ / S$)
  inside a basil-tinted pill — the sibling of `<LanguageSwitcher />`,
  in green. Single-row, no dropdown — V8 trades discoverability for
  glanceability so the top nav reads at a tap.
- Active option: basil fill + parchment text + subtle 0 1px 2px basil
  drop. Inactive: muted-brown text on the basil-tinted background.
- Honours `enabledCurrencies` from public settings; disabled currencies
  drop out of the row.
- Selected currency persists via the customer cookie (same `setCurrency`
  helper as before). Picking a non-current option triggers a full
  reload so every SSR'd `formatPrice()` re-renders.

### `<LanguageSwitcher />` — `src/components/ui/LanguageSwitcher.tsx`

The language picker (governed by `showLanguageSwitcher` in admin
Settings → Layout).

- **V8 pill segmented control.** Two-letter codes (EN / PL / DE / SG)
  inside a terracotta-tinted pill — left-sibling of `<CurrencySwitcher />`.
  Single-row, no dropdown.
- Active option: terracotta fill + parchment text + subtle 0 1px 2px
  oxblood drop. Inactive: muted-brown text on the terracotta-tinted
  background.
- Honours `enabledLocales` from public settings; disabled locales drop
  out of the row.
- Picking a non-current option calls `setLocale()` then full-reloads so
  every SSR string re-renders in the new locale.

## Storefront chrome — Header + LiveTicker

The storefront's two persistent layout slabs sit at the top of every
`(public)` route. Markup in `src/components/layout/`. Custom styling
under the `.v8-*` selectors in `themes/homepage/index.css`.

### `<Header />` — `src/components/layout/Header.tsx`

The V8 Trattoria top nav.

- **Sticky parchment-gradient bar** (`linear-gradient(180deg, rgba(248,
  239,222,0.98), rgba(248,239,222,0.88))` + 8px backdrop blur), line-soft
  hairline border-bottom. Adds a subtle warm-brown drop shadow once the
  page is scrolled (`.v8-nav-scrolled`). Measured at **98px tall** at
  ≥md (basil-mark 38px + wordmark 24px + italic sublabel 11.5px +
  vertical padding). `--v8-nav-height` (in `themes/homepage/index.css`)
  is set to `100px` to round up and is used for `scroll-padding-top`
  on `<html>` so every storefront anchor link (`#locations`,
  `#bundles`, the hero's `#famiglia` button, etc.) clears the sticky
  nav by 2px instead of landing under it. **If you change the nav
  layout in a way that affects its rendered height, update
  `--v8-nav-height` to match — otherwise anchor scrolls regress.**
- **Brand block (left):** basil-sprig SVG mark that rotates `-8°` on
  hover (`.v8-brand:hover .v8-brand-mark`) + the wordmark "Sud Italia"
  (Cormorant Garamond 600, 24px, espresso) + the italic sublabel
  "Neapolitan pizza · pizza napoletana · since 2019" (Cormorant 11.5px
  italic muted, ≥768px only).
- **Nav links (≥1024px):** Menu, Bundles, Locations, Story, Rewards.
  Each renders the primary EN/PL on top + the Italian italic phrase
  underneath (`Menù`, `Menù del giorno`, `Botteghe`, `La famiglia`,
  `Soci`). Hover sweeps in a 1.5px terracotta underline via `::after
  { transform: scaleX(0/1) }`.
- **Right cluster:** `<LanguageSwitcher />` + `<CurrencySwitcher />`
  (the V8 pill switchers above) + `<CartButton />` (the V8 cart pill)
  + a `38×38` line-bordered hamburger circle (`<lg` only).
- **Mobile menu:** appears under the nav-inner when the hamburger
  toggles. Each link is the same EN/IT bilingual format but inline
  instead of stacked.

### `<LiveTicker />` — `src/components/layout/LiveTicker.tsx`

The slim espresso strip directly under `<Header />`. Shown on every
`(public)` route via the `showLiveTicker` LayoutGate.

- **Espresso gradient canvas** (`#2D1810 → #3D2817`, the **only** dark
  slab on the storefront), ochre-tinted hairline + inset highlight.
- **Four widgets:** orders in the last hour (pulsing basil dot + ochre
  people icon), currently preparing (flame icon), trending item
  (basil trending icon), avg prep time (ochre bolt icon).
- **Data source:** `simulateLiveActivity` from `src/lib/growth-engine.ts`
  with a chain-wide sentinel slug (`"chain"`) — same helper that powers
  `<LiveActivityBar />` on `/locations/[slug]`, refreshed every 30s.
- **Bilingual subtitles** (`nell'ultima ora`, `in preparazione`, `in
  tendenza`, `tempo medio`) — italic Cormorant ochre, hidden under
  640px to keep the strip in one row.
- Numerals are tabular (`.num` helper) and Cormorant 600 — `12 orders
  in the last hour` reads as editorial copy, not analytics.

### `<CartButton />` — `src/components/cart/CartButton.tsx`

The V8 cart pill. Lives inside `<Header />`.

- **Parchment-deep pill** with line border + paper shadow; Cormorant
  italic "Cart" label (14px, espresso) + a terracotta count badge with
  Cormorant 600 numerals (12px, parchment fill).
- **Hover state inverts:** pill flips to terracotta fill with parchment
  text, and the count badge inverts to parchment fill with terracotta-
  dark text. Icon strokes follow via `currentColor` + a `.v8-cart-lines`
  class on the terracotta detail strokes.
- Click opens `<CartDrawer />` (portalled, see the Sheet primitive above).

## Landing-specific components (in `src/components/landing/`)

These compose the landing page. Each appears once per page; they
don't have alternate variants.

### `<HeroSection />`

The V8 Trattoria hero — full spec in [`../pages/home.md`](../pages/home.md#hero).

- **Centred parchment block**, not full-bleed. Padding 48px/56px →
  80px/90px ≥md. Five ornament SVGs scattered behind the column
  (basil sprigs, ellipse stains, a tomato) at z-index 1 with
  `pointer-events: none`.
- **Headline** — Cormorant Garamond 600 at 44px → 76px ≥md,
  letter-spacing -0.5px, line-height 1.02, espresso colour.
- **Italian sublabel** — Cormorant italic, 19→24px, muted-brown.
- **Hand-drawn underline** — `<svg>` squiggle, `currentColor` strokes
  on the terracotta colour token.
- **Live kicker pill** — bilingual `Open now · aperto ora · {cities}`
  in oxblood text, oxblood-tinted background, green pulsing dot.
  Status derives from `isLocationOpenNow()` in `src/data/locations.ts`
  — falls back to a muted dot + "Closed now / chiuso ora" outside
  hours so the kicker is never decorative.
- **CTAs** — one terracotta-fill `Order in {City}` per active
  location + a ghost oxblood `Our Story` (jumps to `#famiglia`). Each
  button carries its italian phrase as a `.bi-sec` italic ("Ordina a
  Kraków", "La nostra storia"). Hover lifts 2px with a warm
  terracotta drop.
- **Closing tricolore** — 200×3px Italian-flag gradient at 70%
  opacity, also exposed as `.v8-tricolore` for reuse on other
  surfaces.

### `<LocationsGrid />`

V8 Trattoria — `.v8-ps.v8-ps-alt` section with a 1 → 2-column grid
of paper cards. Full layout spec in
[`../pages/home.md`](../pages/home.md#locations-grid--locationsgrid).

- **Layout:** `.v8-ps.v8-ps-alt` (warm-paper section primitive) wrapping
  the standard `.v8-page-inner` (max-width 1180px, 18/36px gutter).
- **Per-card structure:** illustration → tricolore → body. The body
  is a flex-column ending in the CTA pinned to the bottom
  (`.v8-loc-cta { margin-top: auto }`), so cards in the same row line
  up at the action regardless of how much copy the description and
  attribution note add.
- **Per-slug illustration** — hand-tuned SVGs in
  `LocationsGrid.tsx`. Add a new function next to `OvenIllus` /
  `VespaIllus` and switch on the slug in `LocationIllustration` to
  introduce a new city's art. Until then, `MarketStallIllus` is the
  fallback so an `isActive: true` city always has art.
- **Status pill — three states, all live:**
  - `.v8-loc-status.is-live` — basil tint, pulsing terracotta dot,
    "Open now · aperto ora". Driven by `isLocationOpenNow()`.
  - `.v8-loc-status.is-muted` — muted-brown tint, still dot, "Closed
    now · chiuso ora". Active location but currently outside hours.
  - `.v8-loc-status.is-soon` — ochre tint, no dot, "Coming soon · in
    arrivo". `isActive: false` locations.
- **Attribution note** — italic Cormorant 13px with ochre left
  border (`.v8-loc-note`), driven by the new optional
  `location.teamLead` field on `Location`. Falls back to nothing if
  unset, so future locations without a known team don't show a stub.
- **Card hover** — translateY(-4px) + warm-brown drop shadow, 350ms
  ease. No scale.

## Section primitives — `.v8-ps`

The reusable "page section" primitives the V8 sections compose
against. Declared in `themes/homepage/index.css`. First adopted by
`<LocationsGrid />`; future Bundles / Famiglia / About / CTA sections
use the same classes so the landing's spacing, type ladder and
alt-paper rhythm stay identical across sections.

- **`.v8-page-inner`** — max-width 1180px, `margin: 0 auto`, 18px
  gutter at base / 36px at ≥md. The standard column wrapper inside a
  `.v8-ps` section. Bundles overrides this to be wider with a
  parchment gutter against the iframe edges (see `bundles-section`
  in the future Step 5).
- **`.v8-ps`** — section vertical rhythm: `56px / 80px ≥md` top +
  bottom padding, `position: relative` so absolutely-positioned
  ornaments anchor to the section box.
- **`.v8-ps-alt`** — alternating warm-paper background (a vertical
  gradient that fades to a parchment-deep band 12–88% down, then
  back to transparent at the edges, on top of `--color-parchment`).
  Use on every other section so the landing has rhythm without a
  hard divider line. Never apply two `.v8-ps-alt` in a row.
- **`.v8-ps-head`** — centred header block, `margin-bottom: 36/48px`.
- **`.v8-ps-eyebrow`** — uppercase Cormorant 600 in oxblood, 11px,
  `letter-spacing: 3px`. `::before` and `::after` em-dashes flank
  the text (the V8 signature meta line). Italian subtitle goes in a
  `.bi-sec` span at 50% style weight + 75% opacity.
- **`.v8-ps-title`** — Cormorant 600, `36 / 52px ≥md`, espresso.
  Apply `.it` to a span inside to flip that span to italic oxblood
  500 (V8's "Two addresses, **one family**" pattern).
- **`.v8-ps-sub`** — italic Cormorant 17 / 20px, muted-brown, centred
  with `max-width: 640px`. The supporting paragraph under the title.

### `<BundlesShowcase />`

V8 Trattoria — four paper cards in the wider `.v8-bundles-section`
(breaks out to 1500px max, leaves a parchment gutter at the iframe
edges). Layout spec in
[`../pages/home.md`](../pages/home.md#bundles-showcase--bundlesshowcase).

- **Wider page-inner override:** `.v8-bundles-section .v8-bundles-page-inner`
  swaps the standard `.v8-page-inner` 1180px column for a
  `min(calc(100% - 48/96/128px), 1500px)` band (the gutter widens at
  768 / 1400). The default chained selector means the override is
  scoped — drop the inner class on a card in another section and it
  picks up the 1180px column instead.
- **Per-variant accent CSS variables.** Each card sets
  `--v8-bundle-accent` + `--v8-bundle-accent-soft` (family rose,
  lunch ochre, night espresso, classic basil). The accent drives the
  top stripe gradient, the icon colour (via `color:
  var(--v8-bundle-accent)` + `stroke="currentColor"` on the SVG), the
  english subtitle colour, and the tag pill border. Adding a new
  variant is a one-line CSS addition — no per-component branching.
- **Bundle name pattern:** italic Cormorant **English marketing
  headline** on top (`Family Pack` / `Pizza Lunch+` / `Late-Night
  Slice` / `Italian Classic`) + **uppercase Italian subtitle** in
  the accent colour underneath (`Famiglia` / `Pranzo` / `Spicchio
  Notturno` / `Il Classico`). The `<span class="en">` mark wraps the
  subtitle so V8's "italic primary + uppercase secondary" treatment
  lands without an extra element per card. Both strings are local
  copy in `BundlesShowcase.tsx` (the bundle's `.tier` is the
  cart-drawer internal label and would render "Pizza Pack" /
  "Slice" instead of V8's marketing voice — the homepage is allowed
  to be looser).
- **Price logic:** two render branches — `kind: "money"` (now / was
  for fixed-price bundles, real values via `priceFromBundle()`
  reading `DEFAULT_BUNDLES.priceGrosze`) and `kind: "savings"`
  (single `-X%` label for the auto-combo whose discount activates in
  the cart, real value via `DEFAULT_COMBO_DEALS.italian-classic.discountPercent`).
- **Description** uses Lora body with italic-Cormorant `<em>` on
  Italian phrases (the same `.v8-bundle-desc em` selector V8 uses).
- **CTA reuse:** the bottom "Order now · inizia un ordine →" pill
  reuses `.v8-hero-cta` — same terracotta-fill + 2px lift hover as
  the hero. Don't ship a `.v8-bundle-cta` variant; keep the primary
  CTA shape consistent across the landing.

### `<AboutSection />`

- Two-column layout: copy left, image right (swaps on mobile).
- The one place body italic appears — a single Cormorant Garamond pull-quote.

### `<CTASection />`

- Centred final-call section, `bg-italia-red text-white` background.
- One large CTA button (the only place we use `<Button>` on a
  brand-red background — uses the white variant).

## Menu / cart components (in `src/components/cart/`, `src/components/location/`)

### Item card (in `<MenuSection />`)

- `pub-card` styling (`#fff` on cream, 16px radius, soft shadow).
- Image area (24px radius top) OR type-first if no photo.
- Name: Cormorant Garamond 500, 18px, `text-italia-dark`.
- Description: Lora 400, 14px, 2-line clamp, `text-italia-gray`.
- Price: Lora 700, 18px, tabular, with `zł` suffix at 14px.
- Dietary tags: inline chips (`bg-italia-cream-dark
  text-italia-dark text-xs px-2 py-0.5 rounded-full`).
- `Add` button: `<Button size="sm" variant="primary" />`.

### `<CartDrawer />` — `src/components/cart/CartDrawer.tsx`

The full checkout drawer (see [`../pages/checkout.md`](../pages/checkout.md)
for flow contract).

- Built on `<Sheet />`.
- Stages flow within the same surface — no page navigation.
- Bottom-sticky footer with the running total + primary `Continue`
  CTA.

### `<FloatingCartButton />` — `src/components/cart/FloatingCartButton.tsx`

The persistent in-thumb-reach order surface.

- Fixed bottom-right desktop, bottom-centre mobile (24px gutter from
  edge).
- `bg-italia-red text-white rounded-full`
- The **one** brand-tinted shadow on the storefront:
  `box-shadow: 0 4px 16px rgba(154,39,66,0.15)`.
- Renders nothing when the cart is empty (don't tease an empty cart).

### `<DeliveryProgress />`

The shimmer-sweep-unlock micro-flow for free delivery.

- Below threshold: shimmer crawls across a hairline progress bar
  (`--animate-delivery-shimmer`).
- At threshold: one-shot sweep + the medallion award
  (`--animate-delivery-sweep` + `--animate-delivery-medallion`).
- Unlock card pop: `--animate-delivery-unlock`.

## Loyalty components

### `<LoyaltyCard />` — `src/components/loyalty/LoyaltyCard.tsx`

The rewards-page centrepiece.

- `pub-card` styling, extra-generous 32px interior padding.
- Tier badge top, balance numeral 36px Lora 700, progress bar
  underneath, perks list at the bottom.

## Order tracker

### `<OrderTracker />` — `src/components/order/OrderTracker.tsx`

The polling live-status display on the order-confirmation page.

- 5-step horizontal pill row (stacks vertical < 480px).
- Current step: `bg-italia-red text-white`.
- Completed: `bg-italia-green/10 text-italia-green`.
- Future: `bg-italia-light-gray text-italia-gray`.
- ETA copy below the strip.

## What this component set is not

- It is **not** the Admin component set. The `glass-card`,
  `v2-btn`, `v2-input`, `v2-table` primitives live in
  `themes/admin/index.css`. Homepage doesn't use them.
- It is **not** the Core component set. The `cmd-*`, `ka-*`,
  `pos-*` primitives live in `themes/core/index.css`. Homepage
  doesn't use them.
- It is **not** customisable per page. A `<Button variant="primary" />`
  on the landing and a `<Button variant="primary" />` on the cart
  drawer render the same — the storefront's button consistency is the
  brand consistency.
- It is **not** a closed list — new primitives can land here, but
  they need a reason. A new "InfoBanner" component should probably
  just be a `<Sheet />` or a `pub-card` reused.

The Homepage component set is **the brand vocabulary on the
storefront** — type-first cards, brand-red CTAs, cream-and-white
cards, the delight moments (sheet, toast, delivery shimmer, tier-up
bounce).
