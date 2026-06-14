# Extending the system

← back to [README](../README.md)

How to add a colour, a glass surface, a page, an animation, or an icon to
the storefront **without drifting** the design language. The short answer in
every case: edit one canonical file, mirror it where required, document it,
and stop there. Same discipline as the Admin theme's
[`extend.md`](../../admin/theme/extend.md), applied to the warm liquid-glass
material.

## Add a colour token

1. **Edit `src/app/themes/homepage/tokens.css`** — the `@theme inline`
   block. Give it a semantic name (`--color-terracotta-soft`), never a shade
   name (`--clay-300`). Pick a value that **already exists** as a hue, just
   at a different opacity / mix — the storefront palette is a closed set
   (parchment, terracotta, basil, oxblood, ochre, espresso). A genuinely new
   hue is a brand decision, not a token edit.
2. **Mirror in `src/app/themes/homepage/theme.ts`** — the typed constant, in
   the same commit. A divergence between the two is a bug (the CSS wins).
3. **Document** in [`color.md`](./color.md) — append to the right table;
   don't reorder.

**The forbidden:** a raw `#B85C38` in a component. Reach for the utility
(`text-terracotta`) or the var.

## Add a glass surface

A "surface" is a translucent panel that holds content (card / sheet / drawer
/ dialog body). The material is **one recipe** — don't hand-roll a one-off
`backdrop-filter` + fill.

1. **Reach for `.v8-surface` first.** It carries the fill, blur, refraction
   top-edge, border, and warm shadow. Add `.v8-sheen` if the surface should
   catch light on hover. For dense overlays use `.v8-surface-strong`; for the
   dark loyalty surfaces use `.v8-surface-dark`.
2. **If a family needs its own card rule** (most do, for layout), point its
   fill / border / shadow at the `--glass-*` vars rather than literals:
   ```css
   .v8-thing-card {
     position: relative;                 /* for the refraction ::before + sheen */
     background: var(--glass-fill);
     backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
     -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
     border: 1px solid var(--glass-stroke);
     box-shadow: 0 18px 50px -18px var(--glass-shadow),
                 inset 0 1px 0 rgba(255, 255, 255, 0.55);
   }
   ```
3. **Always ship the two fallbacks** (material rule #3):
   - `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
     → an opaque parchment fill + `--shadow-card`.
   - `prefers-reduced-motion` is handled globally (the `globals.css` block
     freezes the aurora + sheen) — don't override per-component.
4. **Hold contrast (material rule #2).** Body copy over the surface must pass
   **WCAG AA**. If it can't at `--glass-fill`, raise to `--glass-fill-strong`;
   never dim the text.
5. **Portal any overlay** (storefront rule #4) — `createPortal(node,
   document.body)`. Glass adds no new fixed-position traps, but re-verify
   stacking after a chrome change.
6. **Document** the new vars/variant in [`material.md`](./material.md)
   (elevation ramp) and the owning surface in the relevant
   [`../pages/*.md`](../pages/) "Live code" note — same commit as the code
   (Rule #11).

**The forbidden:** a translucent panel whose legibility depends on the blur
(no fallback), or a per-surface `rgba(248,239,222,.5)` literal instead of
`--glass-fill`.

## Add an animation

The storefront's motion budget is generous but deliberate.

1. Ambient motion (like the aurora) is **slow, continuous, low-contrast** and
   lives on a canvas/decoration layer — it must never compete with a
   one-shot celebration.
2. Celebratory motion (reward unlock, tier-up, cart-add) may use **spring**,
   one-shot only — never on a continuous interaction (scroll, drag, hover).
3. Declare the keyframe in `themes/homepage/index.css` (storefront-local) or
   reach for the shared `globals.css` library; **document the row** in
   [`material.md`](./material.md) → Motion.
4. `prefers-reduced-motion` is global — don't re-implement it.

## Add a storefront page

1. The route lives under `src/app/(public)/` so it picks up the storefront
   CSS + fonts from `(public)/layout.tsx`. Don't import `themes/homepage/`
   CSS from a `"use client"` component (storefront rule re: server modules).
2. Compose from the existing primitive vocabulary in
   [`components.md`](./components.md) — `.v8-surface`, the `.pub-*` forms,
   `<LayoutGate />` for operator-toggleable blocks. Don't mint a one-off
   header.
3. **Add a `pages/<name>.md`** under [`../pages/`](../pages/) describing the
   sections + a "Live code" pointer to the components, and link it from the
   [README](../README.md) layout tree — same commit.

## Add an icon

Storefront icons are inline hand-drawn SVGs in the V8 pen-sketch voice (the
basil sprig, the Kraków oven, the category sketches), stroked with palette
colours via `currentColor` where possible. Keep new marks in that voice —
single-weight strokes, warm palette, no filled photoreal glyphs. Document a
notable new illustration in the owning `pages/*.md`.

## The meta-rule

Every mutation to theme code — **add, edit, delete, rename** — lands in the
**same commit** as its design-system doc edit (CLAUDE.md Rule #11). `grep`
`docs/design-system/homepage/` after a delete (orphan rows) or rename (stale
"Live code:" path pointers) and fix every hit. `docs/audits/*` are dated
snapshots — never edited retroactively.
