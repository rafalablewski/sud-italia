# Core — skins

A **skin** is a totally distinct Core theme: its own selector namespace
(`.core[data-skin="<id>"]`), its own token values. The active skin is
**DB-global** — an operator picks it in `/admin/settings → Themes` and it
applies to every Core surface. See the cross-theme overview in
[`../README.md`](../README.md#skins--swapping-a-surfaces-whole-theme) and
the registry at `src/lib/theme-skins.ts`.

**Today Core ships only its single current theme** (`default` — Core
Dark). The swap *mechanism* is in place so alternates can be added without
new plumbing; the checklist is at the bottom.

The `default` skin is the shipped Core Dark theme — no extra file; it's
the base `themes/core/index.css` + `tokens.css` left untouched.

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

## Skins

| id        | label     | Live code                              | Look |
| --------- | --------- | -------------------------------------- | ---- |
| `default` | Core Dark | `themes/core/index.css` + `tokens.css` | The shipped Core — near-black flat materials for night trucks + kitchen glare. |

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
