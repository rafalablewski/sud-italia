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
  where each face goes (today loaded once in `src/app/layout.tsx`; see
  the gap note below).
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
| Typography          | ⚠️ Inter / Fraunces / JetBrains Mono are loaded once in `src/app/layout.tsx` and applied via `next/font` to the body. Changing a face here changes every theme. |
| Components          | ⚠️ The glass-* utilities are also used by Core surfaces today (Core renders under admin). True per-theme component sets land with the code split. |

## Authority

When this doc and the code disagree, **code wins** — open a PR to fix
the doc.
