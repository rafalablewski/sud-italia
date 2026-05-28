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
  `pointer-events: none`. **Their low opacities (12–50%) are the
  defence against text-overlap at narrower viewports** — the
  ornaments are anchored to the section corners with percentage
  offsets, so on a 320–400px phone they sit close to the kicker /
  CTAs but read as paper texture, not as glyphs competing with copy.
  Don't push any of them past 60% opacity without verifying the
  smallest target width — the V8 spec deliberately keeps them
  subtle, not foreground.
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

**Closes with the tricolore, not a chevron.** The previous dark-
gradient hero had a `<ChevronDown />` "scroll for more" affordance
bouncing at the bottom; the V8 port removes it intentionally. The
tricolore hairline does the same closing-the-section job, and the
location CTAs already point the visitor down the page (or directly
into the order flow). Adding the chevron back would re-introduce the
2010s SaaS landing-page trope V8 explicitly avoids — don't reach
for it.

### Locations grid — `<LocationsGrid />`

V8 Trattoria treatment — alternating warm-paper section
(`.v8-ps.v8-ps-alt`) with a centred header and a 1 → 2-column grid of
paper cards. Lives at the `#locations` anchor for the hero kicker's
"Locations" link.

- **Section header** uses the new shared `<eyebrow / title / sub>`
  primitives. Eyebrow: `THE TRUCKS · le botteghe` in uppercase
  oxblood Cormorant, em-dashes flanking the line. Title:
  `Two addresses, one family` — Cormorant 600 with an italic
  `<span class="it">one family</span>` flipping the second clause
  to oxblood italic. Subtitle: italic Cormorant muted, "Two trucks,
  one kitchen, one nonna who taught us the dough."
- **One card per location** (Kraków + Warszawa today, Wrocław auto-
  shows as Coming Soon because `isActive: false` in the seed data).
  Cards are paper rectangles with a parchment-deep gradient ground.
- **Per-slug pen-sketch illustration** in the card's top 180px panel:
  wood-fired oven (Kraków), Vespa with pizza box (Warszawa), a market-
  stall fallback (any future location, until its slug is hand-drawn).
  Same paper-grain noise overlay as the body canvas at 70% opacity.
- **Tricolore hairline** (2.5px, the shared `.v8-tricolore`) sits
  between the illustration and the body — reads as a separator, not
  a closer.
- **Card body** is a flex column ending in the CTA pinned to the
  bottom. Lays out:
  - **City name** (Cormorant 600, 32px, espresso) + **live status pill**
    on the same baseline row. The pill is basil-tinted with a pulsing
    terracotta dot when open, muted-brown with a still dot when active
    but closed ("Closed now · chiuso ora"), and ochre when the location
    isn't `isActive` yet ("Coming soon · in arrivo"). Status reads
    from `isLocationOpenNow()` — Rule #1, real time-of-day, never a
    decorative pill.
  - **Info rows** with dashed-underline separators: terracotta pin
    icon + address, terracotta clock icon + the full week-pattern
    hours string in a single `.v8-hours-line`.
  - **Description** in italic Cormorant 16px (`location.shortDescription`).
  - **Attribution note** in italic Cormorant 13px with an ochre
    left border, drawn from the new optional `location.teamLead`
    field on `Location` ("Cooked by Giuseppe and family" / "Cooked
    by Anna and crew"). Falls back to nothing when unset, so a
    future location without a known team lead simply doesn't get
    the note instead of showing a placeholder.
  - **CTA** — terracotta-fill button "View Menu & Order · vedi il
    menù & ordina →", links to `/locations/{slug}`. On inactive
    locations the CTA is replaced with the existing `<NotifyMeForm />`
    so visitors can leave their email; bilingual "avvisami
    all'apertura" subtitle above the form.
- **Card hover** lifts 4px with a deeper warm-brown drop shadow
  (350ms ease). No aggressive scale.

The new `.v8-ps`, `.v8-ps-alt`, `.v8-ps-head`, `.v8-ps-eyebrow`,
`.v8-ps-title`, `.v8-ps-sub`, `.v8-page-inner` primitives are
**reusable** — Bundles, Famiglia, About and the rest of the V8
sections compose against the same classes so spacing, type ladder
and the alt-paper rhythm stay identical across the landing. See
[`../theme/components.md`](../theme/components.md#section-primitives-v8-ps).

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
