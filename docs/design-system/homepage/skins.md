# Homepage — skins

A **skin** is a totally distinct storefront theme: its own selector
namespace (`body[data-skin="<id>"]`), its own token values. The active
skin is **DB-global** — an operator picks it in `/admin/settings →
Themes` and it applies to every visitor. See the cross-theme overview in
[`../README.md`](../README.md#skins--swapping-a-surfaces-whole-theme) and
the registry at `src/lib/theme-skins.ts`.

**Today the storefront ships only its single current theme** (`default` —
V8 Trattoria). The swap *mechanism* is in place so alternates can be
added without new plumbing; the checklist is at the bottom.

The `default` skin is the shipped theme — no extra file, nothing scoped
under `[data-skin]`; it's simply the base `themes/homepage/index.css` +
`tokens.css` left untouched.

## How a storefront skin is applied

The storefront stays **static** (it reads runtime config client-side,
like `LayoutGate`), so a skin is applied on the client rather than
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

`data-skin` lives on `<body>` (not the `(public)` wrapper) so a skin also
reaches **Rule #4 portal overlays** (CartDrawer, ItemDetailDrawer, …)
that mount to `document.body`. The wrapper carries `.homepage-canvas` so a
skin can paint the page canvas.

## Two gotchas the next skin will hit

- **`@theme inline` utilities.** `themes/homepage/tokens.css` uses
  Tailwind's `@theme inline`, which bakes literal values into
  `bg-italia-*` / `text-espresso` utilities — those do **not** follow a
  runtime CSS-var change. A skin reskins in two moves: redefine the
  `--color-*` tokens (covers all `.pub-*` + `index.css` rules, which read
  `var(--color-*)`), then re-point the handful of `@theme-inline`
  utilities the storefront uses back to `var(--color-*)` (a plain
  stylesheet rule outranks Tailwind's layered utilities, so no
  `!important`).
- **Overloaded tokens.** Some tokens carry two luminance roles —
  `--color-espresso` is dark *text* but also a dark *surface* (footer,
  `.v8-ps-dark`); `--color-parchment` is light *text* on those dark
  sections but also a light *surface* (cards). A dark skin can't invert
  them wholesale: pick the majority role globally, then **re-declare the
  overloaded tokens at each dark-section scope** (`.v8-pfoot`,
  `.v8-ps-dark`, …) back to their dark-context meaning — custom
  properties cascade by element, so each context resolves correctly.

## Skins

| id        | label     | Live code                                  | Look |
| --------- | --------- | ------------------------------------------ | ---- |
| `default` | Trattoria | `themes/homepage/index.css` + `tokens.css` | The shipped V8 Trattoria — warm parchment canvas, oxblood brand, editorial serif. |

## Adding a homepage skin

1. Add the skin to `THEME_SKINS.homepage` in `src/lib/theme-skins.ts`
   (`{ id, label, description }`).
2. Create `themes/homepage/skins/<id>.css`, **everything** scoped under
   `body[data-skin="<id>"]` (mind the two gotchas above).
3. `import` it in `(public)/layout.tsx` (after `index.css`).
4. Register the file in `../themes.manifest.json` (homepage `files`) and
   run `npm run gen:design-system`.
5. Add a row to the table above (Rule #11).

The boot script's allowed-id list is derived from the registry, so a
removed skin can't be re-applied from a stale cache — deleting a skin is
safe once its row, registry entry, CSS file, layout import, and manifest
entry are all gone.
