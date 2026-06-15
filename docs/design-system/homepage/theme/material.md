# Homepage — Material

← back to [Homepage README](../README.md)

Depth, hairlines, radius, motion — for a hospitality surface that
breathes. Where Core's material is tight + quiet and Admin's is
flat-glass utilitarian, Homepage allows shadows, rounder corners, and
delightful animation moments.

## The aurora canvas — Liquid Glass

The V8 Trattoria treatment is **liquid glass**: translucent glass
surfaces floating over a **living aurora**. The `body` in
`themes/homepage/index.css` carries three layered backgrounds:

1. **Parchment ground** — `--color-background` (`#F8EFDE`), the flat
   base tone painted on the body box.
2. **Drifting aurora** (`body::before`, fixed, z-index −2) — four warm
   radial pools (ochre top-right, terracotta bottom-left, basil centre,
   oxblood upper-left) that drift on a slow 26s `v8-aurora` loop. The
   pools are low-alpha washes of the existing palette hues — **no new
   colours**. Fixed, so it stays put while the glass content scrolls
   over it.
3. **SVG paper-grain noise overlay** (`body::after`, fixed, z-index −1)
   — an inline `feTurbulence` fractal-noise filter at `baseFrequency=0.85`,
   recoloured to a sub-6%-alpha warm-brown via `feColorMatrix`, layered
   **on top of** the aurora so the warm tint reads under low light and
   the glass has tooth to refract. The data URI is inline so no request.

Together they give the page a warm, breathing canvas — the aurora is
the light source the glass surfaces refract; the grain is the menu-paper
tooth. **This is the only place on the storefront where the background
is anything other than a flat colour** — section backgrounds stay
transparent so the one aurora reads continuously top to bottom.

## The elevation ramp — blur depth + refraction

Elevation is now **glass depth**, not tone change. Every Homepage
surface opts into one of the three glass primitives in `index.css`:

| Step | Primitive          | Material                                                   | Used by                                                  |
| ---- | ------------------ | --------------------------------------------------------- | -------------------------------------------------------- |
| 0    | _(none)_           | Transparent over the aurora canvas                        | Page + section backgrounds                                |
| 1    | `.v8-surface`      | parchment @46% + `blur(22px) saturate(160%)`, refraction top-edge, warm drop shadow | Cards — item cards, location cards, bundle cards, order summary, rewards cards |
| 2    | `.v8-surface-strong` | parchment @64% + `blur(28px)`, deeper shadow            | Portalled overlays — cart drawer, item-detail drawer, sticky paybars |
| —    | `.v8-surface-dark` | espresso @62% glass, parchment text, dim refraction edge  | Dark surfaces — Soci rail, footer, the rewards tier card, the add-to-cart toast |

**Blur depth IS the elevation.** A card reads as raised because the
aurora behind it is softened by its blur and brightened by its
refraction edge — the more it lifts, the stronger the blur + shadow.
The bright top-edge (`::before` on every surface) is the persistent
"this is glass" signal; no opaque border is needed.

`--color-parchment-deep` (`#F2E2C2`) is no longer a card fill — the
glass fill alphas replace it. It survives only as the legacy
`--color-italia-cream-dark` token (see `color.md`).

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

1. **Blur depth IS the elevation.** Compose `.v8-surface` /
   `-strong` / `-dark` — don't invent a new card background. The glass
   fill + blur + refraction edge does the work; the aurora does the rest.
2. **No new colours for glass.** Fills are material alphas of parchment
   / espresso; aurora pools are low-alpha washes of the existing palette.
   A glass surface never introduces a hue that isn't already a token.
3. **One brand-tinted shadow only.** The floating cart button. Every
   other elevation uses the warm-neutral `--glass-shadow`.
4. **Spring physics are for one-shot celebrations.** Never apply
   spring to a continuous interaction (scroll, drag, hover) — it
   reads as gimmicky.
5. **`prefers-reduced-motion` is respected globally** (the BASE
   `@media (prefers-reduced-motion: reduce)` block in `globals.css`
   reduces every animation to 0.01ms, and `index.css` stills the
   aurora, caustic shimmer + sheen). Don't override per-component.
6. **Generous padding is a discipline.** A request to "make this
   denser to fit more above the fold" usually means we should cut
   content, not pad.

## What this material is not

- It is **not** the Admin material. Admin's `glass-card` is a cool,
  flat utilitarian glass on a steel chrome; Homepage's glass is **warm**
  — parchment-tinted fill over a Tuscan aurora, rounder radii, refraction
  edges, and delight animation. Same technique (`backdrop-filter`),
  opposite temperature.
- It is **not** the Core material. Core uses hairlines + tone change
  for elevation; Homepage uses **blur depth + refraction** over the aurora.
- It is **not** customisable per page. A location card on the landing
  and a location card on /privacy use the same `.v8-surface` recipe.
- It is **not** opaque-card-on-cream — that was the pre-Liquid-Glass
  build. The storefront is now glass-on-aurora.

The Homepage material is the **hospitality treatment in glass** —
warm translucent surfaces over a living aurora, generous padding,
deliberate animation moments, brand-red focus ring as the persistent
signal of interactivity.
