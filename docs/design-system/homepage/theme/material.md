# Homepage — Material

← back to [Homepage README](../README.md)

Depth, hairlines, radius, motion — for a hospitality surface that
breathes. Where Core's material is tight + quiet and Admin's is
flat-glass utilitarian, Homepage allows shadows, rounder corners, and
delightful animation moments.

## The paper canvas

The V8 Trattoria treatment is a **paper canvas**, not a flat colour.
The `body` in `themes/homepage/index.css` carries three layered
backgrounds:

1. **Parchment ground** — `--color-background` (`#F8EFDE`), the flat
   base tone.
2. **Two warm radial washes** — ochre top-left + terracotta
   bottom-right on mobile; oxblood + basil on desktop (the @768px
   breakpoint swaps the colour pair to suit the wider canvas).
3. **SVG paper-grain noise overlay** — an inline `feTurbulence`
   fractal-noise filter at `baseFrequency=0.85`, recoloured to a
   sub-6%-alpha warm-brown via `feColorMatrix`. Tiled (240×240). The
   data URI is inline in `index.css` so no extra request.

Together they give the page the same tooth as menu paper at a café —
the warm tint isn't uniform, the grain reads under low light. **This
is the only place on the storefront where the body is anything other
than a flat colour.** Section backgrounds stay flat parchment /
parchment-deep / white.

## The elevation ramp

Three steps, every Homepage surface picks one:

| Step | Surface                                  | Used by                                                  |
| ---- | ---------------------------------------- | -------------------------------------------------------- |
| 0    | `--color-background` (parchment)         | Page canvas, base sections (over the paper-grain layer)  |
| 1    | `#fff` (true white)                      | Cards on parchment — item cards, location cards, the rewards tier card, the order-confirmation summary block. Resting `--shadow-card` or `box-shadow: 0 1px 3px rgba(0,0,0,0.04)`. |
| 2    | `#fff` with stronger shadow              | Portalled overlays — cart drawer, item detail drawer, modals. `box-shadow: 0 8px 32px rgba(0,0,0,0.12)` + the portal backdrop scrim. |

The parchment / white alternation IS the elevation. A card on
parchment is clearly raised because it's brighter than the background;
no border needed unless the card needs containment (the `.pub-card`
form container takes a `#f3f4f6` hairline border for definition).

The intermediate `--color-parchment-deep` (`#F2E2C2`) is used on
alternating *sections* (not cards) to add rhythm without breaking the
canvas — see `--color-italia-cream-dark` in `color.md`.

## Shadows

The shadow ramp is small and neutral — no brand-tinted glows, no
multi-layer drop shadows.

| Use                                | Spec                                              |
| ---------------------------------- | ------------------------------------------------- |
| Card at rest                       | `--shadow-card` (inset highlight + warm brown drop) or `0 1px 3px rgba(0,0,0,0.04)` for the lightest cards |
| Card hover                         | `0 4px 12px rgba(0,0,0,0.08)` + translateY(-1px)  |
| Paper edges (location cards, menu) | `--shadow-paper` — softer than `--shadow-card`, used to lift the parchment-on-parchment surfaces |
| Portalled overlay backdrop         | A scrim — `rgba(0,0,0,0.4)` over the page         |
| Portalled overlay surface          | `0 8px 32px rgba(0,0,0,0.12)`                     |
| Sticky header on scroll            | `0 1px 0 rgba(0,0,0,0.04)` (hairline-as-shadow)   |
| Hero CTA                           | `--shadow-cta` — warm terracotta drop, the **one** brand-tinted shadow exception, because the hero CTA needs to feel like part of the brand at all times |
| Floating cart button               | `0 4px 16px rgba(122,43,43,0.15)` — oxblood-tinted shadow, the second documented brand-tint, kept consistent with the brand burgundy |

`--shadow-paper`, `--shadow-card`, `--shadow-cta` are declared as
plain CSS vars on `:root` in `themes/homepage/index.css` (they
intentionally bypass Tailwind's `--shadow-*` token slot to stay V8-only
and not override Tailwind defaults). The hero CTA + floating cart
button are the documented brand-tinted-shadow exceptions — every
other elevation uses neutral shadows.

## Radius

| Element                              | Radius |
| ------------------------------------ | ------ |
| Section containers, large cards      | 16px   |
| Item cards, location cards           | 12px   |
| Buttons, the floating cart button    | 12px (square buttons rounded fully — `border-radius: 9999px` for the CTA hero button) |
| `.pub-input`, `.pub-select`          | 12px   |
| `.pub-card`                          | 16px   |
| Tier badges, chips, status pills     | 9999px (pill) |
| The hero image / video frame        | 24px (the lone generous radius — the hero gets it) |

