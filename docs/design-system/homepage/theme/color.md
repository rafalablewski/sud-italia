# Homepage — Colour

← back to [Homepage README](../README.md)

The storefront palette is warm, italian-café-paper, deliberately *not*
e-commerce-sterile. Declared in the `@theme inline` block of
`src/app/globals.css` (which the [Homepage theme README](./README.md)
explains lives in globals.css for Tailwind v4 utility-generation
reasons — token values are conceptually owned by Homepage).

## The canonical palette (`@theme inline` block)

| Token                            | Value     | Use                                                        |
| -------------------------------- | --------- | ---------------------------------------------------------- |
| `--color-background`             | `#FFF8F0` | Warm cream — the page canvas. Italian café paper, not white. |
| `--color-foreground`             | `#1A1A1A` | Primary text. Near-black, never pure `#000`.               |
| `--color-italia-red`             | `#9A2742` | The brand — deep burgundy / oxblood. Hero CTA, wordmark mark, primary buttons. |
| `--color-italia-red-dark`        | `#7B1F33` | Brand hover state.                                         |
| `--color-italia-green`           | `#008C45` | The "Open now" success state, "in delivery" status pill.   |
| `--color-italia-green-dark`      | `#006B35` | Green hover.                                               |
| `--color-italia-cream`           | `#FFF8F0` | Soft fill on cards / sections (same as background, used as a token for intent). |
| `--color-italia-cream-dark`      | `#F5EDDF` | Hover lifts on cream surfaces, alternating-section backgrounds. |
| `--color-italia-gold`            | `#B8922E` | Editorial accent — Fraunces pull-quotes, "Chef's pick" badge, the loyalty Gold tier. |
| `--color-italia-gold-dark`       | `#9A7A24` | Gold hover.                                                |
| `--color-italia-dark`            | `#1A1A1A` | Heading text (Fraunces-led). Same value as foreground but semantic. |
| `--color-italia-gray`            | `#6B7280` | Secondary text, captions.                                  |
| `--color-italia-light-gray`      | `#F3F4F6` | Disabled state, inactive form border.                      |

Tailwind utilities are generated from these tokens: `bg-italia-red`,
`text-italia-cream`, `border-italia-gold`, etc. — 730+ uses across
the storefront and shared components.

## The brand colour rule

**Burgundy is the brand. Red is a status.**

`--color-italia-red` (`#9A2742`) is **not** bright red. It's a
matured, hospitality-grade oxblood that finally separates *brand*
from *danger*. This means:

- **Brand:** primary CTAs, the wordmark mark, the cart-count badge,
  the loyalty progress accent, the tier-up animation highlight.
- **Danger:** errors, destructive confirmations, "sold out"
  annotations. Use the same `--color-italia-red` value when needed —
  there's no second red.
- **Status (open/closed/active):** these go to `--color-italia-green`
  for affirmative, `--color-italia-gold` for advisory ("Filling
  up"), `--color-italia-gray` for neutral ("Closed today").

If a "red" reads as panic, the rest of the storefront's burgundy
loses its brand weight. **Hold the discipline.**

## The cream rule

**Warm cream is the canvas, not white.**

`--color-background: #FFF8F0` is a deliberately yellow-tinted cream.
Why:

- A pure-white storefront reads as Stripe / Shopify / generic SaaS.
  Sud Italia is a Neapolitan pizza brand — the surface needs to feel
  like the menu paper at a real café.
- Cards on cream use either the same cream (no border, just hairline
  separation) or `#fff` (truly white card on cream, for emphasis —
  used on the item card, the order summary, the rewards card).
- **Never reverse the contrast** — dark headlines on cream is the
  whole brand. A reversed cream-on-dark section is not a Homepage
  pattern (that's an Admin / Core treatment).

## The gold accent rule

**Gold is editorial, not status.**

`--color-italia-gold` is reserved for the moments that need
"hospitality elegance":

- Fraunces pull-quotes on the About section.
- The "Chef's pick" / "Signature" badge on a menu item.
- The Loyalty Gold tier badge + the gold-tier progress accent.
- The free-delivery `delivery-medallion` keyframe (the celebratory
  award-style coin animation when the threshold is hit).

It's never a primary action colour. A gold button would read as
e-commerce-flag waving; the burgundy button is the brand button.

## The shared base tokens

These hold across themes (admin's `--info`, `--warning`, etc. exist
separately in `themes/admin/index.css` — Homepage doesn't read them):

| Need                          | Homepage uses                                     |
| ----------------------------- | ------------------------------------------------- |
| Default hairline / borders    | `#e5e7eb` (Tailwind gray-200 inline)              |
| Soft shadow on cards          | `rgba(0,0,0,0.04)` resting, `rgba(0,0,0,0.08)` hover |
| Focus ring                    | `--color-italia-red` at 2px (per the BASE rule in `globals.css`) |
| Disabled overlay              | `--color-italia-light-gray` background, 0.6 opacity |

## The rules

1. **No gradients on the storefront.** Even the hero. Flat
   `--color-italia-red` background; flat cream sections. The
   delivery-shimmer keyframe is the lone exception — and it's a
   shimmer *across* a flat surface, not a static gradient.
2. **No glow shadows.** Neutral shadows for elevation; never a
   brand-tinted blur ring. A `text-italia-red` headline doesn't get a
   `text-shadow: 0 0 12px var(--color-italia-red)` halo.
3. **Cream sections alternate with white sections** to create rhythm
   on a long landing page. Never three cream sections in a row.
4. **Gold appears at most once per viewport.** Don't crowd it — the
   editorial accent loses meaning if it's everywhere.
5. **All token edits happen in `@theme inline`** (in `globals.css`).
   Edits ripple to every `bg-italia-*` / `text-italia-*` utility
   instantly — preview on a representative storefront page before
   committing.

## What this palette is not

- It is **not** the Admin palette. Admin's `[data-admin-theme]`
  tokens (`--surface-1`, `--fg`, `--brand`) are scoped to admin and
  *do not* leak to the storefront. A change to admin's brand colour
  would not move the storefront's burgundy.
- It is **not** the Core palette. Core's `--cmd-*` tokens are the
  operator-surface palette; Homepage doesn't read them.
- It is **not** a customisable brand colour. The italia-red value is
  the brand decision; changing it is a brand decision, not a token
  edit.

The Homepage palette is the **brand surface** — warm cream, deep
burgundy, gold for grace, green for go.
