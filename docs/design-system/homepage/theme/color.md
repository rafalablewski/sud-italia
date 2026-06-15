# Homepage — Colour

← back to [Homepage README](../README.md)

The storefront palette is the **V8 Trattoria** Tuscany scheme — warm
parchment paper, deep oxblood burgundy, terracotta clay, basil green,
ochre gold, espresso brown. Deliberately *not* e-commerce-sterile. The
canvas is the menu paper at a real Italian café, not the white of a
Stripe checkout.

Declared in the `@theme inline` block of
`src/app/themes/homepage/tokens.css` (re-exported through `globals.css`
so Tailwind v4 generates utilities from the homepage tokens — same
constraint as the rest of `themes/homepage/`).

## The canonical palette (`@theme inline` block)

The existing `--color-italia-*` token names are kept — 788 use sites
across the codebase — and remapped to V8 Tuscany values. New V8
components should reach for the V8-named tokens (`bg-parchment`,
`text-terracotta`, `border-basil`) directly.

### Surfaces + foreground

| Token                | Value     | Use                                                        |
| -------------------- | --------- | ---------------------------------------------------------- |
| `--color-background` | `#F8EFDE` | Parchment — the page canvas. Tuscan paper, not white.      |
| `--color-foreground` | `#2C1810` | Ink — primary text. Near-black with a brown bias, never pure `#000`. |

### Italia-\* aliases (remapped to Tuscany values)

| Token                            | Value     | Use                                                        |
| -------------------------------- | --------- | ---------------------------------------------------------- |
| `--color-italia-red`             | `#7A2B2B` | Oxblood — the brand burgundy. Hero CTA, wordmark mark, primary buttons, cart-count badge. |
| `--color-italia-red-dark`        | `#5A1F1F` | Oxblood hover state.                                       |
| `--color-italia-green`           | `#4A7C59` | Basil — the "Open now" success state, "in delivery" status pill. |
| `--color-italia-green-dark`      | `#355C40` | Basil hover / deep.                                        |
| `--color-italia-cream`           | `#F8EFDE` | Parchment — soft fill on cards / sections (same as background, semantic alias). |
| `--color-italia-cream-dark`      | `#F2E2C2` | Parchment-deep — hover lifts on cream surfaces, alternating section backgrounds. |
| `--color-italia-gold`            | `#C9A23E` | Ochre — editorial accent, the "Chef's pick" badge, the loyalty Gold tier. |
| `--color-italia-gold-dark`       | `#9A7A24` | Ochre hover.                                               |
| `--color-italia-dark`            | `#2C1810` | Ink — heading copy. Same value as foreground, semantic alias. |
| `--color-italia-gray`            | `#8C6F4F` | Muted — secondary text, captions. Warm brown grey, not cool. |
| `--color-italia-light-gray`      | `#E0CFA8` | Line-soft — disabled state, inactive form border, hairline separators on parchment. |

### V8-named tokens (use these in new V8 components)

| Token                       | Value     | Use                                                           |
| --------------------------- | --------- | ------------------------------------------------------------- |
| `--color-parchment`         | `#F8EFDE` | Canvas (== background).                                       |
| `--color-parchment-deep`    | `#F2E2C2` | Alternating-section tone.                                     |
| `--color-paper-shadow`      | `#E8D6B5` | Deepest cream — paper edge shadows, card recess.              |
| `--color-terracotta`        | `#B85C38` | **V8 primary action accent** — used on the hero CTA glow, "Order in Kraków" button. Pairs with oxblood text on hover. |
| `--color-terracotta-dark`   | `#9A4A2B` | Terracotta hover / pressed.                                   |
| `--color-terracotta-soft`   | `#D88E6E` | Soft terracotta highlight, badge fill.                        |
| `--color-basil`             | `#4A7C59` | Open / active / "fresh" tags. Same as `italia-green`.         |
| `--color-basil-deep`        | `#355C40` | Basil hover.                                                  |
| `--color-oxblood`           | `#7A2B2B` | Brand burgundy (same as `italia-red`).                        |
| `--color-oxblood-soft`      | `#A85252` | Soft oxblood — used on subtle accents that need brand colour but not the full burgundy weight. |
| `--color-ochre`             | `#C9A23E` | Editorial gold (same as `italia-gold`).                       |
| `--color-ochre-light`       | `#E6C97A` | Lifted ochre — badge fills, highlight on quote marks.         |
| `--color-espresso`          | `#3D2817` | Deep brown — secondary heading text, sub-body emphasis.       |
| `--color-espresso-soft`     | `#6B4A30` | Soft brown — labels, eyebrow text.                            |
| `--color-ink`               | `#2C1810` | The deepest text (== foreground).                             |
| `--color-muted`             | `#8C6F4F` | Warm-brown secondary text (== `italia-gray`).                 |
| `--color-line`              | `#C9B48E` | Visible hairline on parchment.                                |
| `--color-line-soft`         | `#E0CFA8` | Soft hairline (== `italia-light-gray`).                       |

