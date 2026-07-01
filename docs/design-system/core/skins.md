# Core — skins

A **skin** is a totally distinct Core theme: its own selector namespace
(`.core[data-skin="<id>"]`), its own token values. The active skin is
**DB-global** — an operator picks it in `/admin/settings → Themes` and it
applies to every Core surface. See the cross-theme overview in
[`../README.md`](../README.md#skins--swapping-a-surfaces-whole-theme) and
the registry at `src/lib/theme-skins.ts`.

**Core ships two skins.** `liquid-glass` (the **default** — the 2026
Service OS redesign look) and `default` (Core Dark, the original flat
theme). The swap *mechanism* lets an operator flip between them in
`/admin/settings → Themes`; the add checklist is at the bottom.

The `default` skin is the shipped Core Dark theme — no extra file; it's
the base `themes/core/index.css` + `tokens.css` left untouched. The
`liquid-glass` skin adds `themes/core/skins/liquid-glass.css` on top.

> **Default note.** `DEFAULT_THEME_SKINS.core` is `liquid-glass` (in
> `src/lib/theme-skins.ts`), so a Core surface with no saved preference
> renders the glass look. Selecting "Core Dark" in Settings reverts to the
> flat base.

## How a core skin is applied

Core is **already dynamic** (operator surface), so the active skin is
**server-rendered** — `src/app/core/layout.tsx` reads
`getThemeSkinSettings()` and renders `data-skin` onto the `.core` element
(`force-dynamic`), the **same element** that carries `data-theme`
(light/dark). No flash. All Core chrome reads the
`--bg`/`--ink`/`--brand`/… tokens, so a skin only redefines that palette.

**Default light/dark.** Core's default is dark (night trucks / kitchen
glare). `CoreThemeToggle` adopts whatever `data-theme` the server renders
when the operator has no saved preference, and only persists to
localStorage on an explicit toggle — so a future *daylight* skin can
render a `light` default from the layout (computed off `skins.core`) and
it will stick without being overridden on mount.

## Two things a skin must respect

- **The KDS board re-declares its own tokens.** `.core-kds` and
  `.core-kiosk` set `--bg`/`--ink`/tone tokens *on their own element*, and
  custom properties cascade by proximity — so a value set on `.core` (the
  root) loses to one set on `.core-kds`. A skin that wants the in-shell
  board to follow it must re-declare the KDS palette, scoped to
  `.core[data-skin="<id>"] .core-body .core-kds`. Leave the **fullscreen
  kiosk** (`.core-kiosk .core-kds`, not under `.core-body`) dark — it's a
  dark wall by design.
- **Reset specificity.** Redefine tokens, don't re-declare component
  classes, so the `:where()` reset and the `.core .core-foo` component
  rules keep working (see `theme/README.md`).
- **Watch for surface tokens used as *text* colours.** A few base rules use
  a *surface* token as a label colour on an inverted fill —
  `.core-cat.on { color: var(--panel) }` (dark-on-cream in Core Dark). A
  skin that makes that surface token translucent (glass) turns the label
  invisible. `liquid-glass` pins these back (`.core-cat.on:not(.pop) { color:
  var(--bg) }`). When a token flips from opaque→translucent, grep base for
  it used as `color:` and re-anchor those.
- **An aurora skin must un-paint the base's opaque scroll containers.**
  The `liquid-glass` skin paints its ambient aurora on the `.core` root
  and makes panels translucent so they refract it. But the base theme
  fills several *scroll/content* containers with an opaque `var(--bg)`
  (`.core-menu`, `.core-pos-embed`, `.core-thread`, `.core-cap-inspect`).
  Painted on top of the root, they bury the
  aurora — the frosted panels then have only flat black to refract and the
  skin collapses to the dark base look. The skin resets those to
  `background: transparent` (see the "let the aurora through" block).
  **Exclude `.core-kds` / `.core-kiosk`** — they stay a dark wall (rule
  above). If you add a new opaque full-bleed scroll container to Core, add
  it to that transparent list too, or the glass will look flat over it.
- **Sell the glass with a sheen, not just translucency.** A translucent
  fill over a dark aurora still reads flat without a highlight. The skin
  adds `--lg-sheen` (a diagonal top-left specular) as an extra **background
  layer** on the glass primitives (`--lg-sheen, --lg-fill`) — a background
  layer, not an `::after` overlay, so it paints *under* the card text and
  never washes it out — plus a brighter top `--lg-rim`. The aurora also
  carries a soft central wash so cards down the middle column have colour
  to refract, not just the corners.

## Skins

| id             | label        | Live code                                       | Look |
| -------------- | ------------ | ----------------------------------------------- | ---- |
| `liquid-glass` | Liquid Glass | `themes/core/skins/liquid-glass.css`            | **Default.** 2026 liquid glass — translucent frosted surfaces over an ember aurora, specular rim-light, floating chrome. KDS wall stays dark. |
| `default`      | Core Dark    | `themes/core/index.css` + `tokens.css`          | The original Core — near-black flat materials for night trucks + kitchen glare. |

## Adding a core skin

1. Add the skin to `THEME_SKINS.core` in `src/lib/theme-skins.ts`.
2. Create `themes/core/skins/<id>.css`, scoped under
   `.core[data-skin="<id>"]` (+ a `[data-theme="dark"]`/`[data-theme="light"]`
   block to support the toggle; mind the KDS note above).
3. `import` it in `src/app/core/layout.tsx` (after `index.css`). If the
   skin wants a light default, compute `data-theme` from `skins.core` there.
4. Register the file in `../themes.manifest.json` (core `files`) and run
   `npm run gen:design-system`.
5. Add a row to the table above (Rule #11).
