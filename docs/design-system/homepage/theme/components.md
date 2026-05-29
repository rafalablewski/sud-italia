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

### `<NavDropdown />` — `src/components/ui/NavDropdown.tsx`

Shared collapsible disclosure primitive for the language + currency
switchers (and any future nav-cluster picker). A tinted pill trigger
showing the current code + a caret; clicking expands a floating panel
anchored `right: 0; top: calc(100% + 8px)` of the trigger, with a 10px
backdrop blur and a 12/32px warm-brown drop shadow. Closes on outside
click, touch, or `Escape`. Caret rotates 180° while open.

- **Tone variants:** `terracotta` (language) + `basil` (currency).
  Both share the same trigger shape and panel chrome; the tone
  changes the trigger background tint, border colour, and the
  `[aria-selected="true"]` highlight inside the panel. Keeps the
  colour memory the old segmented pills established.
- **ARIA:** trigger carries `aria-haspopup="listbox"`,
  `aria-expanded`, `aria-controls={panelId}` (when open), and the
  caller-supplied `aria-label`. The panel is `role="listbox"`; each
  option button inside is `role="option"` with `aria-selected` on the
  active code.
- **Children-as-function:** `children: (close) => ReactNode` so the
  caller can fire `close()` after writing the selection — both
  switchers reload the page on pick, but the explicit close keeps
  the focus model right if a future variant doesn't reload.

### `<CurrencySwitcher />` — `src/components/ui/CurrencySwitcher.tsx`

The currency picker (governed by `showCurrencySwitcher` in admin
Settings → Layout — when off, the component returns `null` and the
storefront falls back to PLN).

- **Collapsible disclosure** built on `<NavDropdown tone="basil">`.
  Trigger shows the active symbol only (zł / € / $ / S$) on a
  basil-tinted pill. Clicking expands a panel of `SYMBOL · label`
  rows (`zł · Polish Złoty`, `€ · Euro`, …) so the active selection
  stays glanceable while every option becomes discoverable behind a
  single click.
- Active option: basil-tinted row + dark-basil code. Hover: faint
  basil wash on the row. Inactive: muted-brown italic label on
  parchment, espresso code.
- Honours `enabledCurrencies` from public settings; disabled currencies
  drop out of the panel.
- Selected currency persists via the customer cookie (same `setCurrency`
  helper as before). Picking a non-current option triggers a full
  reload so every SSR'd `formatPrice()` re-renders.

### `<LanguageSwitcher />` — `src/components/ui/LanguageSwitcher.tsx`

The language picker (governed by `showLanguageSwitcher` in admin
Settings → Layout).

- **Collapsible disclosure** built on `<NavDropdown tone="terracotta">`.
  Trigger shows the active 2-letter code only (PL / EN / DE / SG) on a
  terracotta-tinted pill. Clicking expands a panel of `CODE · native
  name` rows (`PL · Polski`, `EN · English`, `DE · Deutsch`, `SG ·
  Singapore English`) — codes for glanceability, native labels for
  discoverability.
- Active option: terracotta-tinted row + dark-terracotta code.
  Inactive: muted-brown italic label, espresso code.
- Honours `enabledLocales` from public settings; disabled locales drop
  out of the panel.
- Picking a non-current option calls `setLocale()` then full-reloads so
  every SSR string re-renders in the new locale.

## Storefront chrome — Header + LiveTicker + Footer

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
  "Pizza napoletana · est. 2019" (Cormorant 11.5px italic muted,
  ≥768px only). The sublabel was previously the longer
  "Neapolitan pizza · pizza napoletana · since 2019" — V8 polish trimmed
  the redundant English half so the wordmark reads as a single, refined
  line rather than two duplicated phrases.
- **Nav links (≥1024px):** Menu, Bundles, Locations, Story, Rewards.
  Each renders the primary EN/PL on top + the Italian italic phrase
  underneath (`Menù`, `Menù del giorno`, `Botteghe`, `La famiglia`,
  `Soci`). Hover sweeps in a 1.5px terracotta underline via `::after
  { transform: scaleX(0/1) }`.
- **Right cluster:** `<LanguageSwitcher />` + `<CurrencySwitcher />`
  (the collapsible V8 nav switchers above — single tinted pill each,
  panel expands on click) + `<CartButton />` (the V8 cart pill) + a
  `38×38` line-bordered hamburger circle (`<lg` only). The switchers
  used to be always-expanded segmented rows of four codes each, which
  ate ~250px of horizontal budget; the disclosure refactor reclaims
  that width and keeps the nav reading at a glance. The cluster is
  pinned to the right edge of the 1180px container with `ml-auto` at
  every breakpoint — the brand + nav-links sit left, the switchers +
  cart sit right, with the remaining space absorbed between them.
  (Earlier builds used `lg:ml-0` to let the cluster sit immediately
  after the nav-links; the V8 polish pass dropped that override so the
  three pills land flush right, where the user expects to grab them.)
- **Mobile menu:** appears under the nav-inner when the hamburger
  toggles. Each link is the same EN/IT bilingual format but inline
  instead of stacked.

### `<LiveTicker />` — `src/components/layout/LiveTicker.tsx`

The slim espresso strip directly under `<Header />`. **Mounted only
on `/locations/[slug]`** (`src/app/(public)/locations/[slug]/page.tsx`)
via the `showLiveTicker` LayoutGate — V8 polish scoped the bar
from a global storefront mount to a location-page mount so the
homepage / rewards / non-order surfaces open on a clean parchment
band beneath the nav. The bar is order-flow context; surfaces that
don't lead to an order don't need it.

- **Espresso gradient canvas** (`#2D1810 → #3D2817`, the **only** dark
  slab on the storefront besides the `/rewards` tier card), ochre-
  tinted hairline + inset highlight.
- **Four widgets:** orders in the last hour (pulsing basil dot + ochre
  people icon), currently preparing (flame icon), trending item
  (basil trending icon), avg prep time (ochre bolt icon).
- **Data source:** `simulateLiveActivity` from `src/lib/growth-engine.ts`
  with a chain-wide sentinel slug (`"chain"`) — same helper that powers
  the admin-configurable `<LiveActivityBar />` widget. Refreshed every 30s.
  As of Step 8 the per-location `<LiveActivityBar />` is NOT rendered on
  `/locations/[slug]` to avoid two stacked espresso ticker bands;
  Step 9 (menu chrome) will re-mount it inside the menu's
  `loc-card-soft` wrapper where V8's mockup places it (`.live-act`
  row).
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

### `<Footer />` — `src/components/layout/Footer.tsx`

V8 Trattoria footer — espresso canvas that picks up the Soci rail's
palette so the Soci → Footer transition reads as one continuous
dark block instead of a dark → light jolt. Mounted on every
storefront route via `(public)/layout.tsx`. Server component.

- **`.v8-pfoot`** section — `--color-espresso` canvas, parchment
  text, `50px / 32px` vertical padding. Lives inside the standard
  `.v8-page-inner`.
