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

## The rule

**A token, font, component, or layout belongs to exactly one theme.** When
you change Admin's accent colour, Core does not move. When you change
Homepage's body font, Admin does not move. If a change to one theme
forces a change to another, you've found a leak — fix the leak, do not
ship the cross-theme change.

## Today vs target

The doctrine above is the **target**. The code today only partially
enforces it:

| What                  | State                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Admin tokens          | ✅ Scoped under `[data-admin-theme="dark"\|"light"]` in `src/app/globals.css`. Edits here only affect admin surfaces.                   |
| Homepage tokens       | ⚠️ Live in the `@theme inline` block of the same `src/app/globals.css`. Same file as Admin → token bleed is possible if names collide. |
| Core tokens           | ❌ No separate scope today — Core surfaces (`/admin/pos`, `/admin/kds`, `/admin/{crm,concierge,whatsapp}`) inherit the Admin theme.    |
| Fonts                 | ❌ Loaded once in `src/app/layout.tsx` via `next/font`. Change Inter here → every theme moves.                                          |
| CSS file              | ❌ One `globals.css` shared by all surfaces.                                                                                            |
| Per-theme `theme.ts`  | ❌ One `src/components/admin/v2/theme.ts` mirrors admin tokens for JS/Recharts. Core/Homepage have no equivalent.                       |

The code split that closes these gaps is in flight — see the per-theme
README for what each theme's "today" looks like.

## Authority

**Code wins** over docs. When this doc and the code disagree, open a PR
to fix the doc. When two themes disagree on a shared surface, the theme
that owns the surface wins (see the per-theme README for ownership).
