# Homepage — Menu (`/locations/[slug]`)

← back to [Homepage README](../README.md)

The location's menu surface. Each location has its own page rendered
from `src/app/(public)/locations/[slug]/page.tsx`. The page composes
five blocks under the public layout.

| Block            | Component                                                  |
| ---------------- | ---------------------------------------------------------- |
| Location hero    | `src/components/location/LocationHero.tsx`                 |
| Menu sections    | `src/components/location/MenuSection.tsx` (per category)   |
| Location info    | `src/components/location/LocationInfo.tsx`                 |
| Loyalty pitch    | `src/components/location/LoyaltySection.tsx`               |
| Floating cart    | `src/components/cart/FloatingCartButton.tsx`               |

## The page contract

The menu page is the **conversion surface**. Its single job: get the
visitor to "added to cart" with as few decisions as possible.

This means:

- The first thing visible (after the hero) is the **menu**, not
  marketing copy. No "About this location" between hero and items.
- Categories are tabbed at the top of the menu — pizza first
  (Sud Italia is pizza-led), then pasta, then sides / drinks /
  desserts.
- Every item card has an `Add` button. No item is "request only".

## Section-by-section

### Back chip — `<Link href="/">`

The location page opens with a small oxblood-tinted back chip
("Home · la casa") rendered ABOVE the hero by `<LocationHero />`.
Pill-shape, hover swaps to oxblood fill with parchment text. Lets
a visitor who arrived deep (search engine, cross-link, share URL)
hop back to the landing without scrolling up to the nav. Lives at
the `.v8-back-chip-wrap` container — 14/18px top padding, 1180px
max width, shares the column gutter with the rest of the layout.

### Location hero — `<LocationHero />`

V8 Trattoria treatment — a centred parchment hero with a per-slug
pen-sketch illustration above the city name. Compact relative to the
homepage hero (the visitor is here to order, not to be wowed) but
keeps V8's hospitality voice.

- **Parchment canvas** with a soft fade to parchment-deep at the
  bottom (a vertical gradient that ramps from transparent → 45%
  parchment-deep). Line-soft hairline border-bottom separates it
  from the menu section below.
- **Basil-sprig ornament** top-left (re-uses the `.v8-hero-orn-basil-tl`
  positioning from the landing hero) so the location page reads in
  the same brand family.
- **Per-slug hero illustration** (360×180 detailed SVG, wider /
  more detailed than the 220×140 LocationsGrid card sketches):
  - `krakow` — wood-fired oven with Kraków-style rooftops, flames,
    chimney, peel, a floating tomato + basil garnish.
  - `warszawa` — Vespa with the "Sud Italia" pizza box on the back +
    Warszawa-style flat skyline + basil garnish.
  - Generic fallback — market awning + crates of tomatoes / basil,
    used until a new city's dedicated illustration lands.
- **`.v8-loc-hero-tricolore`** — small 80×3px Italian-flag hairline
  pill between the illustration and the city name.
