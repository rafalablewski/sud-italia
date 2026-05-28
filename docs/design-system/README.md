# Sud Italia — Design System

Three independent themes. **No shared layer.** This is the WordPress
model: each theme owns its own tokens, components, and rules — change a
font in one and the other two stay untouched.

## The three themes

| Theme                       | Surface                                          | Owns                                                                                            |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [**Core**](./core/)         | POS, KDS, Guest (CRM + Concierge + WhatsApp)     | Operator-pressure surfaces. The productised IP.                                                 |
| [**Admin**](./admin/)       | The back-office: every `/admin/*` outside Core   | Dashboard, Orders, Operations, Inventory, People, Customers, Finance, Growth, Intelligence, System |
| [**Homepage**](./homepage/) | The public storefront: `/`, `/menu`, `/checkout`, `/order`, `/loyalty` | Guest-facing web. Zero-friction ordering.                          |

Each theme has the same internal shape:

```
<theme>/
├── README.md       ← theme overview + the rules unique to this theme
├── theme/          ← color, typography, material, components (theme-owned)
└── <surfaces>/     ← per-page or per-module docs
```

The only file at the top of `design-system/` is
[`backlog.md`](./backlog.md) — the cross-theme cleanup inventory.

## The rule

**A token, font, component, or layout belongs to exactly one theme.** When
you change Admin's accent colour, Core does not move. When you change
Homepage's body font, Admin does not move. If a change to one theme
forces a change to another, you've found a leak — fix the leak, do not
ship the cross-theme change.

## Today vs target

The doctrine above is the **target**. The code today partially enforces
it — file-level isolation is shipped; route-level isolation is bounded
by a Tailwind v4 constraint:

| What                  | State                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Admin tokens          | ✅ Scoped under `[data-admin-theme="dark"\|"light"]` in `src/app/themes/admin/index.css`. Edits here only affect admin surfaces.        |
| Homepage tokens       | ✅ Live in `src/app/themes/homepage/index.css` (the `@theme inline` block + delivery animations + `.pub-*` form elements).              |
| Core tokens           | ✅ Live in `src/app/themes/core/index.css` (`:root --cmd-*` palette + `.kds-*` / `.ka-*` / `.pos-*` / `.crm-*` / `.cncrg-*` / `.wa-*` surfaces). |
| Per-theme CSS file    | ✅ Three files under `src/app/themes/{core,admin,homepage}/index.css`. Editing one cannot accidentally affect another.                  |
| Per-route loading     | ❌ All three theme CSS files are `@import`-ed by `src/app/globals.css`, so all three ship globally. Route-level loading via per-layout JS imports breaks Tailwind v4's `@theme` utility generation (Tailwind only scans the `@import` chain rooted at the entry file). |
| Fonts                 | ❌ Loaded once in `src/app/layout.tsx` via `next/font`. Change Inter here → every theme moves.                                          |
| Per-theme `theme.ts`  | ❌ One `src/components/admin/v2/theme.ts` mirrors admin tokens for JS/Recharts. Core/Homepage have no equivalent.                       |

**File-level isolation is what the code can guarantee today.** Selectors
are uniquely prefixed per theme (`[data-admin-theme]` / `.v2-` for
Admin, `.cmd-` / `.kds-` / `.ka-` / `.pos-` / `.crm-` / `.cncrg-` / `.wa-`
for Core, `--color-italia-*` / `.pub-` for Homepage) so even though
all three load globally, no theme's rules override another's. Changing
the Admin accent in `themes/admin/index.css` cannot accidentally repaint
Core or Homepage.

## Authority

**Code wins** over docs. When this doc and the code disagree, open a PR
to fix the doc. When two themes disagree on a shared surface, the theme
that owns the surface wins (see the per-theme README for ownership).