- **4-column grid** at ≥768px (`1.4fr 1fr 1fr 1fr` — the wider
  leading column carries the brand block + tagline + tricolore),
  stacks to a single column on mobile.
- **Brand block** — `<FooterBasilMark />` SVG (ochre-light strokes
  with translucent basil leaves, V8's footer variant of the nav
  brand mark) + "Sud Italia" wordmark in parchment Cormorant 26px,
  a body paragraph at parchment-75% opacity, then a 90×3px
  `.v8-tricolore` hairline as the footer accent.
- **Link columns** — italic ochre-light Cormorant 18px `<h4>` heads,
  Lora 13.5px links at parchment-75% opacity, hover transitions to
  ochre-light. Columns kept from the existing site (Locations /
  Contact / Follow us) over V8's mockup copy (Menu / Locations /
  For businesses) because those columns wire to **real operator
  data** — CONTACT_EMAIL / CONTACT_PHONE / SOCIAL_LINKS from
  lib/constants and the active-locations list. Shipping the
  mockup's "Team lunch — invoiced" / "Private events" copy without
  a real backing would be Rule #1 territory.
- **Bottom bar** — italic Cormorant 12.5px at parchment-50%
  opacity, copyright paired with the Italian tagline (`Mangia bene,
  ridi spesso, ama molto.`) and the "Made with passion in Napoli ·
  cooked in Polska" sign-off. Top border at parchment-12% opacity
  separates it from the link columns.
- Visible on every storefront route. The Soci rail above it on the
  landing reads as the closing CTA + body; the footer is the
  metadata block. Together they make the landing's bottom half
  read as one dark continuous slab, the V8 design intent.

## Landing-specific components (in `src/components/landing/`)

These compose the landing page. Each appears once per page; they
don't have alternate variants.

### `<HeroSection />`

