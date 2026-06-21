# Core — skins

A **skin** is a totally distinct Core theme: its own selector namespace
(`.core[data-skin="<id>"]`), its own token values. The active skin is
**DB-global** — an operator picks it in `/admin/settings → Themes` and it
applies to every Core surface. See the cross-theme overview in
[`../README.md`](../README.md#skins--swapping-a-surfaces-whole-theme) and
the registry at `src/lib/theme-skins.ts`.

The `default` skin is the shipped **Core Dark** theme — no extra file;
it's the base `themes/core/index.css` + `tokens.css` left untouched.

## How the core skin is applied

Core is **already dynamic** (operator surface), so the active skin is
**server-rendered** — `src/app/core/layout.tsx` reads
`getThemeSkinSettings()` and renders `data-skin` onto the `.core` element,
the **same element** that carries `data-theme` (light/dark). No flash. All
Core chrome reads the `--bg`/`--ink`/`--brand`/… tokens, so a skin only
redefines that palette.

## Specificity & the light/dark toggle

`solare.css` loads **after** `index.css` (which `@import`s `tokens.css`),
so the base block `.core[data-skin="solare"]` (`0,2,0`) wins at equal
specificity over the default `.core[data-theme="dark|light"]` palettes.
Solare deliberately sets a **light** palette for both modes (it's a
daylight skin), then layers a warm-dim variant for when the operator
flips the toggle to dark
(`.core[data-skin="solare"][data-theme="dark"]`, `0,3,0` → wins).

## Skins

| id        | label     | Live code                          | Look |
| --------- | --------- | ---------------------------------- | ---- |
| `default` | Core Dark | `themes/core/index.css` + `tokens.css` | The shipped Core — near-black flat materials for night trucks + kitchen glare. |
| `solare`  | Solare    | `themes/core/skins/solare.css`     | A warm-daylight Core — sun-bleached parchment surfaces (`#fbf3e7`), terracotta brand (`#c0492a`), softer radii. Light base + a warm-dim dark variant. Covers the in-shell KDS board; the fullscreen kiosk stays dark by design. |

## Production coverage — the KDS board

Core chrome is fully token-driven, so the root block repaints it. The one
surface the root block can't reach is the **KDS board**: `.core-kds` and
`.core-kiosk` re-declare `--bg`/`--ink`/tone tokens *on their own
element*, and custom properties cascade by proximity — so the value set
on `.core` (the root) loses to the value set on `.core-kds` itself.

Solare therefore re-declares the KDS palette explicitly, scoped to the
**in-shell** board only (`.core[data-skin="solare"] .core-body .core-kds`,
plus a `[data-theme="dark"]` warm-dim variant). The **fullscreen kiosk**
(`.core-kiosk .core-kds`, which is not under `.core-body`) is left as a
dark wall on purpose — kitchen glare / night trucks — matching the base
theme's own light/dark KDS rule.

## Adding a core skin

1. Add the skin to `THEME_SKINS.core` in `src/lib/theme-skins.ts`.
2. Create `themes/core/skins/<id>.css`, scoped under
   `.core[data-skin="<id>"]`. Redefine the `--bg`/`--ink`/`--brand`/…
   tokens; add a `.core[data-skin="<id>"][data-theme="dark"]` (and/or
   `[data-theme="light"]`) block to support the toggle.
3. `import` it in `src/app/core/layout.tsx` (after `index.css`).
4. Register the file in `../themes.manifest.json` (core `files`) and run
   `npm run gen:design-system`.
5. Add a row to the table above (Rule #11).

Per `theme/README.md`'s reset-specificity note, redefine tokens — don't
re-declare component classes — so the `:where()` reset and the `.core
.core-foo` component rules keep working unchanged.
