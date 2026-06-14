# Homepage — Home

← back to [Homepage README](../README.md)

The storefront landing — the first impression at `/`. Five stacked
sections under the public layout's `<Header />` (the V8 Trattoria nav)
+ `<Footer />`, rendered in `src/app/(public)/page.tsx`.

| Section          | Component                                                  |
| ---------------- | ---------------------------------------------------------- |
| Hero             | `src/components/landing/HeroSection.tsx`                   |
| Locations grid   | `src/components/landing/LocationsGrid.tsx`                 |
| Bundles showcase | `src/components/landing/BundlesShowcase.tsx`               |
| Famiglia strip   | `src/components/landing/AboutSection.tsx` (file name kept) |
| Soci / loyalty   | `src/components/location/LoyaltySection.tsx` (shared, V8 dark rail) |

## The page contract

The landing answers exactly four questions, in order:

1. **What is this?** (Hero — Italian street food, Neapolitan pizza,
   the truck identity.)
2. **Where can I get it?** (Locations grid — Kraków, Warszawa, with
   service hours + the order CTA per location.)
3. **What's a good first order?** (Bundles showcase — the curated
   "if you don't know what to get" combos.)
4. **Should I trust this brand?** (Famiglia strip — italic
   Pizzaiolo voice quote tying the dough to a 1974 Neapolitan
   grandmother. One sentence of brand grounding between bundles
   and the loyalty pitch.)

The Soci rail closes the page: "by the way, you earn points" on a
dark espresso block with the "Start earning points" CTA pointing to
the dedicated `/rewards` route. V8 does NOT close with a second
red-gradient order CTA — by then the visitor has seen 6+ order
entry points already.

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
  hero, 70% opacity, sits `28px` below the CTA row. The section's
  bottom padding is **zero** — the next `.v8-ps` section's own
  56/80px top padding handles the rhythm — don't reintroduce any
  bottom padding here, it stacks into the dead band the V8 audit
  flagged.

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

V8 Trattoria treatment — alternating-veil section (`.v8-ps.v8-ps-alt`,
now a faint translucent-parchment veil over the aurora rather than an
opaque band) with a centred header and a 1 → 2-column grid of
**liquid-glass** cards. Lives at the `#locations` anchor for the hero
kicker's "Locations" link.

- **Section header** uses the new shared `<eyebrow / title / sub>`
  primitives. Eyebrow: `THE TRUCKS · le botteghe` in uppercase
  oxblood Cormorant, em-dashes flanking the line. Title:
  `Two addresses, one family` — Cormorant 600 with an italic
  `<span class="it">one family</span>` flipping the second clause
  to oxblood italic. Subtitle: italic Cormorant muted, "Two restaurants,
  one kitchen, one nonna who taught us the dough."
- **One card per location** (Kraków + Warszawa today, Wrocław auto-
  shows as Coming Soon because `isActive: false` in the seed data).
  Cards are `.v8-loc-card` **glass surfaces** — translucent parchment
  (`--glass-fill`) over the aurora with a `--glass-stroke` border, the
  warm `--glass-shadow` drop, and a hover sheen sweep (`::after`).
- **Per-slug pen-sketch illustration** in the card's top 180px panel:
  wood-fired oven (Kraków), Vespa with pizza box (Warszawa), a market-
  stall fallback (any future location, until its slug is hand-drawn).
  The illustration tile is now a translucent warm wash (no opaque
  parchment-deep base) so the aurora reads through; the same paper-grain
  noise overlay still sits on top at 70% opacity for tooth.
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
- **Card hover** lifts 6px with a deeper `--glass-shadow` drop + the
  sheen sweep (350ms ease). No aggressive scale. Falls back to the
  opaque pre-glass card under `@supports not (backdrop-filter)`.

