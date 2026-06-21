# Admin — skins

A **skin** is a totally distinct Admin theme: its own selector namespace
(`.av3-root[data-skin="<id>"]`), its own `--av3-*` token values. The
active skin is **DB-global** — an operator picks it in `/admin/settings →
Themes` and it applies to every operator. See the cross-theme overview in
[`../README.md`](../README.md#skins--swapping-a-surfaces-whole-theme) and
the registry at `src/lib/theme-skins.ts`.

**Today Admin ships only its single current theme** (`default` — Operator
Terminal). The swap *mechanism* is in place so alternates can be added
without new plumbing; the checklist is at the bottom.

The `default` skin is the shipped Admin v3 — no extra file; it's the base
`themes/admin-v3/index.css` left untouched.

## How an admin skin is applied

The admin surface is **already dynamic** (cookie auth), so the active
skin is **server-rendered** — `src/app/admin/(shell)/layout.tsx` reads
`getThemeSkinSettings()` and renders `data-skin` onto the `.av3-root`
element (`force-dynamic`, so a statically-prerendered admin page can't
bake a build-time value). No boot script, no flash. All of Admin v3 reads
`--av3-*` tokens, so a skin only has to redefine the token palette.

> The `/manager`, `/franchisee`, `/kitchen`, `/terminal`, `/login`
> portals use `themes/base` (the v2 token system), not `admin-v3`, so the
> Admin skin selector does not touch them today. A skin for those would
> scope under `[data-admin-theme]` instead.

## Two things a skin must respect

- **Charts follow the skin for free.** The v3-native inline-SVG charts
  (`src/admin-v3/ui/Chart.tsx`) draw every fill/stroke as `var(--av3-c*)`
  / `var(--av3-grid)`, and nothing consumes the JS palette in
  `src/admin-v3/theme.ts` for rendering — so re-valuing the chart tokens
  repaints the charts with no JS change.
- **White button text.** `.av3-btn-primary` (and the active auth/location
  chips) hardcode `color: #fff` on `var(--av3-brand)`, so a skin's brand
  must be dark enough to clear WCAG AA with white text.
- **Light/dark.** Define both a `.av3-root[data-skin="<id>"]` block and a
  deeper `[data-admin-theme="light"] .av3-root[data-skin="<id>"]` block
  (the latter wins over `index.css`'s own light block) so the skin honours
  the operator's light/dark toggle.

## Skins

| id        | label             | Live code                   | Look |
| --------- | ----------------- | --------------------------- | ---- |
| `default` | Operator Terminal | `themes/admin-v3/index.css` | The shipped Admin v3 — warm-neutral dark cockpit, Neapolitan burgundy accent. |

## Adding an admin skin

1. Add the skin to `THEME_SKINS.admin` in `src/lib/theme-skins.ts`.
2. Create `themes/admin-v3/skins/<id>.css`, scoped under
   `.av3-root[data-skin="<id>"]` (+ a light block, see above).
3. `import` it in `src/app/admin/(shell)/layout.tsx` (after `index.css`).
4. Register the file in `../themes.manifest.json` (admin `files`) and run
   `npm run gen:design-system`.
5. Add a row to the table above (Rule #11).

Read `theme/extend.md` before inventing a new token — a skin should
re-value the existing `--av3-*` tokens, not invent parallel ones.