12px is the workhorse radius. 16px is for the bigger container
surfaces. The pill radius for buttons + chips is a brand cue —
fully-rounded affordances read as more inviting than 8px-radius
"techy" buttons.

## Padding rhythm

Homepage padding is **generous**. The numbers:

| Element                              | Padding                          |
| ------------------------------------ | -------------------------------- |
| Section vertical (between blocks)    | 80px desktop, 56px tablet, 48px mobile |
| Section horizontal (page gutter)     | `Container` max-width 1200px, 24px gutter |
| Card interior                        | 24–32px (item cards lean 20px; the rewards tier card uses 32px) |
| Button vertical                      | 12px (regular), 16px (hero CTA)  |
| Button horizontal                    | 24px (regular), 32px (hero CTA)  |
| Form field interior                  | 10px × 14px (`0.625rem 0.875rem` — see `.pub-input`) |

Generous padding is the substrate trust grows on. A cramped storefront
reads as cheap.

## Motion

**Animation is allowed to delight** — the storefront's distinguishing
material trait. The full keyframe library lives in
`themes/homepage/index.css` (the delivery family) and `globals.css`
(the shared library: `fade-in`, `slide-up`, `scale-in`,
`slide-up-sheet`, `shimmer`, `pulse-soft`, `bounce-in`, `count-up`).

| Pattern                                 | Spec                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- |
| Hover lifts (cards, buttons)            | `transition: all 0.2s ease`                                          |
| Cart drawer / item detail drawer open   | `--animate-slide-up-sheet` (350ms cubic-bezier(0.32, 0.72, 0, 1))    |
| `AddToCartToast` enter                  | `--animate-slide-up` (400ms)                                         |
| Free-delivery progress shimmer          | `--animate-delivery-shimmer` (1.8s linear infinite while below threshold) |
| Free-delivery threshold-crossed sweep   | `--animate-delivery-sweep` (1.4s ease-out one-shot)                  |
| Free-delivery medallion award           | `--animate-delivery-medallion` (600ms spring at the unlock moment)   |
| Free-delivery unlock card pop           | `--animate-delivery-unlock` (500ms cubic-bezier(0.34, 1.56, 0.64, 1)) |
| Tier-up on the rewards page             | `--animate-bounce-in` (500ms spring)                                  |
| Loyalty points "count up" on order page | `--animate-count-up` (300ms)                                           |
| Pulse micro-survey card enter           | `v8-pulse-in` (560ms cubic-bezier(0.22, 1, 0.36, 1), from bottom-left) |
| Pulse on the live "Open now" pill       | `--animate-pulse-soft` (2s loop)                                      |

**Spring physics are allowed.** Unlike Core (where spring on 12
simultaneous tickets is chaos), the storefront's spring moments are
discrete celebratory events — one-shot reward unlocks, the cart-add
toast, the tier-up. These are intentional moments.

## Focus

Keyboard focus on Homepage uses the BASE rule from `globals.css`:
2px solid `--color-italia-red` outline at 2px offset. Brand-coloured
focus is the storefront-wide signal that something is interactive +
focused.

(Admin overrides this with the steel-blue `--focus-ring` because
admin's brand-red focus would clash with `[data-admin-theme]` chrome
— see `themes/base/index.css`.)

## The rules

1. **Cream / white alternation IS the elevation.** Don't add a
   `--surface-1` token; the colour change does the work.
2. **One brand-tinted shadow only.** The floating cart button. Every
   other elevation uses neutral shadows.
3. **Spring physics are for one-shot celebrations.** Never apply
   spring to a continuous interaction (scroll, drag, hover) — it
   reads as gimmicky.
4. **`prefers-reduced-motion` is respected globally** (the BASE
   `@media (prefers-reduced-motion: reduce)` block in `globals.css`
   reduces every animation to 0.01ms). Don't override per-component.
5. **Generous padding is a discipline.** A request to "make this
   denser to fit more above the fold" usually means we should cut
   content, not pad.

## What this material is not

- It is **not** the Admin material. Admin's glass-card uses
  `backdrop-filter: blur(...)`; Homepage has no glassmorphism. The
  storefront is opaque-card-on-cream, not glass-on-tinted-bg.
- It is **not** the Core material. Core uses hairlines + tone change
  for elevation; Homepage uses tone change + actual shadows.
- It is **not** customisable per page. A location card on the landing
  and a location card on /privacy use the same radius + shadow.

The Homepage material is the **hospitality treatment** — cards on
cream, generous padding, deliberate animation moments, brand-red
focus ring as the persistent signal of interactivity.
