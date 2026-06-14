# Homepage — Material

← back to [Homepage README](../README.md)

Depth, hairlines, radius, motion — for a hospitality surface that
breathes. Where Core's material is tight + quiet and Admin's is
flat-glass utilitarian, Homepage is **warm liquid glass**: translucent
parchment surfaces floating over a living aurora, with rounder corners
and delightful animation moments. The Tuscan palette is unchanged — the
*material* is what evolved from flat parchment-on-cream to glass-on-aurora.

> **Migration status.** The canvas (aurora) and the glass surface
> primitives (`.v8-surface` / `.v8-sheen`) ship now (P0). Individual
> surface families (`.v8-loc-card`, `.v8-mi`, `.v8-cart`, …) adopt the
> primitive across phases P1–P5 — see the per-surface "Live code" notes in
> `pages/*.md`. The opaque-parchment look survives **only** as the
> `@supports not (backdrop-filter)` / `prefers-reduced-motion` fallback.

## The liquid-glass canvas

The page canvas is a **living aurora**, not a flat colour. It's built from
three layers (`themes/homepage/index.css`):

1. **Parchment base** — `--color-background` (`#F8EFDE`) on `<html>`, the
   opaque ground painted behind everything. It lives on `<html>` (not
   `<body>`) so the body can stay transparent and the aurora pseudo shows
   through reliably.
2. **The aurora** — a fixed, inert `body::before` layer: four warm radial
   pools (ochre top-left, terracotta top-right, basil bottom-right, oxblood
   bottom-left) at low alpha — `--aurora-ochre` / `-terracotta` / `-basil` /
   `-oxblood`, reusing the palette, **no new hues**. `background-size: 200%`
   lets them drift via `background-position` over a slow 26s
   `v8-aurora` ease, so every translucent surface has warm Tuscan light
   moving behind it. `z-index: -1` keeps it behind all content.
3. **SVG paper-grain noise** — the inline `feTurbulence` fractal-noise
   filter (`baseFrequency=0.85`, recoloured to a sub-5%-alpha warm-brown via
   `feColorMatrix`, tiled 240×240) stays on `body` for tooth *beneath* the
   glass. The data URI is inline so there's no extra request.

Together they give the page warm depth that *moves* — the light isn't
uniform, the grain still reads under the glass. Sections no longer need to
stay flat: a `.v8-surface` panel is read as raised because the aurora blooms
through it, brighter and blurred against the ground.

## The elevation ramp

Elevation is now **blur depth + refraction + warm shadow**, not a
parchment/white tone change. The glass primitive (`.v8-surface`) is the one
recipe every surface family opts into:

| Step | Surface | Recipe | Used by |
| ---- | ------- | ------ | ------- |
| 0 | Aurora canvas | `<html>` parchment + `body::before` aurora + grain | Page ground, base sections |
| 1 | `.v8-surface` | `--glass-fill` (parchment @50%) + `backdrop-filter: blur(--glass-blur) saturate(--glass-saturate)` + `--glass-stroke` border + refraction top-edge + `0 18px 50px -18px --glass-shadow` | Cards on the canvas — item cards, location cards, the rewards tier card, the order-confirmation summary |
| 2 | `.v8-surface-strong` | as Step 1 with `--glass-fill-strong` (parchment @62%) | Portalled overlays + sticky foot bars — cart drawer, item detail drawer, the checkout foot. Plus the portal backdrop scrim. |
| — | `.v8-surface-dark` | `--glass-fill-dark` (espresso @34%) + parchment text | The loyalty / Soci surfaces that were solid espresso blocks |

The **refraction top-edge** (`.v8-surface::before` — a bright 1px highlight
across the top) is what reads as "light catching glass"; keep it on every
surface. A card no longer needs the parchment/white brightness gap to feel
raised — the blur + shadow + edge do the work.

`--color-parchment-deep` (`#F2E2C2`) survives only as the **fallback** fill
(see Shadows) and on the rare fully-opaque section that intentionally opts
out of glass.

## Shadows

The shadow ramp gained the glass drop and **brand-tinted glows are now
allowed** as part of the material — but still disciplined: warm, layered,
never neon.

| Use | Spec |
| --- | ---- |
| Glass surface at rest | `0 18px 50px -18px --glass-shadow` (warm-brown) + `inset 0 1px 0 rgba(255,255,255,0.55)` (the inner refraction highlight) |
| Glass surface hover | deepen the drop + `translateY(-4px to -8px)`; pair with `.v8-sheen` for the light sweep |
| Fallback card (no backdrop-filter) | `--shadow-card` (inset highlight + warm brown drop) — the pre-glass look |
| Portalled overlay backdrop | A scrim — `rgba(44,40,31,0.45)` over the page |
| Sticky header on scroll | hairline-as-shadow + the chrome blur (`--glass-blur-chrome`) |
| Hero CTA | `--shadow-cta` — warm terracotta drop, still the signature branded action shadow |
| Floating cart button | `0 4px 16px rgba(122,43,43,0.15)` — oxblood-tinted, kept |

