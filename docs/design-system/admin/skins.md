# Admin — skins

A **skin** is a totally distinct Admin theme: its own selector namespace
(`.av3-root[data-skin="<id>"]`), its own `--av3-*` token values. The
active skin is **DB-global** — an operator picks it in `/admin/settings →
Themes` and it applies to every operator. See the cross-theme overview in
[`../README.md`](../README.md#skins--swapping-a-surfaces-whole-theme) and
the registry at `src/lib/theme-skins.ts`.

The `default` skin is the shipped **Operator Terminal** (Admin v3) — no
extra file; it's the base `themes/admin-v3/index.css` left untouched.

## How the admin skin is applied

The admin surface is **already dynamic** (cookie auth), so the active
skin is **server-rendered** — `src/app/admin/(shell)/layout.tsx` reads
`getThemeSkinSettings()` and renders `data-skin` onto the `.av3-root`
element. No boot script, no flash. All of Admin v3 reads `--av3-*`
tokens, so a skin only has to redefine the token palette.

> The `/manager`, `/franchisee`, `/kitchen`, `/terminal`, `/login`
> portals use `themes/base` (the v2 token system), not `admin-v3`, so the
> Admin skin selector does not touch them today. A skin for those would
> scope under `[data-admin-theme]` instead.

## Specificity & the light/dark toggle

`blueprint.css` loads **after** `index.css`, so at equal specificity it
wins. Its dark block (`.av3-root[data-skin="blueprint"]`, `0,2,0`) beats
the default dark `.av3-root` (`0,1,0`); its light block
(`[data-admin-theme="light"] .av3-root[data-skin="blueprint"]`, `0,3,0`)
is one selector deeper, so it beats both `index.css`'s light block
(`0,2,0`) and the dark Blueprint block — meaning **Blueprint still honours
the operator's light/dark toggle.**

## Skins

| id          | label             | Live code                                | Look |
| ----------- | ----------------- | ---------------------------------------- | ---- |
| `default`   | Operator Terminal | `themes/admin-v3/index.css`              | The shipped Admin v3 — warm-neutral dark cockpit, Neapolitan burgundy accent. |
| `blueprint` | Blueprint         | `themes/admin-v3/skins/blueprint.css`    | A cool drafting-table console — deep navy canvas (`#0a1020`), cyan brand (`#38bdf8`), blue hairlines, sharper radii. Dark + light variants. |

## Adding an admin skin

1. Add the skin to `THEME_SKINS.admin` in `src/lib/theme-skins.ts`.
2. Create `themes/admin-v3/skins/<id>.css`, scoped under
   `.av3-root[data-skin="<id>"]`. Redefine the `--av3-*` palette; add a
   `[data-admin-theme="light"] .av3-root[data-skin="<id>"]` block if you
   want the light toggle to do something.
3. `import` it in `src/app/admin/(shell)/layout.tsx` (after `index.css`).
4. Register the file in `../themes.manifest.json` (admin `files`) and run
   `npm run gen:design-system`.
5. Add a row to the table above (Rule #11).

Read `theme/extend.md` before inventing a new token — a skin should
re-value the existing `--av3-*` tokens, not invent parallel ones.
