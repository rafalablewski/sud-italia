# Foundations

The shared visual language. **Every surface — Core modules, admin
back-office, mobile, web, tablet — inherits these. Never fork them.**

- [`philosophy.md`](./philosophy.md) — three ideas held together + the
  operating principle that resolves conflicts.
- [`color.md`](./color.md) — dark + light tokens, command palette, the
  colour rules ("no gradient, no glow", platinum = jewellery, brand ≠
  status).
- [`typography.md`](./typography.md) — Inter / Fraunces / JetBrains Mono +
  the rule for where each face goes.
- [`material.md`](./material.md) — depth, hairlines, radius, motion.

**Code is the source of truth.** Tokens live in `src/app/globals.css`
under `[data-admin-theme="dark"]` / `[data-admin-theme="light"]` and the
public `@theme inline` block; JS/Recharts mirror in
`src/components/admin/v2/theme.ts`. When these docs and the code disagree,
the code wins — open a PR to fix the doc.

Surface-specific rules (admin, mobile, web, tablet) extend these
foundations; they do not replace any token defined here.
