# Admin theme — tokens, type, material, components

Everything the Admin theme owns: colour, typography, depth/material,
component primitives. **No cross-theme links.** When a Core or Homepage
rule looks identical, it is documented separately in that theme — do not
edit a token here to fix another theme's surface.

- [`philosophy.md`](./philosophy.md) — three ideas held together + the
  operating principle that resolves conflicts.
- [`color.md`](./color.md) — dark + light tokens scoped to
  `[data-admin-theme]`, the command palette, the colour rules ("no
  gradient, no glow", platinum = jewellery, brand ≠ status).
- [`typography.md`](./typography.md) — Inter / Fraunces / JetBrains Mono +
  where each face goes (loaded by `src/app/admin/layout.tsx` as
  `--font-admin-*`, applied to the admin subtree via the `#admin-portal-root`
  font-scope rule; see the gap note below).
- [`material.md`](./material.md) — depth, hairlines, radius, motion.
- [`components.md`](./components.md) — buttons, badges, inputs, segmented,
  cards, dialogs, tables, icons (the admin set).

## Code surface

Admin tokens live in `src/app/globals.css` under the
`[data-admin-theme="dark"]` and `[data-admin-theme="light"]` blocks.
JS/Recharts mirror in `src/components/admin/v2/theme.ts`. Glassmorphism
utilities (`glass-card`, `glass-input`, `glass-btn`, `admin-text`) read
straight from those tokens — never hard-code colours in a page.

## Today vs target

| What                | State                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Colour tokens       | ✅ Scoped under `[data-admin-theme]`. Editing here only affects admin surfaces.                                  |
| Material tokens     | ✅ Same scope.                                                                                                   |
| Typography          | ✅ Inter / Fraunces / JetBrains Mono are loaded by `src/app/admin/layout.tsx` as `--font-admin-body` / `--font-admin-display` / `--font-admin-mono` (independent `next/font` instances from the storefront, so an admin face change can't drift the homepage). The theme tokens `--font-ui` / `--font-display` are declared on `[data-admin-theme]` as `var(--font-admin-*)`; because those next/font vars only exist on `#admin-portal-root`, that wrapper re-declares the tokens + sets `font-family` so the admin subtree (incl. portaled overlays) renders Inter/Fraunces instead of falling back to serif. See `typography.md` → *Font scope*. |
| Components          | ⚠️ The glass-* utilities are also used by Core surfaces today (Core renders under admin). True per-theme component sets land with the code split. |

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