### Italian flag

Reserved for the Famiglia strip and "made-in-Italy" badges only.

| Token                | Value     | Use                                            |
| -------------------- | --------- | ---------------------------------------------- |
| `--color-italy-green`| `#008C45` | Flag green — never used as a status colour.    |
| `--color-italy-white`| `#F4F5F0` | Flag off-white — paired only with flag green + red. |
| `--color-italy-red`  | `#CD212A` | Flag red — Famiglia strip only, never as a UI red. |

Tailwind utilities are generated from every token above: `bg-italia-red`,
`bg-parchment`, `text-terracotta`, `border-basil`, `bg-ochre`, etc.

## The brand colour rule

**Oxblood is the brand. Bright red is reserved for the flag.**

`--color-italia-red` (`#7A2B2B`, oxblood) is **not** bright red. It's a
matured, hospitality-grade burgundy that holds *brand* separate from
the Italian flag's *bright* red. This means:

- **Brand:** primary CTAs, the wordmark mark, the cart-count badge,
  the loyalty progress accent, the tier-up animation highlight, the
  translucent curly-quote glyphs flanking the Famiglia strip
  blockquote (40% opacity so they read as accent, not text).
- **Danger:** errors, destructive confirmations, "sold out"
  annotations — use the same `--color-italia-red` (oxblood).
