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

### Menu sections — `<MenuSection />`

The repeating block: one per category.

- **Category header:** name (Cormorant Garamond 600, 24px), short description,
  optional "Chef's pick" badge on featured items.
- **Item grid:** responsive grid of item cards (2 cols mobile, 3 cols
  tablet, 4 cols desktop).
- **Item card:** name (Cormorant Garamond 500, 18px), description (Lora 400,
  14px, 2-line clamp), price (Lora 700, 18px, with `zł` suffix at
  14px), dietary tags (vegetarian / GF / spicy as inline chips), the
  `Add` button.
- **Allergens** show on item card hover as a tooltip and on the
  detail drawer always.
- **Sold-out items** (per `/api/menu/availability`) render with a
  diagonal strikethrough on the price and a "Sold out today" pill
  instead of the `Add` button. Don't hide them — visitors searching
  for a specific item shouldn't think the site is broken.
- **The empty image-box pattern is forbidden** (CLAUDE recipes rule
  carries over — until real food photography exists, cards lead with
  type, not a placeholder thumbnail).

### Item detail drawer

Tapping any item opens a portalled side drawer with:

- Full description, allergens, dietary tags, ingredients (read from
  the chain-wide recipe).
- Modifiers (size / crust / extra toppings) with per-modifier price
  delta.
- Quantity stepper.
- `Add to cart` primary button (sticky bottom on mobile so it stays
  thumb-reachable).
- `Cross-sell rail` below: "Pairs with espresso, dessert" — per
  `src/lib/upsell.ts :: getCartSuggestions` (CLAUDE rule: pizza /
  pasta always suggest espresso + dessert).

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