The V8 Trattoria hero — full spec in [`../pages/home.md`](../pages/home.md#hero).

- **Centred parchment block**, not full-bleed. Padding `48px top /
  0 bottom` → `80px top / 0 bottom` ≥md. The bottom is zeroed: the
  closing tricolore sits 28px below the CTAs and the next `.v8-ps`
  section's own 56/80px top padding supplies all the rhythm —
  anything else stacks into a dead band under the CTAs. Five
  ornament SVGs scattered behind the column (basil sprigs, ellipse
  stains, a tomato) at z-index 1 with `pointer-events: none`.
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
against. Declared in `themes/homepage/index.css`. Adopted by
`<LocationsGrid />`, `<BundlesShowcase />`, and `<LoyaltySection />`
(via the dark `.v8-ps-dark` variant). They share spacing, type
ladder, and the alt-paper rhythm across sections. **The Famiglia
strip (`<AboutSection />`) is the deliberate exception** — it uses
a bespoke `.v8-famiglia` block without `.v8-ps` chrome (no
eyebrow / title / subtitle) so the quote lands as a single
typographic gesture, not a content block.

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
- **`.v8-ps-dark`** — espresso canvas with two radial washes
  (terracotta top-left + ochre bottom-right). Used by the Soci /
  loyalty closing rail. Descendant selectors flip the shared
  `.v8-ps-eyebrow / -title / -sub` colours to ochre-light /
  parchment / parchment-70% so the type ladder inverts cleanly
  without per-section overrides. `.v8-ps-dark .v8-ps-title .it`
  flips the italic clause to ochre-light (not oxblood, which would
  disappear into the espresso bg). `.v8-ps-dark .v8-ps-sub em`
  is the dark-mode counterpart to `.v8-bundle-desc em` — italic
  Cormorant ochre-light at 92% opacity for Italian phrases.
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

### `<AboutSection />` (V8 Famiglia strip)

V8 Trattoria — a slim italic-Cormorant quote strip, NOT a content
block. Full layout spec in
[`../pages/home.md`](../pages/home.md#famiglia-strip--aboutsection).
File name kept (`AboutSection.tsx`) so `(public)/page.tsx` and any
existing LayoutGate wiring don't churn — the export stays
`AboutSection`, the content is V8's Famiglia strip.

- **No `.v8-ps` chrome.** Deliberately strips the eyebrow / title /
  subtitle the other sections use. Uses a bespoke `.v8-famiglia`
  class with **zero vertical padding** + a soft terracotta radial
  wash (`radial-gradient(at 50% 50%, rgba(184,92,56,0.06),
  transparent 70%)`). The strip's height is exactly the quote +
  citation; the surrounding `.v8-ps` / `.v8-ps-dark` sections' own
  56/80px ≥md padding owns the rhythm above and below — the
  earlier `64px top + bottom` stacked with those neighbours into a
  dead band V8 polish flagged and zeroed.
- **The pull-quote** — italic Cormorant 28 / 36px ≥md, espresso,
  max-width 720px, centred. Wrapped in translucent oxblood curly-
  quote pseudo-elements at 60px (`\201C` / `\201D`) — screen
  readers only get the quote text, not the punctuation glyphs.
- **The citation** — uppercase Cormorant 600 12px, muted brown,
  letter-spacing 2px. Name and role separated by a plain `·`.
- Lives at the `#famiglia` anchor — the hero's "Our Story" CTA and
  the nav's "Story" link both point here.
- **Quote + cite are brand copy.** V8 signs the quote with
  "Giuseppe Esposito · Pizzaiolo" — the same Giuseppe whose name
  shows on the Kraków LocationCard's `teamLead`, so the homepage
  voice stays consistent. Untranslated "Pizzaiolo" is intentional:
  the strip signs itself the way an Italian café signs its menu.

### `<LoyaltySection />` (V8 Soci closing rail)

V8 Trattoria — the **closing** rail at the bottom of the landing,
not the inline `<LoyaltyCard />` panel the previous storefront
rendered here. Full layout spec in
[`../pages/home.md`](../pages/home.md#soci--loyalty-rail--loyaltysection).
File at `src/components/location/LoyaltySection.tsx` (shared with
the location-pages route).

- **Composes against `.v8-ps.v8-ps-dark`** — the dark variant of the
  shared section primitive. Espresso canvas with terracotta +
  ochre radial washes; the `.v8-ps-eyebrow / -title / -sub`
  descendant selectors flip to ochre-light / parchment / parchment-
  70%.
- **Title** uses the `.v8-ps-title .it` clause-flip pattern but the
  dark variant overrides the italic colour to ochre-light (rather
  than oxblood, which would disappear into the espresso bg). The
  title text `"A pizza, una storia"` deliberately echoes the
  Famiglia strip's blockquote — same brand line, two voices: the
  full sentence as a quote on Famiglia, the phrase as a title on
  Soci.
- **`.v8-soci-strong`** wraps the "1 point" callout in ochre-light
  Cormorant 600 normal-style — overrides the surrounding italic
  Lora sub so the loyalty rate spotlights.
- **`.v8-ps-dark .v8-ps-sub em`** styles the Italian phrases
  (`Famiglia Oro`, `antipasto della casa`) as italic Cormorant
  ochre-light at 92% opacity — the dark-mode counterpart to the
  `.v8-bundle-desc em` light-section pattern.
- **CTA** reuses `.v8-hero-cta` (terracotta-fill pill, 2px hover
  lift) → `/rewards`. Same shape as the hero + Bundles primary
  CTAs to keep the landing's primary-action vocabulary consistent.
- **Marketing numbers** (`1 point` per złoty, `300 points` for
  Famiglia Oro, the `antipasto della casa` reward) are local
  copy. Canonical loyalty rules live in `lib/loyalty.ts` — if the
  operator retunes the formula, the homepage pitch needs an update
  too. Same trade-off bundles take.

## Menu / cart components (in `src/components/cart/`, `src/components/location/`)

### `<LocationHero />` — `src/components/location/LocationHero.tsx`

V8 Trattoria treatment — full spec in
[`../pages/menu.md`](../pages/menu.md#location-hero--locationhero).

- **Composes against `.v8-loc-hero`** (a bespoke wrapper, not
  `.v8-ps` — the location hero predates the menu chrome by one
  block of vertical rhythm and uses its own padding ramp).
  Parchment canvas with a soft fade to parchment-deep + line-soft
  hairline border-bottom.
- **Per-slug pen-sketch illustration** at 360×180 — wider + more
  detailed than the LocationsGrid 220×140 card sketches. Add a
  function-per-slug + a switch in `LocationHeroIllus` to introduce
  a new city's art; `GenericHeroIllus` is the fallback.
- **Tagline + sub** are local marketing copy in `LOC_COPY` keyed
  by slug. The bundle component's "marketing copy lives locally"
  pattern applied to per-location voice — the Location type stays
  operator-data-only.
- **`getCurrentHourSlot()` helper** (in `data/locations.ts`)
  drives the status pill's real close time. Falls back to "Closed
  now · chiuso ora" outside hours.
- **Back chip** ("Home · la casa") renders as the **first child of
  the hero `<header>`** — oxblood-tinted pill (`.v8-back-chip`)
  with the `.v8-loc-back-chip` modifier (`display: flex` + `width:
  max-content` + `z-index: 3` so it stays pill-shaped at the top-
  left while the centred `.v8-loc-hero-inner` flows below it).
  Hover flips to filled oxblood with parchment text. Lets visitors
  arriving via cross-link / share URL return to the landing without
  scrolling back to the nav. Earlier builds shipped a separate
  `.v8-back-chip-wrap` cream strip ABOVE the hero; V8 polish folded
  the chip into the hero so the page opens on one continuous
  parchment surface.

### `<MenuSection />` — `src/components/location/MenuSection.tsx`

V8 Trattoria menu chrome. Wraps the entire menu surface in a single
soft paper card (`.v8-menu-card`) holding the section header,
search input, per-location live-activity strip, category tabs,
15-min guarantee banner, inline combo deals row, surprise-me pill,
and the items grid. Full layout spec in
[`../pages/menu.md`](../pages/menu.md#menu-section--menusection).

- **Single paper-band wrapper** — `.v8-menu-card` (parchment-deep
  with the shared `shadow-paper`, full-bleed: no `max-width`, no
  border, no border-radius). The whole menu surface is one
  continuous V8 band across the viewport instead of the pre-V8
  per-category sections, or the framed-rectangle "card" the earlier
  V8 build shipped (rounded radius + 1180px max-width + line-soft
  border — removed in polish because the card frame read as a
  settings panel inside an editorial layout).
- **Category tabs filter in place.** The "All" tab + a per-active-
  category pill row replaces the pre-V8 sort/pill split. The
  active tab fills terracotta with an ochre-light count chip.
- **Inline V8 blocks** — `.v8-guarantee`, `.v8-combos` /
  `.v8-combo-card` / `.v8-wax-seal`, `.v8-surprise`, `.v8-live-act`.
  These inline bespoke blocks replace the pre-V8 `<SpeedGuarantee />`,
  `<ComboDealsPreview />`, `<SurpriseMe />`, and `<MenuCategoryNav />`
  components — all deleted in Step H. `<LiveActivityBar />` stays in
  the repo because it's still mounted on `/locations/[slug]` (just
  not inside MenuSection).
- **Wax-seal** — a CSS-only circle: oxblood radial gradient + inset
  shadows + dashed inner ring at 6px inset + `rotate(-8deg)`. Holds
  the discount percent (`−10%`) in italic Cormorant. Adjacent to
  each combo card; same component on every combo means a token
  retune (oxblood) ripples across the row.
- **Surprise me** — dashed-ochre pill with the V8 dice-pattern SVG.
  Click picks a random available item and prefills the search
  field with its name (`setSearchQuery(random.name)`), repurposing
  the existing filter logic so the picker doesn't need a separate
  selection store.
- **Per-location live activity** — re-introduced inside the menu
  wrapper (after Step 8 removed it from the location-page chrome
  to fix a duplicate-ticker-band finding). Pulsing basil pip +
  italic Cormorant copy + italic-oxblood trending item. Reads
  `simulateLiveActivity(locationSlug)`, refreshes every 30s,
  mount-gated.
- **`<ReorderSection />` + `<SeasonalSpecials />`** render ABOVE
  the V8 menu card, outside the wrapper. V8's mockup doesn't ship
  them but they're valuable existing features; placing them above
  keeps the V8 menu band visually clean. **They mount directly
  under `<MenuSection />` without an intermediate container** —
  earlier builds wrapped each in an `mx-auto max-w-[1180px]
  px-[18px] md:px-[36px]` div, but those containers rendered
  unconditionally even when the children returned `null`
  (returning customers with no recent orders, no seasonal items
  active) and left a pair of empty padded boxes in the DOM. Since
  `<ReorderSection />` and `<SeasonalSpecials />` already early-
  return `null` when empty, dropping the wrappers is the right
  fix; when they DO render they inherit the menu band's
  full-bleed treatment, consistent with the new `.v8-menu-card`
  shape.

### `<MenuItemCard />` — `src/components/location/MenuItem.tsx`

V8 Trattoria per-item card. Lives inside `.v8-menu-items` on the
location-page menu. All existing data wiring carried over — cart
state, justAdded post-add feedback, detail-drawer trigger,
popularThisWeek flag, badges from `lib/upsell` (role + admin), LTO
countdown, compliance pills — only the markup changed.

- **Paper card** (`.v8-mi`) — parchment gradient, line border, 14px
  radius, paper-card shadow. Hover lifts 3px with a deeper
  warm-brown drop. `.is-unavailable` → 0.55 opacity + slight
  greyscale, no hover lift. `.is-incart` → basil border + soft basil
  ring so the visitor can see at a glance which items are already in
  the cart.

- **Floating flag ribbon** (`.v8-mi-flags` at top:-10px left:16px) —
  bilingual italic-Cormorant uppercase pills that sit slightly above
  the card edge so they read as pinned ribbons:
  - `Our Hero` (terracotta) — `item.menuRole === "hero"` or the
    `variant === "hero"` prop.
  - `Most Popular` (`.is-gold`) — `popularThisWeek === true` from
    the hot-this-week popularity hook OR the `popular` badge.
  - `Just landed` (`.is-basil`) — the `new` admin badge.
  - `Sold out today` (`.is-muted`) — `!item.available`, replaces the
    other flags rather than stacking.

- **Chef's signature crown** (`.v8-mi-signature` at top-right) —
  espresso pill with an ochre crown SVG + "Signature" label. Renders
  when `item.menuRole === "anchor"` OR the admin badge
  `chef-signature` is set. Two distinct signalling channels for the
  premium-pick treatment.

- **Body** — flex row, illustration on the left + name/origin/chips/
  meta on the right:
  - `.v8-mi-illus` — 84×84 parchment-deep tile with a 12px radius
    and a per-category SVG sketch (pizza wedge with red dots, pasta
    bowl, antipasti olive plate, panini cross-section, drink bottle,
    dessert cake). The sketch rotates -3° on card hover for a paper-
    print feel.
  - `.v8-mi-name` — italic Cormorant 22px espresso. A `<span class="en">`
    below carries the uppercase Italian-red EN tagline derived from
    the item's role: "The gateway — start here" / "Pizzaiolo's
    pick" / "Monthly small-batch" / "Chef's signature" / "Just
    landed" / "Smart pick". Items with no signalling role get no
    tagline.
  - `.v8-mi-origin` — italic-Cormorant muted 13.5px, renders the
    existing `item.description` as the V8 "San Marzano DOP · fior di
    latte di Agerola" origin line.
  - `.v8-mi-chips` — basil-tinted bilingual pills from `item.tags`
    (`vegetarian`, `vegan`, `spicy`, `gluten-free` get the
    appropriate `.is-warn` oxblood / `.is-gold` ochre variants). LTO
    items add an italic ochre `Nd left · per N giorni` chip. Pizza
    items get a standing "36h proofing · 36h lievitazione" chip
    (V8's brand-voice nod to the long prove).
  - `.v8-mi-meta` — cook time / kcal numbers + a small italic
    terracotta "Details · dettagli" button (open the Kodawari detail
    drawer). Only renders when `getItemDetails(item.id)` has
    something to show.
  - `<CompliancePills />` — regulatory disclosure pill row (kcal,
    Nutri-Grade, halal, contains-pork, contains-alcohol). V8 chrome
    as of Step 16 — see the dedicated entry under "Polish components"
    below.

- **Foot** (`.v8-mi-foot`) — dashed-line separator above, flex
  row with price on the left and add-action on the right:
  - `.v8-mi-price` — Cormorant 600 22px tabular ink, `formatPrice(item.price)`.
  - `.v8-mi-add` — terracotta-fill button "Add · aggiungi" with a
    plus SVG. Disabled state (sold out) flips to muted-brown +
    `cursor: not-allowed`. Post-add (1500ms) flips to "Added" with
    a check SVG.
  - When `quantity > 0`, the button becomes `.v8-mi-stepper` — a
    basil-tinted pill with terracotta − / + buttons and the cart's
    current count in italic basil between. Decrement at 1 removes
    the item entirely.

- **Detail drawer** — `<ItemDetailDrawer />` opens via the Details
  button. V8 paper-card vocabulary as of Step 13 — see the dedicated
  entry below for the full chrome breakdown.

### `<CartDrawer />` — `src/components/cart/CartDrawer.tsx`

The V8 Trattoria checkout drawer (see [`../pages/checkout.md`](../pages/checkout.md)
for the full surface contract).

- **Builds its own portalled sheet** — does not compose `<Sheet />`.
  The V8 paper-card vocabulary needs to extend edge-to-edge inside the
  drawer (gripped header, basil sprig + italic Italian sublabel,
  Italian-flag tricolore strip, parchment scroll region, sticky
  paybar with a tricolore band of its own). The shell selectors live
  under `.v8-cart-*` — `.v8-cart-overlay`, `.v8-cart-sheet`,
  `.v8-cart-grip`, `.v8-cart-top`, `.v8-cart-tricolore`,
  `.v8-cart-scroll`, `.v8-cart-paybar`. See `themes/homepage/index.css`.
- Portalled to `document.body` per Rule 4. `body.v8-cart-open` toggles
  while open so the floating cart pill / nav can fade out without
  rolling their own state.
- **Single-mount** (Step 11 follow-up). Lives at `(public)/layout.tsx`
  exactly once and reads open state + active-location menu items from
  `useCartUIStore`. Every trigger surface (top-nav `<CartButton />`,
  mobile `<FloatingCartButton />`, `<AbandonedCartBanner />`) opens
  this one instance; no more 3× duplicated effects (slot polling,
  upsell-config refetch, attach-history fetch, compliance lookup).
- Stages still flow within the same surface — no page navigation.
- Sticky paybar with the running total + bilingual `Pay · procedi
  · 46,51 zł` CTA (terracotta) + outline trash chip for `Clear cart`.

### `<MenuItemsRegistrar />` — `src/components/cart/MenuItemsRegistrar.tsx`

The bridge that lets the layout-level `<CartDrawer />` see the live
menu of whichever location page is currently mounted. Rendered once
on `/locations/[slug]/page.tsx`, it calls
`useCartUIStore.setMenuItems(menuItems)` on mount and clears the
store on unmount. Returns `null`.

Without this the drawer would fall back to the hardcoded
`krakowMenu` / `warszawaMenu` arrays — which miss admin overrides
(price changes, item-86 toggles, badges) and break the cross-sell
rail + bundle ladder + tier perk for the current location.

### `<CartItem />` — `src/components/cart/CartItem.tsx`

V8 paper-card line item rendered inside the drawer's `.v8-cart-items`
rail.

- `.v8-cart-item-illus` — 64×64 parchment-deep tile with an inline
  pencil-sketched glyph per `menuItem.category` (pizza, pasta,
  dessert, drinks, coffee, antipasti, panini). Glyphs are inline SVGs
  in the same file (`DishGlyph` helper) so no asset pipeline is needed.
- `.v8-cart-item-name` — italic Cormorant 20px espresso.
- `.v8-cart-item-price` — Cormorant 600 tabular ink (line total).
- `.v8-cart-item-origin` — Lora italic muted, prints
  `menuItem.description` so the cart row still tells the sourcing
  story.
- `.v8-cart-qty` — terracotta-tinted pill stepper (`− 1 +`).
  Decrement at 1 removes the line (preserved behaviour).
- `.v8-cart-item-action` — italic text buttons `note · nota` +
  `remove · rimuovi`. Note panel opens below the row via
  `.v8-cart-note` parchment-cream textarea (140-char cap, counter
  on the right of the foot).
- `data-soldout="true"` dims the row to 60% opacity and adds an
  italic "Sold out · esaurita — remove to continue" line.

### `<CartUpsell />` — `src/components/cart/CartUpsell.tsx`

"Pairs beautifully with —" sommelier-style cross-sell rail.

- `.v8-cart-pairs-kicker` "Tonight's pairing · l'abbinamento di
  stasera", `.v8-cart-pairs-title` italic Cormorant 22px headline,
  italic Lora sub.
- `.v8-cart-pair` rows: 56×56 illus tile (basil-deep glyph per
  category) + italic name + italic Lora "reason" copy + tabular
  price + terracotta italic `+ Add · aggiungi` text button.
- Once added, the button flips to basil-deep `added · aggiunto ×N`
  and stays tappable for another increment (audit §2.2 chip behaviour).
- Wired through `getCartSuggestions()` with the same `PairingContext`
  ranking (hour-of-day + per-customer attach history).

### `<FloatingCartButton />` — `src/components/cart/FloatingCartButton.tsx`

The V8 "Il tuo carrello" floating pill — bottom-right on every
storefront route.

- `.v8-float-cart` parchment-cream pill with the bag SVG +
  "Cart · il tuo carrello" italic bilingual label + a
  `.v8-float-cart-count` terracotta count badge inside. On hover the
  whole pill flips to terracotta fill + parchment text + parchment
  count badge.
- `data-bump="true"` toggles for ~360ms whenever the cart count
  increases — fires the `v8-float-cart-bump` keyframe so the pill
  scales up momentarily as a micro-feedback for items landing while
  the drawer is closed.
- `body.v8-cart-open` (toggled by `<CartDrawer />`) fades the pill to
  opacity 0 + a 20px downward translate so the two surfaces don't
  fight for attention.
- Renders nothing when the cart is empty (don't tease an empty cart).
- Single-mount surface: lives at `(public)/layout.tsx`. Every
  storefront page sees the same pill instance. No props.
- Opens the layout-level `<CartDrawer />` via
  `useCartUIStore.setDrawerOpen(true)`.

### `<AddToCartToast />` — `src/components/cart/AddToCartToast.tsx`

The V8 audit §2.1 T+0 "item added" toast — espresso paper card that
slides up from the bottom of the viewport.

- `.v8-cart-toast` espresso fill with parchment text + a gold star
  glyph on the left. Italic Cormorant title
  `<em>Margherita</em> added · aggiunto al carrello` +
  italic Lora seed line `Customers usually add an espresso.` The seed
  comes from `getCartSuggestions()` — the same upsell rules the
  cart drawer uses, so the toast and the drawer always agree on
  what to recommend.
- Slides up via `transform: translate(-50%, 20px) → translate(-50%, 0)`
  + opacity 0 → 1 on the `.is-show` class. Auto-dismisses in 4s.
- `body.v8-cart-open` fades the toast to opacity 0 — no point
  surfacing a toast above an open drawer.
- Portalled to `document.body` per Rule 4.
- Subscribes to `useCartStore` and fires on every quantity increase
  (new line OR existing line incremented). The previous-quantity
  map is primed on mount so items already in the persisted cart on
  page load don't fire a toast.
- Single-mount surface: lives at `(public)/layout.tsx`. The menu
  items used to compute the seed flow through `useCartUIStore`
  (seeded by `<MenuItemsRegistrar />` on the location page). Pages
  without a location see the toast title without a seed line.

### `<ItemDetailDrawer />` — `src/components/location/ItemDetailDrawer.tsx`

V8 per-dish info drawer that opens from the "Details · dettagli"
button on each menu card.

- Builds its own portalled sheet under `.v8-detail-*` (mirrors the
  cart drawer vocabulary so the menu → detail → cart flow reads as
  one editorial spread). The selectors stay namespaced under
  `.v8-detail-*` so the detail styling can't leak into the cart's
  `.v8-cart-*` family.
- Sheet sizes to 92vh on mobile (slightly slimmer than the cart
  drawer's 96vh — the detail surface is less info-dense, so the
  underlying menu stays visible past the top) and the same
  `calc(100vh - 40px)` side-drawer treatment on desktop.
- **Sticky header** — basil sprig SVG + italic Cormorant 22px item
  name (ellipses on overflow) + "— dettagli" sublabel + line-bordered
  close-X that rotates 90° on hover, mirroring the cart drawer
  affordance.
- **Hero block** — 96×96 parchment-deep `.v8-detail-illus` tile with
  a per-category dish glyph (pizza / pasta / dessert / drinks / coffee
  / antipasto / default tomato), italic Cormorant 26px `.v8-detail-name`,
  italic Lora `.v8-detail-desc`. Limited-rotation items add an oxblood
  `.v8-detail-callout.is-limited` strip; popular-this-week items add
  an ochre `.v8-detail-callout` strip.
- **Meta row** — dashed-hairline-bordered `.v8-detail-meta` with the
  oxblood Cormorant 26px tabular price + "Nm · in cottura" prep time
  + tabular calorie count.
- **Allergens · allergeni** — oxblood-tinted `.v8-detail-allergen` chip
  row when present. Empty allergens collapse to a basil-deep
  `.v8-detail-no-allergens` line ("Senza allergeni maggiori — no major
  allergens reported.") with a hand-drawn basil-leaf SVG.
- **Valori nutrizionali · nutrition** — `.v8-detail-bar` rows with
  bilingual italic Lora labels (Calories · calorie, Protein · proteine,
  Carbohydrates · carboidrati, Fat · grassi, Fiber · fibra, Sodium ·
  sodio) and progress fills tinted per-nutrient (`.is-ochre`,
  `.is-terracotta`, `.is-ochre-light`, `.is-oxblood`, `.is-basil`,
  `.is-espresso`).
- **Provenienza · sourcing** — parchment-deep `.v8-detail-sourcing`
  paper card with a basil-sprig mark + italic Lora quote from the
  Kodawari sourcing copy.
- **Footer flourish** — italic Cormorant "Un piatto fatto bene · a dish
  done well." closing line.
- **Sticky paybar** — terracotta Cormorant "Add to cart · aggiungi
  al carrello + [price]" CTA with the same shadow + hover lift as the
  cart drawer's pay CTA. Tap adds the item via `useCartStore.addItem`
  + closes the drawer (the layout-level `<FloatingCartButton />` +
  `<AddToCartToast />` take over the post-add feedback). Disabled
  state when the item is sold out or the location slug is missing.
- ESC key closes; backdrop click closes; rotating × button closes.
  `body.v8-detail-open` is toggled while open so the body scrolls
  inside the sheet, not behind it.

**Single-mount surface.** Lives at `(public)/layout.tsx` exactly once.
Opens via `useCartUIStore.setDetailItem({ item, locationSlug,
popularThisWeek })`. The location slug travels in the payload so the
Add-to-cart CTA can attribute the first-ever item to the right
location (the cart store only learns its slug after the first item
lands — without this, the detail Add CTA would be permanently
disabled for an empty cart on first visit).

The previous N-drawer-per-menu-page setup (one mounted
`<ItemDetailDrawer />` per `<MenuItem />` with its own local open
state) is now a single instance — for a Kraków menu of 35 dishes,
that drops 35 portalled drawers + 35 useEffect chains from the DOM.

### `<DeliveryProgress />` — `src/components/cart/DeliveryProgress.tsx`

V8 free-delivery shimmer-sweep-unlock micro-flow.

- Below threshold: `.v8-cart-delivery` italic Cormorant
  "Consegna a casa — N% verso la gratuità" headline +
  `.v8-cart-delivery-rail` terracotta rail + `.v8-cart-delivery-fill`
  terracotta gradient + `.v8-cart-delivery-shimmer` running
  `--animate-delivery-shimmer` + `.v8-cart-cyclist` SVG that rides
  the fill (`left: {pct}%`).
- At threshold: `.v8-cart-delivery.is-unlocked` gold→basil-tinted
  card + `.v8-cart-delivery-medallion` with the gold-to-basil radial
  + the one-shot `.v8-cart-delivery-sweep` overlay. Uses the same
  `--animate-delivery-unlock` / `--animate-delivery-sweep` /
  `--animate-delivery-medallion` keyframes declared in Step 1.

### `<LoyaltyEarnPreview />` — `src/components/cart/LoyaltyEarnPreview.tsx`

Italic Lora "You'll earn N points · N punti" line shown inside the
paybar foot. Filled ochre star + Cormorant 600 ochre-dark tabular
count. Server is the source of truth for the actual number; this
preview uses the bronze multiplier and is intentionally cosmetic.

### `<CorporateOrderBanner />` — `src/components/cart/CorporateOrderBanner.tsx`

"Sud Italia per le aziende" rollup card (audit §3.4) — shown when the
active wallet is a productised corporate account.

- `.v8-cart-corp` ochre paper card with the building-block SVG on the
  left + Cormorant kicker ("Sud Italia for businesses · per le
  aziende") + italic Cormorant headline "Ordering with [name]" +
  italic Lora rollup line (employee count, optional auto-preorder
  copy, optional head-of-wallet bonus).
- Self-hides for solo customers and family wallets without a
  corporate config.

### `<TierPerkBanner />` — `src/components/cart/TierPerkBanner.tsx`

Famiglia Oro / Famiglia Platino complimentary antipasto toggle (audit
§2.2 row 6).

- `.v8-cart-perk` ochre paper card with the star SVG + italic
  Cormorant tier name + italic Lora copy "A complimentary *antipasto
  della casa* on us — added at the truck." + italic Cormorant
  "Add · aggiungi" CTA on the right.
- Toggled state (`.is-on`) flips to a basil-deep "added to the
  table" headline with a round line-bordered × in the corner.
- Adds a price-0 line tagged with `perk-gold-` prefix so the cart
  store can find + remove it without disturbing real paid lines.

### `<TodBanner />` — `src/components/cart/TodBanner.tsx`

Time-of-day pairing card (audit §2.3). Five variants — morning
(basil), lunch (ochre), afternoon "l'aperitivo" (ochre), dinner
(terracotta), late (espresso night palette).

- `.v8-cart-tod.is-{variant}` paper card with a hand-drawn variant
  glyph on the left (sun / plate / wine glass / table-and-knife /
  moon) + italic Cormorant variant title + italian italic phrase +
  italic Lora sub.
- CTA is the standard ochre Cormorant pill; on `.is-late` it flips
  to terracotta so it reads on the espresso background.
- Re-evaluates the active window every minute so a customer who
  lingers in the drawer doesn't sit at "Lunch combo" past 13:00.

### `<ComboDealBanner />` — `src/components/cart/ComboDealBanner.tsx`

Italian Classic / Pasta Combo / etc. percent deals.

- `.v8-cart-combo` espresso paper card with a hand-drawn wood-fired-
  oven glyph + italic Cormorant deal name + italic Lora copy + ochre
  `−12%` chip on the right + hairline progress rail underneath.
- While the deal is incomplete the card becomes a button — tap adds
  the missing items (cheapest in each missing category, or the missing
  required suffixes) and unlocks the discount in one go.
- Applied state flips to basil-tinted `.is-complete` card with the
  basil-deep italic "applied · attivato — saving X zł" headline.

### `<SlotPicker />` — `src/components/cart/SlotPicker.tsx`

Date strip + slot grid in the V8 paper-card vocabulary.

- `.v8-cart-days` horizontal scroll of day pills (Today · oggi /
  Tomorrow · domani / formatted dates). Active day flips to
  terracotta fill.
- `.v8-cart-slots` 3-up grid of slot tiles. Each tile is a paper
  pill with the time on top (Cormorant 600 tabular) + italic Lora
  scarcity line below (bilingual: "Only 2 left · ultimi 2",
  "Last spot · ultimo!", "N slots · liberi"). Critical slots tint
  oxblood, low-stock slots tint ochre.
- `.v8-cart-slots-empty` — parchment-deep dashed card with italic
  Cormorant "Fully booked today · pieno" + terracotta italic
  day-rollover link.
- `.v8-cart-slots-skel` — 6-tile shimmer skeleton with the
  parchment → parchment-deep gradient.

### `<BundleLadder />` — `src/components/cart/BundleLadder.tsx`

Make-it-a-bundle paper card (audit §3.2). Surfaces Lunch / Family
Feast / Late dinner ladders depending on time-of-day, mainItems
count, and admin config.

- `.v8-cart-ladder` paper card with italic Cormorant period title +
  italian phrase + a `.v8-cart-ladder-switch` chip to cycle when
  more than one period qualifies. Sub copy reads "À la carte you'd
  pay X — cross a threshold and share a feast with la famiglia."
- `.v8-cart-ladder-primary` full-width paper tile for the
  default-pushed tier (the McDonald's "Make it a Meal" pattern):
  italic Cormorant "Most picked · il preferito" badge + headline
  "Make it a *Family*", italic Lora description with per-person
  framing (kicks in at ≥3 mains), tabular oxblood now-price with the
  à-la-carte strikethrough above and basil-deep "Save X" below.
- `.v8-cart-ladder-chip` paper tiles for the secondary tiers, grid
  layout (1- or 2-up). Decoy tier dims to 85% opacity.
- `.v8-cart-ladder-hint` ochre paper strip with the silhouette icon —
  fires when the cart is within `hintWithin` mains of the Family
  Feast threshold; copy: "Add N more pizzas or pastas to unlock
  *Festa di famiglia* — save up to X."
- Combo × Bundle clarity: when a combo deal is already active the
  primary CTA shows the *incremental* basil-deep savings alongside a
  muted "Replaces the active [combo name]" italic line so the
  customer understands the trade.
- Composer-sheet handoff, A/B variant resolution (SHA-256 hashed
  phone), and funnel beaconing (impression / composer_opened /
  composer_abandoned) all preserved.

## Loyalty components

All V8 as of Step 15. The `/rewards` surface lives at
`src/app/(public)/rewards/page.tsx`; see
[`../pages/loyalty.md`](../pages/loyalty.md) for the full
section-by-section contract. The component-level entries below cover
the rendering details.

### Rewards page sections — `.v8-rewards-*`

The page renders three internal sub-components inline:

- `<SignInSection />` — unauthenticated state. Basil-tinted star mark
  + italic Cormorant *Soci e amici* headline + phone input with +48
  prefix capsule + terracotta "Sign in" CTA. A "Nuovo qui?" card
  fades in below when the phone isn't recognised, with a basil
  "Join · iscriviti" CTA for phone-only auto-enrolment.
- `<ProfileSection />` — paper card with editable First name / Last
  name / Nickname / Phone fields. The Edit affordance flips it into
  a form with parchment-cream `.v8-rewards-input`s + terracotta
  "Save · salva" CTA.
- `<LoyaltyCardSection />` — paper card with a parchment-deep dashed
  inner card holding a 5×5 SVG "QR" placeholder (`.v8-rewards-loyalty-qr`
  + "SI" center monogram) + italic Lora "Show at pickup · mostra al
  ritiro" + an espresso "Add to Apple Wallet" disabled CTA with an
  ochre "Soon" ribbon.

### Tier card — `.v8-rewards-tier`

The visual centrepiece + permanent header. Espresso paper card with
parchment text, ochre/terracotta radial washes (via `::before` /
`::after`), top row (44px avatar + nickname + phone + sign-out), body
row (56px italic Cormorant ochre tabular point count + tier pill +
multiplier), tier-progress hairline rail with an ochre→terracotta-soft
gradient fill, and a 3-cell stats row (Orders · Multiplier · Week
streak). Platinum collapses the progress section.

### Tabs — `.v8-rewards-tabs` / `.v8-rewards-tab`

Horizontal-scroll pill row. Each tab carries italic Cormorant label +
italic Lora Italian sublabel (`Overview · panoramica`,
`Rewards · premi`, `Achievements · traguardi`, `Offers · offerte`).
Active tab flips to terracotta fill + parchment text with a soft drop.

### `<FamilyWalletPanel />` — `src/components/loyalty/FamilyWalletPanel.tsx`

V8 family wallet panel. `.v8-rewards-wallet` paper card with three
states: no wallet (basil "Create family wallet · crea famiglia" CTA),
pending invite (ochre confirm-code panel with italic Cormorant
*Invito in attesa*), active (2-up stat tiles for Pool earned ·
accumulati + Available · disponibili, members list with crown glyph
for the head + remove chip for head-only, terracotta italic
"Invite · invita" form, member-only "Leave this wallet" link).
Every business behaviour preserved verbatim
(`/api/customer/wallet/create / invite / confirm / remove / leave`,
dev-mode invite-code surfacing, refresh via `identify()` after every
mutation).

## Order-confirmation components

All V8 as of Step 14 — selector family `.v8-order-*` in
`themes/homepage/index.css`. See
[`../pages/order.md`](../pages/order.md) for the section-by-section
contract; the entries below cover the rendering details.

### `<OrderTracker />` — `src/components/order/OrderTracker.tsx`

The polling live-status display.

- **Vertical editorial stepper** — `.v8-order-tracker-steps` with
  three visible steps (Confirmed · confermato → Preparing · in
  preparazione → Ready · pronto). 48px dots:
  parchment-deep / basil-fill / terracotta-fill for
  future / completed / active. The active step pulses via
  `@keyframes v8-order-step-pulse`; a `.is-pending` active step
  swaps to ochre so the customer knows the truck hasn't confirmed yet.
  A dashed-line vertical rail (`.v8-order-tracker-rail`) connects the
  dots; a basil rail fill grows in height as steps complete.
- **Live tracking row** at the top — basil-deep pulsing dot
  (`@keyframes v8-order-ping`) + italic "Live tracking · in diretta"
  + a refresh chip. Flips to oxblood when the order is `cancelled`.
- **ETA card** — terracotta-tinted paper with a clock SVG + uppercase
  "ESTIMATED · STIMATO" + oxblood italic Cormorant 22px time value.
- **Order summary** card — `.v8-order-summary` with the bilingual
  "Your order · il tuo ordine" title, the fulfilment mode chip,
  per-line items, and a dashed-hairline total in oxblood Cormorant 22px
  tabular.
- Polls every 10s via `/api/orders?orderId=...`. `lastUpdated` is
  guarded with `suppressHydrationWarning` + a null initial state so
  the SSR'd HTML doesn't disagree with the hydrated client about
  which second it is.

### `<LoyaltyPointsEarned />` — `src/components/order/LoyaltyPointsEarned.tsx`

`.v8-order-loyalty` ochre paper card with a 38px italic Cormorant
`+N` count, bilingual "points earned · punti guadagnati" suffix,
"Balance: 47 pts · Bronze" line (the tier name italic oxblood), and
a small italic-Lora footer reminding the customer the points are
credited to the phone on the order.

### `<CustomerMilestone />` — `src/components/order/CustomerMilestone.tsx`

`.v8-order-milestone` round-number recognition card. 56px
parchment-circle holds the milestone icon (Star / Trophy / Gift /
PartyPopper for 1 / 5 / 10 / 25 / 50 lifetime orders); italic
Cormorant `<em>Bravo,</em> {firstName}!` headline; bilingual italic
body copy. Pop-in keyframe (`v8-order-pop`) on mount.

### `<PushOptInButton />` — `src/components/order/PushOptInButton.tsx`

- `.v8-order-push` — ochre-bordered paper pill: italic Cormorant
  "Notify me when ready · avvisami" with a Bell glyph. Error state
  flips the border to oxblood + swaps to BellOff.
- `.v8-order-push-confirmed` — basil-tinted strip when already
  subscribed: "You'll get a push when your order is ready · *quando
  è pronto*".
- Hides entirely when VAPID is unconfigured, the browser doesn't
  support push, or the customer denied permission.

### `<FeedbackSurvey />` — `src/components/order/FeedbackSurvey.tsx`

Three-step wizard rendered inside `.v8-order-card` +
`.v8-order-feedback*`.

- Step 1 (items): one `.v8-order-feedback-row` per ordered dish with
  a StarRating; rated rows flip to basil-tinted `.is-rated`.
- Step 2 (overall): three categories (Speed · velocità / Service ·
  servizio / Value · valore) with emoji glyph + label + StarRating,
  free-text textarea, terracotta "Almost done · quasi fatto" CTA.
- Step 3 (email): optional input + terracotta Submit CTA with
  paper-airplane glyph. Skip link underneath when blank.
- Thank-you state — basil-tinted check mark + "Grazie!" headline +
  ochre "+10 loyalty points · punti aggiunti" callout.
- Submission posts `/api/feedback` fire-and-forget; failure swallowed
  so the customer always reaches thank-you.

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

## Polish components — Step 16

Two small surfaces that were the last pre-V8 chrome inside V8 parent
components.

### `<NotifyMeForm />` — `src/components/landing/NotifyMeForm.tsx`

Email signup pill that lives inside `.v8-loc-notify` on closed-
location cards in the landing's LocationsGrid (today: Wrocław).

- `.v8-notify` — flex row with a `.v8-notify-input-wrap` parchment-
  cream email input (Bell glyph absolute-positioned on the left at
  `left: 12px`) + an ochre `.v8-notify-cta` italic Cormorant
  "Notify · avvisami" button.
- `.v8-notify-confirmed` — basil-tinted post-submit pill with a
  check glyph + italic Cormorant "*Ti avviseremo* — we'll let you
  know." Email is logged to the console as a `[Notify Me]` marker
  (TODO comment in source); a one-line POST to a future
  `/api/notify-me` endpoint is the only change to wire it up.

### `<CompliancePills />` — `src/components/location/CompliancePills.tsx`

Regulatory disclosure chip row under each menu item card.

- `.v8-comp-pills` — flex-wrap container.
- `.v8-comp-pill` — italic Cormorant 600 11px chip, 999px radius,
  font-feature `tnum + lnum` so the kcal number reads as tabular.
  Variants:
  - `.is-kcal` — parchment-deep editorial chip with an ochre stamp
    SVG (oxygen-droplet glyph) + `{N} kcal`. Fires when the truck is
    NYC zone or the operator opted into kcal disclosure +
    `item.nutrition?.calories` is set.
  - `.is-halal` / `.is-nonhalal` — basil-tinted ✓ Halal chip /
    oxblood-tinted Non-halal chip. Fires on SG trucks.
  - `.is-pork` — terracotta-tinted "🐷 Contains pork" chip.
  - `.is-alc` — ochre-tinted "🍷 Contains alcohol" chip.
- `.v8-comp-grade` — 22px circular medallion for SG NEA Nutri-Grade.
  The regulatory A/B/C/D colour signal is preserved but re-tinted
  through the V8 palette so it stays unambiguous while still
  reading editorial: `.is-A` basil-deep, `.is-B` basil, `.is-C`
  terracotta, `.is-D` oxblood.

Renders nothing on EU/PL trucks unless the operator opts into kcal
disclosure (settings.json → `compliance.byLocation[slug].calorieDisclosureRequired`).

## Pre-V8 orphan cleanup — Step H

Seven pre-V8 components were folded into inline V8 chrome by Steps
1-15 and then deleted in Step H once a final grep confirmed no live
importers. Listed here as a historical record so an archaeology dive
into the git log knows where the markup went:

| Deleted file                                          | Replaced by                                         |
| ----------------------------------------------------- | --------------------------------------------------- |
| `src/components/landing/CTASection.tsx`               | the V8 Soci rail closes the landing instead         |
| `src/components/location/SpeedGuarantee.tsx`          | inline `.v8-guarantee` in `MenuSection.tsx`         |
| `src/components/location/ComboDealsPreview.tsx`       | inline `.v8-combos` / `.v8-combo-card` in `MenuSection.tsx` |
| `src/components/location/SurpriseMe.tsx`              | inline `.v8-surprise` pill with scroll-and-highlight in `MenuSection.tsx` |
| `src/components/location/MenuCategoryNav.tsx`         | inline `.v8-cat-tabs` in `MenuSection.tsx`          |
| `src/components/location/MenuItemImage.tsx`           | inline per-category SVG sketch (`.v8-mi-illus`) in `MenuItem.tsx` |
| `src/components/loyalty/LoyaltyCard.tsx`              | inline `<LoyaltyCardSection />` in `rewards/page.tsx` |

### Cart family — all V8

After Steps 11, 11 follow-up, 12, and 13, every drawer-style surface
in the storefront reads as one paper-card vocabulary:

| Component                | Status        | Selectors                    |
| ------------------------ | ------------- | ---------------------------- |
| `<CartDrawer />`         | V8 (Step 11)  | `.v8-cart-*` shell           |
| `<CartItem />`           | V8 (Step 11)  | `.v8-cart-item-*`            |
| `<CartUpsell />`         | V8 (Step 11)  | `.v8-cart-pairs-*`           |
| `<DeliveryProgress />`   | V8 (Step 11)  | `.v8-cart-delivery-*`        |
| `<LoyaltyEarnPreview />` | V8 (Step 11+) | `.v8-cart-loyalty-preview-*` |
| `<CorporateOrderBanner />` | V8 (Step 11+) | `.v8-cart-corp-*`          |
| `<TierPerkBanner />`     | V8 (Step 11+) | `.v8-cart-perk-*`            |
| `<TodBanner />`          | V8 (Step 11+) | `.v8-cart-tod-*`             |
| `<ComboDealBanner />`    | V8 (Step 11+) | `.v8-cart-combo-*`           |
| `<SlotPicker />`         | V8 (Step 11+) | `.v8-cart-days/slot-*`       |
| `<BundleLadder />`       | V8 (Step 11+) | `.v8-cart-ladder-*`          |
| `<FloatingCartButton />` | V8 (Step 12)  | `.v8-float-cart`             |
| `<AddToCartToast />`     | V8 (Step 12)  | `.v8-cart-toast`             |
| `<ItemDetailDrawer />`   | V8 (Step 13)  | `.v8-detail-*`               |
| `<MenuItemsRegistrar />` | n/a (bridge)  | —                            |
| `<AbandonedCartBanner />` | V8 (Step 17, polish) | `.v8-abandoned-*`    |

Every component in the cart family is V8 — no exceptions.

### `<AbandonedCartBanner />` — `src/components/cart/AbandonedCartBanner.tsx`

The 30-second "still hungry?" nudge that surfaces when a customer
goes idle with items in their cart. Lives at the layout level (Step
11+ single-mount) and reads from `useCartStore.items` to decide
whether to schedule the timer.

- `.v8-abandoned` — fixed top-center paper card, sized
  `min(440px, 100% - 32px)`. Slides in via the dedicated
  `v8-abandoned-slide` keyframe (opacity + 16px translate-y over
  400ms cubic-bezier). Anchored under the sticky nav at
  `top: calc(var(--v8-nav-height) + 12px)` so it clears the
  header on every viewport.
- `.v8-abandoned-illus` — 38px parchment-deep circle with a
  basil-sprig-over-tomato glyph (the same hand-sketched vocabulary
  the cart items + detail drawer use).
- `.v8-abandoned-title` — italic Cormorant 15px "Still hungry?
  · *hai ancora fame?*" with the Italian phrase in muted italic.
- `.v8-abandoned-sub` — italic Lora 12px "**N** items waiting in
  your cart · *in attesa*" — tabular item count in Cormorant 600.
- `.v8-abandoned-cta` — terracotta italic Cormorant
  "Continue · continua →". Opens the layout-level `<CartDrawer />`
  via `useCartUIStore.setDrawerOpen`.
- `.v8-abandoned-dismiss` — line-bordered round × button; hover
  flips to oxblood. Sets `dismissed = true` so the banner stays
  hidden for the rest of the session.
- `body.v8-cart-open` fades the banner to opacity 0 + drops
  pointer events — no nagging while the drawer is up.
- `prefers-reduced-motion` disables the slide animation.