The new `.v8-ps`, `.v8-ps-alt`, `.v8-ps-head`, `.v8-ps-eyebrow`,
`.v8-ps-title`, `.v8-ps-sub`, `.v8-page-inner` primitives are
**reusable** — Bundles, Loyalty, the future CTA section compose
against the same classes so spacing, type ladder, and the
alt-veil rhythm stay identical across the landing. The Famiglia
strip is the **deliberate exception** — V8 strips the eyebrow /
title / subtitle chrome so the quote lands as a single
typographic gesture between Bundles and Loyalty (see the Famiglia
strip section below). See
[`../theme/components.md`](../theme/components.md#section-primitives-v8-ps).

### Bundles showcase — `<BundlesShowcase />`

V8 Trattoria treatment — four **liquid-glass** cards inside a wider
`.v8-ps` section (`.v8-bundles-section`) that breaks out of the standard
`.v8-page-inner` 1180px column to a 1500px hard cap, with a parchment
gutter at the iframe edges. The Famiglia / Pranzo / Spicchio Notturno
/ Il Classico cards correspond to the four meal-window slots V8
designed (family / lunch / late-night / auto-combo).

- **Section header** uses the shared `.v8-ps-*` primitives:
  - Eyebrow: `Today's bundles · menù del giorno` (em-dash flanked).
  - Title: `Pick a bundle.` + italic `<span class="it">Skip the
    maths.</span>` — the V8 italic-clause-in-title pattern.
  - Subtitle: Lora muted with italic-Cormorant `<em>` Italian names
    (`Famiglia`, `Pranzo`, `Spicchio`, `Il Classico`) inline with the
    English copy.
- **Grid** is 1 → 2 → 4 columns across mobile / tablet (≥640px) /
  desktop (≥1000px), gap widens to 28px ≥1400px.
- **Glass surface** — each card is `.v8-bundle` translucent parchment
  (`--glass-fill`) over the aurora with a `--glass-stroke` border, the
  warm `--glass-shadow` drop, and a hover sheen (`::after`). The 5px
  accent stripe doubles as the surface's top-edge light catch, so the
  bundle card skips the generic refraction line. Falls back to the
  opaque pre-glass card under `@supports not (backdrop-filter)`.
- **Per-card variant accents** drive the top stripe (5px gradient
  from accent → accent-soft), the icon colour, and the uppercase
  english subtitle colour:
  - `.v8-bundle-family` — rose (`#C75A6A` → `#E89AA1`)
  - `.v8-bundle-lunch` — ochre → ochre-light
  - `.v8-bundle-night` — espresso → espresso-soft
  - `.v8-bundle-classic` — basil → softer basil
- **Card body** is a flex column: SVG icon in a 56px translucent
  circle (family figures / sundial / crescent moon / sparkle), a
  dashed-border tag pill in the accent (`for 2–3 people · per 2–3
  persone`), the bundle name — **English marketing headline** in
  italic Cormorant 24px on top (Family Pack / Pizza Lunch+ / Late-
  Night Slice / Italian Classic) + **Italian short name** as the
  uppercase Cormorant subtitle in the accent colour (Famiglia /
  Pranzo / Spicchio Notturno / Il Classico). The headline + Italian
  subtitle are local marketing copy in `BundlesShowcase.tsx` — not
  the bundle's `.tier` field, because the homepage marketing voice
  is allowed to be looser than the cart drawer's tier label. Then
  the price row, then the Lora description with italic-Cormorant
  `<em>` Italian phrases (`limonata`, `dolce`, `Margherita`, etc.).
  The description uses `flex: 1` so cards in the same row align at
  the description bottom and the card-edge baseline.
- **Price treatments — two kinds:**
  - **Money** — `now` in oxblood Cormorant 28px tabular, `was` as
    italic muted strikethrough. Real prices via
    `priceFromBundle()` reading `DEFAULT_BUNDLES.priceGrosze` /
    `refPriceGrosze` — Rule #1, no hardcoded zł on the homepage.
  - **Savings** — for the Italian Classic combo that auto-applies a
    percent discount instead of pinning a fixed price; reads
    `DEFAULT_COMBO_DEALS.italian-classic.discountPercent`.
- **Foot note + CTA** — italic Cormorant footnote ("Bundles activate
  automatically in your cart when eligible.") + a terracotta "Order
  now · inizia un ordine →" CTA reusing the hero's `.v8-hero-cta`
  pill. CTA links to the **primary active location** (`getActiveLocations()[0].slug`)
  — the cart drawer surfaces the actual bundle ladder once the
  customer's on a menu.
- **Card hover** — translateY(-6px) + deeper `--glass-shadow` drop +
  the sheen sweep.

Per-location admin overrides (`LocationUpsellConfig.bundles`) do
**not** reflect here — the homepage is location-agnostic. Operators
retuning a bundle dramatically away from the seed should expect a
homepage-vs-cart mismatch during the experiment; rolling the seed
config forward to match is the fix.

### Famiglia strip — `<AboutSection />`

V8 Trattoria treatment — a slim italic-Cormorant **quote strip**
between Bundles and Loyalty/Menu, NOT the four-value-prop About
panel the previous storefront shipped. Lives at the `#famiglia`
anchor the hero's "Our Story" CTA + the nav's "Story" link both
target. File name kept as `AboutSection.tsx` to avoid a rename
churn — the export is still `AboutSection`, the content is now V8's
Famiglia strip.

- **Section is NOT a `.v8-ps` block.** Deliberately strips the
  eyebrow / title / subtitle chrome — V8 lets the quote land alone
  the way a hand-printed menu inserts its founder's voice between
  the day's bundles and the loyalty pitch. **Zero vertical padding**
  — the strip's height is exactly the quote + citation. The previous
  `.v8-ps` section's bottom padding and the next `.v8-ps-dark`
  section's top padding (`56/80px ≥md` on both sides) own all the
  rhythm. Earlier builds shipped `64px top + bottom` here, which
  stacked into the neighbours to read as a ~150px dead band under
  the citation — V8 polish zeroed it.
- **Background** is a single soft terracotta radial wash centred on
  the section box (`radial-gradient(at 50% 50%, rgba(184,92,56,
  0.06), transparent 70%)`). No alt-veil band, no tricolore, no
  ornaments — restraint is the point; the famiglia quote sits directly
  on the aurora as a single typographic gesture.
- **The quote** — italic Cormorant 28px → 36px ≥md, espresso
  colour, max-width 720px, centred. Wrapped in translucent oxblood
  curly quotes (`\201C` open + `\201D` close) as pseudo-elements at
  60px, so screen readers read the quote text only, not the
  punctuation.
- **The citation** — uppercase Cormorant 600 12px in muted brown,
  `letter-spacing: 2px`. The dot separator between name + role
  (`Giuseppe Esposito · Pizzaiolo`) is plain text so it adapts if
  the role gets translated.
- **Quote + cite are brand copy**, hardcoded in
  `AboutSection.tsx`. V8 ties the quote to the LocationsGrid's
  Kraków `teamLead` ("Cooked by Giuseppe and family") by signing
  it with the same Giuseppe — the homepage's voice stays
  consistent across surfaces. "Pizzaiolo" stays untranslated
  because V8 voices its quote the way an Italian café signs its
  menu (the homepage gets to be looser than the operator's tier
  labels).
- **Why no longer four value props.** The previous storefront's
  four-icon About panel (Authentic Recipes / Street Food Culture /
  Made with Passion / Fresh & Quality) is gone. V8's homepage uses
  the slim Famiglia strip for the brand moment and pushes the
  longer "Our Story" content to a separate route if it ever lands
  (the hero's Story CTA can re-point from `#famiglia` to `/story`
  in the future without changing this strip).

### Soci / loyalty rail — `<LoyaltySection />`

V8 Trattoria treatment — the **closing** dark-espresso rail that
finishes the landing. NOT the small inline `<LoyaltyCard />` panel
the previous storefront shipped on the landing (that interactive
sign-in card lives on `/rewards` instead).

- **Section is `.v8-ps.v8-ps-dark`** — the **dark frosted-glass**
  variant of the shared section primitive. Predominantly espresso
  (rgba(61,40,23,0.86) — heavy enough that the parchment text holds
  WCAG AA over the aurora) with a warm terracotta radial wash top-left
  + an ochre wash bottom-right, then a backdrop blur frosting the aurora
  edges behind. (A full-bleed closer needs the heavy fill; the lighter
  `--glass-fill-dark` token is reserved for card-sized dark surfaces
  like the rewards tier card — P4.) Falls back to the solid espresso
  block under `@supports not (backdrop-filter)`. The light-on-dark
  variant flips the shared `.v8-ps-eyebrow / -title / -sub` colours via
  descendant selectors so this section reads with the same type ladder
  as the lighter sections, just inverted.
- **Eyebrow** in ochre-light: `Members & friends · soci e amici`,
  em-dashes in `--color-espresso-soft` (a darker brown than the
  light-section line tokens).
- **Title** in parchment with italic-ochre-light clause:
  `"A pizza, une storia"` (the same brand line the Famiglia strip
  used as a blockquote, here serving as the title — V8 deliberately
  threads the "A pizza, a story" phrase across both surfaces).
- **Sub** in parchment 70% opacity, with two distinctive accents:
  - An ochre-light `<strong>` callout — `1 point` — wrapped to
    spotlight the loyalty rate.
  - Two italic-Cormorant `<em>` Italian phrases (`Famiglia Oro`,
    `antipasto della casa`) in ochre-light at 92% opacity — the
    dark-mode counterpart to the `.v8-bundle-desc em` pattern.
- **CTA** — `Start earning points · inizia a guadagnare punti →`,
  the same `.v8-hero-cta` terracotta pill used in the hero +
  Bundles. Links to `/rewards` (Rule #5: loyalty has its own
  dedicated page; this section funnels there rather than
  bottling the sign-in UI inline).
- The previous interactive `<LoyaltyCard />` (phone-number sign-in,
  per-user points display) is NOT rendered here. It lives at
  `/rewards`. The Soci pitch is the entry point on the landing;
  the actual loyalty UX lives on the dedicated route.
- Marketing numbers (`1 point` / złoty, `300 points` for the
  `Famiglia Oro` tier, the `antipasto della casa` reward) are
  local copy. Canonical loyalty rules live in `lib/loyalty.ts` —
  if the operator retunes the formula away from "1 pt/zł" the
  homepage pitch needs an update too. Same trade-off bundles take.

### No separate closing CTA

The V8 homepage closes with the Soci rail — by the time the visitor
reaches it they've seen 6+ order entry points (hero ×2, every
location card, the bundles "Order now"), and one more red CTA
reads as the 2010s SaaS landing-page padding V8 avoids (same rule
as the Step 3 chevron-scroll-indicator removal). The pre-V8
`<CTASection />` red-gradient block ("Hungry? Order Now!") was
deleted in Step H.

## The rules unique to the landing

1. **One hero, one CTA per section.** Every section pulls the eye to
   one action — never two competing CTAs side-by-side.
2. **Status pills are live, not decorative.** "Open now" must mean
   "you can place an order now". If the data isn't live, the pill
   isn't shown.
3. **Bundles + Loyalty pull from real admin config.** Never hardcode
   what a bundle costs or what the loyalty tier thresholds are —
   read from the same source admin writes to.
4. **Cormorant Garamond body italic is reserved for the hero + the
   Famiglia strip + bundle italian phrases.** Display restraint is a
   brand decision — Cormorant on every body paragraph would flatten
   the type hierarchy. The italic-Cormorant `<em>` pattern (used in
   the hero lede, bundle descriptions, and the LocationsGrid teamLead)
   is bilingual signal, not decoration.
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