- **City name** in Cormorant 44/60px ≥md, espresso, tight letter-
  spacing. An italic terracotta tagline stacks below at 0.55em
  (V8's "Kraków · our first home · la nostra prima casa" pattern).
- **Sub line** — italic Cormorant 17px, `<span>` for primary copy +
  `.bi-sec` span for the Italian variant, optional trailing
  `<em>` for the emphasis tail ("where it all began"). Per-slug
  marketing copy in `LocationHero.tsx`'s `LOC_COPY` map.
- **Status pill** — basil-tinted, terracotta-dot pulse when within
  service hours, muted-brown when outside. Uses the new
  `getCurrentHourSlot(location, now?)` helper to render the **real**
  close time: `Open until 21:00 · aperto fino alle 21:00`. Outside
  hours: `Closed now · chiuso ora`. Mount-gated so SSR/client agree.
- **Marketing copy lives locally.** Tagline + sub are V8's brand
  voice keyed by slug; new locations fall back to a generic
  `defaultCopy()` derived from the existing `teamLead` field. The
  Location type stays operator-data only — same trade-off bundles
  + the homepage hero took.

### Menu section — `<MenuSection />`

V8 Trattoria treatment — the entire menu surface (header, search,
live activity, category tabs, guarantee banner, combo cards,
surprise button, item grid) sits inside a single soft paper card
(`.v8-menu-card`). The previous per-category section pattern is
gone; the V8 design uses a single card with category tabs that
filter the grid in place.

- **Wrapper** — `.v8-menu-card` (parchment-deep paper with shared
  shadow-paper, 14px radius, 22/28px padding ramp). Renders at the
  `#menu` anchor; the location-hero's status pill scrolls here on
  tap (the floating cart button also lands the visitor here).
- **Section header** uses the shared `.v8-ps-eyebrow / -title / -sub`
  primitives — "The menu · il menù", "What comes out of *the oven*"
  (italic-oxblood "the oven"), italic-Cormorant sub.
- **Search input** (`.v8-menu-search`) — paper-card pill with a
  terracotta search SVG and italic Cormorant placeholder. Search
  filters across `name`, `description`, and `tags` (case-insensitive)
  in the existing data wiring. A small clear-X button surfaces when
  the field is non-empty.
- **Per-location live activity strip** (`.v8-live-act`) — italic
  Cormorant line with a pulsing basil pip, "X orders in the last
  hour · X ordini nell'ultima ora", a separator dot, and
  "Trending · in tendenza: <item>" with the trending item in
  italic oxblood. Reads from `simulateLiveActivity(locationSlug)`,
  refreshes every 30s, mount-gated to avoid the SSR/client
  Math.random() mismatch.
  - This is the V8 location of the live-activity surface — Step 8
    removed it from rendering above the menu to fix a duplicate-
    ticker-band finding; Step 9 re-introduces it here, inside the
    menu card, where V8's mockup places it.
- **Category tabs** (`.v8-cat-tabs`) — terracotta-bordered pill row
  with an "All" tab + one per active category (Pizza / Pasta /
  Antipasti / Panini / Drinks / Desserts). Active tab fills with
  terracotta + ochre-light count chip. Categories not in the
  bilingual map (`CAT_IT`) render English-only — falls back without
  the `· bibite` style subtitle.
  - **"All" is the default tab.** V8's mockup designs the menu
    around browsing rather than landing on a single category — the
    All tab shows every available item at once. The pre-V8 site
    landed on the first category (Pizza); V8 deliberately doesn't.
- **Sort affordance** (`.v8-cat-sort`) — small popover anchored at
  the right end of the category tab row. Trigger reuses the
  `.v8-cat-tab` pill shape with an up/down-arrow SVG and "Sort"
  label; click opens a parchment-paper popover with three radio-
  style options: `Pizzaiolo's layout · scelta dello chef` (the
  audit §4.4 menu-engineering hierarchy — the default), `Price:
  low → high · prezzo crescente`, `Price: high → low · prezzo
  decrescente`. The trigger pill fills terracotta when a non-default
  sort is active, signalling "you're not on the menu-engineering
  default" without taking up extra space.
  - V8's mockup doesn't ship a sort UI — the popover is an
    intentional addition to preserve the pre-V8 price-sort feature
    inside the V8 chrome. Removing the sort dropdown without an
    affordance would be a real feature regression.
- **15-minute guarantee banner** (`.v8-guarantee`) — ochre-tinted
  card with a 4px ochre→terracotta left rail, a sundial SVG icon,
  italic Cormorant title "15 minutes guaranteed · 15 minuti
  garantiti", and a Lora sub "Ready in 15 minutes — or your next
  drink's on us."
- **Inline combo deals** (`.v8-combos`) — 1→2-col grid of compact
  combo cards, each with a tricolore left rail, a small SVG (pizza
  wedge for the Italian Classic, pasta bowl for the Pasta Combo),
  the combo name in italic Cormorant 18px, the composition in
  italic Cormorant 12.5px muted, and a rotated wax-seal stamp
  ("−10%" / etc.) on the right. Renders the first two
  `DEFAULT_COMBO_DEALS` entries; the full bundle ladder lives on
  the homepage `<BundlesShowcase />`.
- **Surprise me button** (`.v8-surprise`) — dashed-ochre pill with
  the V8 dice-pattern SVG. Click picks a random available item,
  resets the filter to All, scrolls the picked card into view, and
  pulses a warm terracotta + ochre glow around it for 2.4s so the
  visitor sees the pick **in context** with the rest of the menu
  (rather than filtering everything else out). The highlight animation
  is `.v8-menu-item-highlight` keyframed via `v8-menu-item-highlight-pulse`
  — self-clears via a 2.4s `setTimeout` that's cleaned up on
  unmount. Repurposes the existing `setActiveCategory` + scroll-to-
  data-attribute pattern; no separate selection store needed.
- **Item grid** (`.v8-menu-items`) — 1 → 2-col grid. Items render
  via the V8 `<MenuItemCard />` (see the spec entry in
  [`../theme/components.md`](../theme/components.md#menuitemcard--srccomponentslocationmenuitemtsx)).
  Items can claim 2-col span when activeCategory === null (the "All"
  tab) and `menuRole === "hero"`.
- **Empty state** (`.v8-menu-empty`) — italic Cormorant muted line,
  with a clear-search affordance if the user is searching.

The pre-V8 MenuSection imported `<SpeedGuarantee />`,
`<ComboDealsPreview />`, `<SurpriseMe />`, and `<MenuCategoryNav />`.
Those components are still in the repo (other surfaces might use
them) but the V8 menu inlines bespoke blocks instead — keeping the
markup auditable against the mockup without coordinating restyles
across 5 components.

`<ReorderSection />` (returning-customer rail) and
`<SeasonalSpecials />` (LTO items) render ABOVE the V8 menu card
when active — V8's mockup doesn't ship them but they're valuable
existing features. They sit outside the V8 wrapper so the menu
card stays clean.

### Item detail drawer — `<ItemDetailDrawer />`

Tapping the **Details · dettagli** link on any menu card opens the V8
portalled detail drawer (`.v8-detail-*` selector family). See the
dedicated entry in
[`../theme/components.md`](../theme/components.md#-itemdetaildrawer-----srccomponentslocationitemdetaildrawertsx)
for the full chrome breakdown; the sections it surfaces are:

- Hero — dish glyph + italic Cormorant name + italic Lora description
- Meta — oxblood price + prep time + calories editorial row
- Allergens · allergeni — oxblood chip row or basil "no major
  allergens · senza allergeni maggiori" line
- Valori nutrizionali · nutrition — Cormorant-labelled bilingual bars
  for calories / protein / carbs / fat / fiber / sodium
- Provenienza · sourcing — italic Lora ingredient-origin quote in a
  parchment-deep paper card
- Sticky paybar — terracotta "Add to cart · aggiungi al carrello +
  [price]" CTA

**Single-mount** since Step 13 — the drawer lives once at the layout
level and opens via `useCartUIStore.setDetailItem({ item,
locationSlug, popularThisWeek })`. The previous setup mounted one
drawer per menu card, so a 35-dish Kraków menu used to portal 35
drawer instances; this is now one.

### Location info — `<LocationInfo />`

The "everything else" block — opens between menu and loyalty for
visitors who scrolled past the order intent.

- Full address with embedded map (lazy-loaded).
- Service hours by day, with today's row highlighted.
- Service modes: dine-in / takeout / delivery (with delivery radius
  if applicable).
- Contact: phone (tap-to-call), email (optional).

### Loyalty pitch — `<LoyaltySection />`

Same primitive as the landing. The repeat is intentional — visitors
who arrive directly at a menu page (via search, a shared link, a
QR code) should still see the loyalty value proposition.

### Floating cart button — `<FloatingCartButton />`

The persistent in-thumb-reach order surface.

- Bottom-right on desktop, bottom-centre on mobile.
- Shows item count + total when the cart is non-empty.
- Tap opens the `CartDrawer` (see [`checkout.md`](./checkout.md)).
- **`AddToCartToast`** fires on add — a 3-second toast confirming
  "Margherita added" with a `View cart` link in the toast itself.

## The rules unique to the menu

1. **Read the menu via `getMenuWithOverrides(slug)`.** Never read raw
   from `src/data/menus/{krakow,warszawa}.ts` — overrides applied at
   runtime from the admin Menu surface have to take effect.
2. **Sold-out is sticky for the day.** A sold-out item stays sold-out
   for the rest of the service day even if reset in admin — avoids
   the embarrassment of "added to cart, then sold out".
3. **Cross-sells suggest espresso + dessert on every pizza / pasta**
   (CLAUDE upsell rule + `getCartSuggestions`). The rule is enforced
   in the lib, not optional per location.
4. **Combo discounts must actually discount** — when a cross-sell
   triggers a combo (espresso + pizza = 10% off), the cart total
   must reflect the discount, not just the badge (CLAUDE rule 8 +
   `getActiveComboDeals`).
5. **Customer identity is captured on add-to-cart, not earlier.** The
   `CustomerProvider` reads / writes the cookie; the cookie is set
   at checkout, not at landing. Zero friction (CLAUDE rule 6).

## Mobile

The menu page is mobile-first. Specifically:

- Category tabs become a horizontal scroll strip at the top, sticky on
  scroll.
- Item cards collapse to 2-column or 1-column depending on viewport.
- The detail drawer is a bottom sheet (75% viewport height) instead of
  a side drawer, with the `Add to cart` button always visible at the
  bottom.
- The floating cart button is bottom-centre, full-width when active.

## What the menu page is not

- It is **not** a category-filter shopping experience like Amazon. We
  have ~30 items per location; the user can see them all by scrolling.
  No "filter by gluten-free / under 30 zł / spicy" mini-app — dietary
  chips on cards do that job inline.
- It is **not** the cart. Items + their detail drawers live here; the
  cart contents + checkout flow live in `CartDrawer`
  ([`checkout.md`](./checkout.md)).
- It is **not** chain-wide. Each location's menu page reads its own
  menu — even if 90% of items are shared, the per-location overrides
  (price, availability, seasonal items) make this a per-location
  surface.

The menu page is the **conversion surface** — its job is converting
visitor → cart with minimum friction.
