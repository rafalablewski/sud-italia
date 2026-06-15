# Homepage — Extending the Liquid Glass material

← back to [Homepage README](../README.md)

The contract for **how** to add to the storefront's glass material. Same
discipline as the rest of the theme: don't fork the recipe, don't invent
a colour. Read this before reaching for a new `background: rgba(...)` +
`backdrop-filter` anywhere under `themes/homepage/`.

Code wins over docs — if you change the material, update this file in the
same commit (CLAUDE rule 11).

## Adding a glass surface

A new card / panel / sheet does **not** declare its own glass. Compose a
primitive onto it and let the card own only its radius, padding, layout:

```css
.v8-my-new-card {            /* layout only */
  border-radius: 14px;
  padding: 18px;
}
```
```tsx
<article className="v8-my-new-card v8-surface v8-sheen">…</article>
```

- `.v8-surface` — standard card.
- `.v8-surface-strong` — a portalled drawer or a sticky bar.
- `.v8-surface-dark` — a surface on the espresso/dark canvas.
- Add `.v8-sheen` for the hover light-sweep; add `.v8-caustic` to an
  illustration tile for the drifting shimmer.

The primitive supplies fill + blur + refraction edge + shadow from the
`--glass-*` tokens.

**Two ways to wear glass, one source of truth:**

1. **New cards** compose `.v8-surface*` (above) — cleanest, gets the
   `::before` refraction edge for free.
2. **Legacy V8 card classes** that already own a `::before`/`::after`
   (flag ribbons, accent stripes — e.g. `.v8-mi`, `.v8-bundle`) can't
   add a second pseudo, so they apply the glass **inline from the same
   tokens** instead: `background: var(--glass-fill); backdrop-filter:
   var(--glass-blur); border: 1px solid var(--glass-border); box-shadow:
   var(--glass-shadow), var(--glass-edge);`. The `--glass-edge` inset
   highlight is the refraction read in lieu of the `::before`.

The rule that matters: **never hard-code an `rgba(248,239,222,…)` fill or
a literal `blur(22px)` value** — always reach through the `--glass-*`
tokens so a retune ripples from one place.

## Retuning the glass

All glass reads from the `--glass-*` vars in the `:root` block of
`index.css`. Change the look there once and every surface follows:

| Token | Controls |
| ----- | -------- |
| `--glass-fill` / `-fill-strong` | parchment card opacity |
| `--glass-dark` | espresso surface opacity |
| `--glass-border` / `-border-dark` | refraction edge brightness |
| `--glass-blur` / `-blur-strong` | blur + saturation depth |
| `--glass-shadow` / `-shadow-strong` | warm drop shadow |
| `--glass-edge` / `-edge-dark` | inset top highlight |
| `--glass-lens` | Apple-style lensing — bright top **and** faint bottom inner rim, for interactive controls (steppers, segmented control, toggles) that should read as physical glass pebbles |

### Interactive glass (2026 refinement)

Controls the guest touches get a slightly richer treatment than static
cards, borrowed from Apple's Liquid Glass:

- **Lensed rim** — apply `--glass-lens` (not just `--glass-edge`) so light
  catches both lips of the pebble. Used by the cart/menu steppers
  (`.v8-cart-qty-btn`, `.v8-mi-stepper-btn`) and the fulfillment segment
  (`.v8-cart-fulfill-btn.is-on`).
- **Press feedback** — interactive glass scales down on `:active`
  (`transform: scale(0.9)` for round pebbles, `0.97–0.99` for pills/CTAs).
  Never spring; a quick `0.12s var(--ease)` snap.
- **Specular CTA** — the primary terracotta button layers an inset gloss
  (`inset 0 1px 0` highlight + a soft inner sheen) so it reads as glass
  laid over the brand colour, not a flat fill.
- **Fading hairlines** — dividers between glass rows fade to transparent at
  both ends (`linear-gradient(90deg, transparent, var(--color-line),
  transparent)`) rather than a hard edge-to-edge rule.

## Adding an aurora pool

The aurora is four `radial-gradient` pools in `body::before`. To add a
fifth, append a pool to **both** the `background` list and the
`background-size` list, then extend the `v8-aurora` keyframe's
`background-position` lists by one entry each (every layer needs a
from/to position or the animation desyncs). **Use a low-alpha wash of an
existing palette hue** — never a new colour. Keep total pools ≤ 5; more
muddies the canvas and costs paint.

## Adding a tinted glass variant

If a surface needs a tint the three primitives don't cover (e.g. a
basil-tinted success panel), add a *modifier* that overrides only the
fill, never a standalone copy of the whole recipe:

```css
.v8-surface.is-basil { background: rgba(74, 124, 89, 0.16); }
```

The blur, edge, shadow, and `::before` refraction all stay inherited.

## Motion + fallbacks are not optional

Any new animated glass effect must:

1. degrade under `@supports not (backdrop-filter)` (opaque fallback),
2. drop its blur at `@media (max-width: 540px)` if it's a large surface,
3. still under `@media (prefers-reduced-motion: reduce)`.

The three primitives already do all three — you only own this when you
add a *new* keyframe or a *new* large blurred surface.