`--shadow-paper`, `--shadow-card`, `--shadow-cta` and the new `--glass-*`
vars are declared as plain CSS vars on `:root` in `index.css` (they
intentionally bypass Tailwind's `--shadow-*` slot to stay V8-only). The hero
CTA's terracotta drop and the floating-cart oxblood tint remain the *named*
brand-shadow moments; glass surfaces use the neutral warm-brown
`--glass-shadow`, so the page reads warm without every panel glowing.

## Radius

| Element                              | Radius |
| ------------------------------------ | ------ |
| Section containers, large cards      | 16–18px |
| Item cards, location cards           | 12–14px |
| Buttons, the floating cart button    | 12px (square buttons rounded fully — `border-radius: 9999px` for the CTA hero button) |
| `.pub-input`, `.pub-select`          | 12px   |
| `.pub-card`                          | 16px   |
| Tier badges, chips, status pills     | 9999px (pill) |
| The hero image / video frame        | 24px (the lone generous radius — the hero gets it) |

12–14px is the workhorse radius (glass surfaces lean to the upper end —
softer corners suit the translucency). The pill radius for buttons + chips
is a brand cue — fully-rounded affordances read as more inviting than
8px-radius "techy" buttons.

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
material trait, now including the ambient aurora + the glass sheen. The full
keyframe library lives in `themes/homepage/index.css` (the delivery family +
`v8-aurora`) and `globals.css` (the shared library: `fade-in`, `slide-up`,
`scale-in`, `slide-up-sheet`, `shimmer`, `pulse-soft`, `bounce-in`,
`count-up`).

| Pattern                                 | Spec                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- |
| Ambient canvas aurora                   | `v8-aurora` (26s ease-in-out infinite alternate, `body::before` background-position drift) |
| Glass sheen sweep on hover              | `.v8-sheen::after` (0.9s cubic-bezier(0.22, 1, 0.36, 1) transform) |
| Hover lifts (cards, buttons)            | `transition: all 0.2s ease` + `translateY`                          |
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

The aurora + sheen are **ambient, not spring** — slow, continuous, low
contrast. They must never compete with a celebratory one-shot.

## Focus

Keyboard focus on Homepage uses the BASE rule from `globals.css`:
2px solid `--color-italia-red` outline at 2px offset. Brand-coloured
focus is the storefront-wide signal that something is interactive +
focused.

(Admin overrides this with the steel-blue `--focus-ring` because
admin's brand-red focus would clash with `[data-admin-theme]` chrome
— see `themes/base/index.css`.)

## The rules

1. **Blur + refraction + warm shadow IS the elevation.** Surfaces opt into
   `.v8-surface`; don't hand-roll a one-off translucent fill or invent a
   `--surface-1` token. Keep the refraction top-edge on every glass panel.
2. **Translucency must never cost contrast.** `--glass-fill` floors at ~0.5
   alpha; body copy stays `--espresso` / `--ink`. If text over a surface
   can't hold WCAG AA, raise the fill (`--glass-fill-strong`), don't dim the
   text.
3. **Every glass surface needs a fallback.** It must read correctly under
   `@supports not (backdrop-filter)` (opaque parchment) and
   `prefers-reduced-motion` (no aurora drift / sheen). Don't ship a panel
   whose legibility depends on the blur.
4. **Brand glows are allowed but rationed.** The hero CTA (terracotta) and
   floating cart (oxblood) are the *named* branded shadows; glass surfaces
   use the neutral `--glass-shadow`. Don't give every panel a coloured halo.
5. **Spring physics are for one-shot celebrations.** Never apply spring to a
   continuous interaction (scroll, drag, hover); the aurora + sheen are
   ambient, not spring.
6. **`prefers-reduced-motion` is respected globally** (the BASE block in
   `globals.css` reduces every animation — the aurora freezes, the sheen
   stops). Don't override per-component.
7. **Generous padding is a discipline.** A request to "make this denser to
   fit more above the fold" usually means we should cut content, not pad.

## What this material is not

- It is **not** the Admin glass. Admin's `glass-card` is a cool, flat,
  utilitarian blur on a tinted operator chrome. Homepage glass is **warm** —
  translucent parchment over a moving Tuscan aurora, with refraction edges
  and the occasional sheen. Same technique (`backdrop-filter`), opposite
  temperature and intent.
- It is **not** the Core material. Core uses hairlines + tone change for
  elevation; Homepage uses translucency + blur + warm shadow.
- It is **not** customisable per page. A location card on the landing and a
  location card on /privacy use the same surface primitive, radius + shadow.
- It is **not** a recolour. The palette (parchment, terracotta, basil,
  oxblood, ochre, espresso) is identical to the pre-glass storefront; only
  the *material* changed.

The Homepage material is the **hospitality treatment** — warm glass on a
living aurora, generous padding, deliberate animation moments, brand-red
focus ring as the persistent signal of interactivity.
