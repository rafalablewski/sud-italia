# Homepage — Home

← back to [Homepage README](../README.md)

The storefront landing — the first impression at `/`. Six stacked
sections under the public layout's `<Header />` (the V8 Trattoria nav)
+ `<LiveTicker />` (espresso strip under the nav) + `<Footer />`,
rendered in `src/app/(public)/page.tsx`.

| Section          | Component                                                  |
| ---------------- | ---------------------------------------------------------- |
| Live ticker      | `src/components/layout/LiveTicker.tsx` (shipped under nav, all routes) |
| Hero             | `src/components/landing/HeroSection.tsx`                   |
| Locations grid   | `src/components/landing/LocationsGrid.tsx`                 |
| Bundles showcase | `src/components/landing/BundlesShowcase.tsx`               |
| About            | `src/components/landing/AboutSection.tsx`                  |
| Loyalty section  | `src/components/location/LoyaltySection.tsx` (shared)      |
| CTA              | `src/components/landing/CTASection.tsx`                    |

## The page contract

The landing answers exactly four questions, in order:

1. **What is this?** (Hero — Italian street food, Neapolitan pizza,
   the truck identity.)
2. **Where can I get it?** (Locations grid — Kraków, Warszawa, with
   service hours + the order CTA per location.)
3. **What's a good first order?** (Bundles showcase — the curated
   "if you don't know what to get" combos.)
4. **Should I trust this brand?** (About — story, sourcing, the
   Italian-authenticity proof points.)

Loyalty + CTA close the page: "by the way, you earn points" + "find
your nearest truck, place an order".

## Section-by-section

### Hero — `<HeroSection />`

V8 Trattoria treatment — centred parchment block, no full-bleed
photography. The hero earns the "one place Cormorant leads" rule
[`typography.md`](../theme/typography.md) reserves for it.

- **Background ornaments** — five non-interactive SVG sprites
  scattered behind the content: two basil sprigs (top-left rotated
  -12°, bottom-right rotated 150° and at 40% opacity), an oxblood
  triple-ellipse stain (top-right, 15% opacity), an ochre stain
  (bottom-left, 12%), and a tomato (top-left interior, 35%). All
  positioned absolutely under the centred column, `z-index: 1`,
  `pointer-events: none`.
- **Live "Open now" kicker** — small oxblood-tinted pill with a
  pulsing green dot + bilingual `Open now · aperto ora` (or
  `Closed now · chiuso ora` outside hours), followed by every active
  location's city. Status is **live** — `isLocationOpenNow()` reads
  each location's `hours` array against the current time. Outside
  hours the dot fades from `--color-italy-green` to muted-brown and
  the copy degrades; the kicker never shows "Open" while the trucks
  are closed (CLAUDE Rule #1).
- **Display headline + Italian sublabel** — Cormorant Garamond 600
  at 44px / 76px ≥md, line-height 1.02, espresso colour. Italian
  italic sublabel ("La pizza, fatta come a Napoli") sits directly
  below in Cormorant 19px / 24px, muted-brown.
- **Hand-drawn underline** — a 220px terracotta SVG squiggle below
  the sublabel with a circle terminal. Strokes use `currentColor` so
  a token change ripples in one place. Centred via `margin: 0 auto`.
- **Lede paragraph** — Lora 16/18px, espresso-soft. Italian phrases
  (`<em>fior di latte</em>`, `<em>vino della casa</em>`) flip to
  italic Cormorant + espresso, the same bilingual-as-typographic
  signal the `.it` helper uses elsewhere.
- **CTA row** — two terracotta-fill "Order in {City}" buttons (one
  per active location, links to `/locations/{slug}`) + a ghost
  oxblood "Our Story" button (links to `#famiglia`). Each button
  carries the italian phrase as a `.bi-sec` italic to the right
  ("Ordina a Kraków", "La nostra storia"). Hover lifts 2px and
  swaps to terracotta-dark with a 16px / 60% terracotta shadow.
- **Tricolore hairline** — 200×3px Italian-flag gradient closes the
  hero, 70% opacity.

A single, confident hero — never rotating slides. The location CTAs
are the entry points to ordering; the ghost Story CTA is the brand
side-route.

### Locations grid — `<LocationsGrid />`

- One card per location (Kraków, Warszawa today).
- Each card: city name (Cormorant Garamond 600), address line, today's hours,
  status pill (`Open now` / `Opens at 11:00` / `Closed`), primary
  CTA `Order from {city}` → `/locations/{slug}`.
- **Status pill is live** — derives from current time vs
  `serviceHours` in `src/data/locations.ts`. The customer sees if
  they can order *right now* without clicking through.
- Card hover: lift 1px + shadow softens (no aggressive scale).

### Bundles showcase — `<BundlesShowcase />`

- 3–5 curated bundle cards: name, contents, price, savings vs à-la-
  carte.
- Pulled from the same scheduled-bundles surface admin controls
  (`/admin/scheduled-bundles`) — when a manager activates a new
  lunch combo, it appears here.
- Each bundle card has a `View on {city} menu` CTA that deep-links to
  the location's menu with the bundle expanded.

### About — `<AboutSection />`

- The "why us" copy: the family story, the sourcing line, the
  Neapolitan-style detail (oven temperature, dough hydration,
  imported tomatoes).
- Two visual pillars: chef portrait + ingredient close-up.
- This is the only landing section where Cormorant Garamond body text appears
  (display-italic for one pull-quote per section). Lora elsewhere.

### Loyalty section — `<LoyaltySection />`

- One-liner pitch ("Earn a point for every złoty"), tier ladder
  preview (Bronze → Silver → Gold → Platinum), the
  `Join in 10 seconds` CTA (phone number only — CLAUDE rule 6, no
  account creation).
- Reuses the same loyalty primitive as `/locations/{slug}` so the
  tier ladder reads identically across surfaces.

### CTA — `<CTASection />`

- One last "order now" closer with the primary brand-red button.
- No newsletter signup, no "join our community", no friction. A
  single tap to the menu.

## The rules unique to the landing

1. **One hero, one CTA per section.** Every section pulls the eye to
   one action — never two competing CTAs side-by-side.
2. **Status pills are live, not decorative.** "Open now" must mean
   "you can place an order now". If the data isn't live, the pill
   isn't shown.
3. **Bundles + Loyalty pull from real admin config.** Never hardcode
   what a bundle costs or what the loyalty tier thresholds are —
   read from the same source admin writes to.
4. **Cormorant Garamond appears only in the Hero + About pull-quote.** Display
   restraint is a brand decision — over-using it on every section
   would flatten the type hierarchy.
5. **No popups on the landing.** No exit-intent modal, no
   newsletter overlay, no "would you like to chat?" interrupt. The
   chat widget is fixed in the footer (`ChatWidget`) — accessible,
   never aggressive.

## Mobile

The landing is the most-viewed page on mobile by an order of magnitude.
The stack collapses to single-column at `< 720px`; the Hero pares back
to a tighter aspect ratio with the primary CTA fixed within thumb
reach (bottom 1/3 of the viewport). Locations grid stacks vertically;
cards keep their `Open now` pill prominent.

## What the landing is not

- It is **not** a menu page. Items, prices, modifiers live on
  `/locations/{slug}` — see [`menu.md`](./menu.md).
- It is **not** the order flow. Adding to cart starts on the menu
  page; the cart + checkout live in the drawer (see
  [`checkout.md`](./checkout.md)).
- It is **not** a sign-up funnel. The landing's job is "get the visitor
  to a location's menu in one click" — every section ladders to that.

The landing is the **first impression + the routing surface** — it
tells the visitor what's here and routes them to the menu they want.