- **Status (open / closed / active):** these go to `--color-italia-green`
  (basil) for affirmative, `--color-italia-gold` (ochre) for advisory
  ("Filling up"), `--color-italia-gray` (muted) for neutral ("Closed
  today").
- **Flag red** (`--color-italy-red`, bright `#CD212A`): only inside
  the `.v8-tricolore` hairline gradient (closes the hero, separates
  the LocationsGrid illustration from the card body). Paired with
  flag green + flag off-white as the three equal-third stops —
  never a UI red on its own.

If an oxblood action reads as panic instead of brand, the rest of the
storefront's burgundy loses its weight. **Hold the discipline.**

## The terracotta rule

**Terracotta is the warm action layer, not a third brand red.**

`--color-terracotta` (`#B85C38`) is the V8 introduction — it sits
between oxblood (brand) and ochre (editorial accent) as the warm clay
that ties the page together:

- The hero CTA outer glow (`--shadow-cta` uses terracotta).
- The "Order in Kraków" / "Order in Warszawa" button accents.
- Inline icon strokes on location cards.

Terracotta is **never** a heading colour and **never** a brand mark —
those stay oxblood. Treat terracotta as the page's warm-action layer.

## The parchment rule

**Parchment is the canvas, not white.**

`--color-background: #F8EFDE` is a deliberately yellow-tinted Tuscan
parchment. Why:

- A pure-white storefront reads as Stripe / Shopify / generic SaaS.
  Ottaviano is a Neapolitan pizza brand — the surface needs to feel
  like the menu paper at a real café, with the same warm tooth.
- Cards on parchment use either the same parchment (no border, just
  hairline `--color-line-soft` separation), parchment-deep for
  alternating elevation, or `#fff` (truly white card on parchment, for
  emphasis — used on the item card, the order summary, the rewards
  card).
- **Never reverse the contrast** — dark headings on parchment is the
  whole brand. A reversed parchment-on-dark section is not a Homepage
  pattern (that's an Admin / Core treatment).

The body also carries a **paper-grain SVG noise overlay** + two warm
radial washes (ochre top-left + terracotta bottom-right on mobile;
oxblood + basil on desktop). See `material.md` for the material spec.

## The ochre accent rule

**Ochre is editorial, not status.**

`--color-italia-gold` (`#C9A23E`, ochre) is reserved for the moments
that need "hospitality elegance":

- Italic-Cormorant pull-quotes that need a calmer accent (the
  LocationsGrid's `.v8-loc-note` "Cooked by X" attribution uses an
  ochre left border — see `home.md`).
- The "Chef's pick" / "Signature" badge on a menu item.
- The Loyalty Gold tier badge + the gold-tier progress accent.
- The free-delivery `delivery-medallion` keyframe (the celebratory
  award-style coin animation when the threshold is hit).

It's never a primary action colour. An ochre button would read as
e-commerce-flag waving; the oxblood button is the brand button.

## The shared base tokens

These hold across themes (admin's `--info`, `--warning`, etc. exist
separately in `themes/base/index.css` — Homepage doesn't read them):

| Need                          | Homepage uses                                                |
| ----------------------------- | ------------------------------------------------------------ |
| Default hairline / borders    | `--color-line-soft` (`#E0CFA8`) on parchment, `#e5e7eb` on white cards |
| Soft shadow on cards          | `--shadow-card` (V8 inset highlight + warm brown drop) — see `material.md` |
| Focus ring                    | `--color-italia-red` (oxblood) at 2px (per the BASE rule in `globals.css`) |
| Disabled overlay              | `--color-italia-light-gray` background, 0.6 opacity          |

## The rules

1. **No bright-red as a UI colour.** Oxblood is brand; bright red is
   reserved for the Italian flag in the Famiglia strip. Errors use
   oxblood, not flag-red.
2. **The aurora lives on the body, nowhere else.** The four drifting
   radial pools (`body::before`) are the V8 canvas — see
   [`material.md`](./material.md#the-aurora-canvas--liquid-glass).
   Sections stay transparent so the one aurora reads continuously;
   surfaces opt into the `.v8-surface*` glass fills. Don't paint a
   second static gradient on a section — let the glass refract the one
   aurora instead. Aurora pools are low-alpha washes of existing hues —
   never a new colour.
3. **No glow shadows.** Neutral warm-brown shadows for elevation
   (see `--shadow-paper` / `--shadow-card`); never a brand-tinted blur
   ring. A `text-italia-red` headline doesn't get an `oxblood` halo —
   `--shadow-cta` is the only branded shadow (warm terracotta drop on
   the hero CTA only).
4. **Rhythm comes from glass depth, not tone.** On a long landing page
   the aurora drift + alternating surface elevation (`.v8-surface` vs
   `.v8-surface-dark` on the Soci rail / footer) create the rhythm.
   Don't reach for `parchment-deep` section fills — the glass-on-aurora
   contrast does the work the cream/white alternation used to.
5. **Ochre appears at most once per viewport.** Don't crowd it — the
   editorial accent loses meaning if it's everywhere.
6. **All token edits happen in `@theme inline`** (in
   `themes/homepage/tokens.css`). Edits ripple to every `bg-italia-*` /
   `bg-terracotta` / `text-basil` utility instantly — preview on a
   representative storefront page before committing. Mirror the change
   into `theme.ts` in the same commit.

## What this palette is not

- It is **not** the Admin palette. Admin's `[data-admin-theme]`
  tokens (`--surface-1`, `--fg`, `--brand`) are scoped to admin and
  *do not* leak to the storefront. A change to admin's brand colour
  would not move the storefront's oxblood.
- It is **not** the Core palette. Core's `--cmd-*` tokens are the
  operator-surface palette; Homepage doesn't read them.
- It is **not** a customisable brand colour. The oxblood value is the
  brand decision; changing it is a brand decision, not a token edit.

The Homepage palette is the **brand surface** — Tuscan parchment, deep
oxblood, terracotta for warm action, ochre for grace, basil for go.
