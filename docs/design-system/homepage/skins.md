# Homepage — skins

A **skin** is a totally distinct storefront theme: its own selector
namespace (`body[data-skin="<id>"]`), its own token values. The active
skin is **DB-global** — an operator picks it in `/admin/settings →
Themes` and it applies to every visitor. See the cross-theme overview in
[`../README.md`](../README.md#skins--swapping-a-surfaces-whole-theme) and
the registry at `src/lib/theme-skins.ts`.

The `default` skin is the shipped **Trattoria** theme — no extra file,
nothing scoped under `[data-skin]`; it's simply the base
`themes/homepage/index.css` + `tokens.css` left untouched.

## How the storefront skin is applied

The storefront stays **static** (it reads runtime config client-side,
like `LayoutGate`), so the skin is applied on the client rather than
server-rendered:

1. **Pre-paint boot script** (`(public)/layout.tsx`) reads
   `localStorage['sud-homepage-skin']` (cached from a previous visit),
   validates it against the registry, and sets `data-skin` on **`<body>`**
   before first paint — no flash on repeat visits.
2. **`HomepageSkinSync`** (`src/components/layout/HomepageSkinSync.tsx`)
   fetches the authoritative active skin from `/api/settings/public`
   (`homepageSkin`), applies it to `<body>`, and refreshes the cached
   value. It **removes** `data-skin` on unmount so a client-side nav to
   `/admin` or `/core` can't inherit a stale storefront skin.

`data-skin` lives on `<body>` (not the `(public)` wrapper) so the skin
also reaches **Rule #4 portal overlays** (CartDrawer, ItemDetailDrawer,
…) that mount to `document.body`. The wrapper carries `.homepage-canvas`
so a skin can paint the page canvas.

## The reskinning constraint (`@theme inline`)

`themes/homepage/tokens.css` uses Tailwind's `@theme inline`, which bakes
literal values into `bg-italia-*` / `text-espresso` utilities — those do
**not** follow a runtime CSS-var change. So a skin reskins in two moves:

- redefine the `--color-*` tokens (covers all `.pub-*` + `index.css`
  rules, which read `var(--color-*)`); and
- re-point the small set of `@theme-inline` utilities the storefront
  actually uses back to `var(--color-*)` (a plain stylesheet rule outranks
  Tailwind's layered utilities, so no `!important`).

## Skins

| id        | label     | Live code                                  | Look |
| --------- | --------- | ------------------------------------------ | ---- |
| `default` | Trattoria | `themes/homepage/index.css` + `tokens.css` | The shipped V8 Trattoria — warm parchment canvas, oxblood brand, editorial serif. |
| `notte`   | Notte     | `themes/homepage/skins/notte.css`          | A candle-lit night room — deep espresso canvas (`#17110d`), warm cream ink (`#f3e7d3`), ochre + terracotta glow. Dark `color-scheme`. |

## Adding a homepage skin

1. Add the skin to `THEME_SKINS.homepage` in `src/lib/theme-skins.ts`
   (`{ id, label, description }`).
2. Create `themes/homepage/skins/<id>.css`, **everything** scoped under
   `body[data-skin="<id>"]`. Redefine `--color-*`; re-point the
   `@theme-inline` utilities you need (see Notte for the set).
3. `import` it in `(public)/layout.tsx` (after `index.css`).
4. Register the file in `../themes.manifest.json` (homepage `files`) and
   run `npm run gen:design-system`.
5. Add a row to the table above (Rule #11).

The boot script's allowed-id list is derived from the registry, so a
removed skin can't be re-applied from a stale cache — deleting a skin is
safe once its row, registry entry, CSS file, layout import, and manifest
entry are all gone.
