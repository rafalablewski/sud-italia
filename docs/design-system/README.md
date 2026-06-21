# Ottaviano — Design System

Three independent themes. **No shared layer.** This is the WordPress
model: each theme owns its own tokens, components, and rules — change a
font in one and the other two stay untouched.

## The three themes

| Theme                       | Surface                                          | Owns                                                                                            |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [**Core**](./core/)         | POS, KDS, Orders, Guest (Inbox + CRM + Loyalty + Concierge + Book), Service | Operator-pressure surfaces. The productised IP — the clean-room rebuild (dark-first, grotesk, flat). |
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

The doctrine above is the **target** and the code today reaches it:
file-level + bundle-level isolation, per-theme fonts, per-theme JS
token mirrors. The Tailwind v4 `@theme` constraint is the one place
the architecture compromises — the homepage tokens file ships globally
(~50 lines) so Tailwind can generate utilities — and that file
still lives under `themes/homepage/` so the "every theme file lives in
its theme's folder" doctrine holds.

| What                          | State                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin tokens                  | ✅ Scoped under `[data-admin-theme="dark"\|"light"]` in `src/app/themes/base/index.css`. Edits only affect admin surfaces.                                                                         |
| Homepage tokens               | ✅ `@theme inline` block lives in `src/app/themes/homepage/tokens.css` (@import-ed by `globals.css` so Tailwind v4 sees it for utility generation; ships globally — ~50 lines). All other Homepage CSS — body, delivery animations, `.pub-*` form elements — lives in `src/app/themes/homepage/index.css` and is JS-imported per-route. |
| Core tokens                   | ✅ Two files: `themes/core/suite.css` (`.core-suite` — the current core-suite design for POS / Guest / KDS) + `themes/core/index.css` (legacy `:root --cmd-*` palette + `.cmd-*` / `.ka-*` / `.kds-*` kitchen chrome + `.wa-console` dialogs).                                                    |
| Per-theme CSS file            | ✅ All theme CSS lives under `src/app/themes/{core,admin,homepage}/`. Editing one cannot accidentally affect another.                                                                              |
| **Per-route bundle loading**  | ✅ `src/app/(public)/layout.tsx` imports `themes/homepage/index.css`; `src/app/admin/layout.tsx` imports `themes/base/index.css`; the Core suite's `src/app/core/layout.tsx` imports `themes/base/index.css` + `themes/core/index.css` + `themes/core/suite.css` (Core reuses the admin tokens, then layers `.core-suite` / `.kds-core` on top). Storefront pages no longer ship admin's or core's chunk; the `/admin` back-office no longer ships core's chunk (it left when POS / KDS / Guest / Service moved to `/core/*`); admin pages no longer ship homepage's chunk. The Homepage `tokens.css` (~50 lines, @theme inline only) ships globally — that's the Tailwind v4 utility-generation cost. |
| Fonts                         | ✅ Each themed route-group layout loads its own `next/font` instances with namespaced variables: `(public)/layout.tsx` → `--font-homepage-{body,heading}`; `admin/layout.tsx` + `core/layout.tsx` + `kitchen/layout.tsx` + `franchisee/layout.tsx` → `--font-admin-{body,display,mono}`. The root `layout.tsx` no longer loads custom fonts. A weight / subset change in one theme can't move another. |
| Per-theme `theme.ts`          | ✅ Three typed mirrors: `src/components/admin/v2/theme.ts` (admin), `src/app/themes/core/theme.ts` (Core), `src/app/themes/homepage/theme.ts` (Homepage). Core + Homepage have no JS consumers today — the mirrors exist so future Recharts / canvas / inline-SVG code imports from one place instead of hardcoding hex. |

**What ships on each route:**

| Route type           | Chunks loaded                                                              | Total minified CSS |
| -------------------- | -------------------------------------------------------------------------- | ------------------ |
| `(public)/*`         | base + Tailwind utilities + `themes/homepage/index.css`                    | ~108KB             |
| `admin/*`            | base + Tailwind utilities + `themes/base/index.css` + `themes/core/index.css` | ~392KB         |
| neither (e.g. `/kitchen`) | base + Tailwind utilities only                                         | ~104KB             |

Selectors are uniquely prefixed/scoped per theme (`[data-admin-theme]` /
`.v2-` for Admin; `.core-suite` + `.cmd-` / `.kds-` / `.ka-` / `.wa-`
for Core; `--color-italia-*` / `.pub-` for Homepage), so even
the small overlap that does still load globally (Tailwind utilities)
cannot trigger cross-theme overrides.

## Authority

**Code wins** over docs. When this doc and the code disagree, open a PR
to fix the doc. When two themes disagree on a shared surface, the theme
that owns the surface wins (see the per-theme README for ownership).

The same-commit discipline that keeps docs and code from drifting lives
in [`CLAUDE.md` Rule #11](../../CLAUDE.md): every add / edit / write /
delete / rename to theme code ships in the same commit as the matching
edit under `docs/design-system/<theme>/`. Audits (`docs/audits/`) are
historical snapshots and never edited retroactively.

## Skins — swapping a surface's whole theme

Each of the three surfaces can be swapped to a **different skin** — a
totally distinct theme with its own selector namespace, its own token
values. This is the "switch theme" layer on top of the per-theme
ownership above: the base theme is the `default` skin; alternates live
beside it and are selected at runtime.

- **Registry** — `src/lib/theme-skins.ts` (pure, client+server safe) is
  the one place that lists which skins exist per surface. The `default`
  skin is always the shipped theme (no extra CSS file).
- **Persistence** — `getThemeSkinSettings()` /
  `updateThemeSkinSettings()` in `src/lib/store.ts` persist a tiny
  `{ homepage, admin, core }` record. It's **DB-global**: one operator
  choice repaints the surface for every visitor.
- **Control** — `/admin/settings → Themes` → **Active skins** (a picker
  per surface; saves instantly per Rule #7). Writes go through
  `PUT /api/admin/themes` (owner-gated, audited).
- **Application** — each skin's CSS is scoped under a `[data-skin="<id>"]`
  selector and is **always loaded** (inert until active):
  - **Admin** + **Core** are already dynamic, so the layout
    server-renders `data-skin` onto the surface root — no flash.
  - **Homepage** stays static, so the skin is delivered via
    `/api/settings/public` (`homepageSkin`) + a pre-paint boot script,
    applied to `<body>` by `HomepageSkinSync` (which also reaches Rule-#4
    portal overlays and cleans up on unmount).

Per-theme detail + the example alternate skin for each surface:
[admin/skins.md](./admin/skins.md) ·
[core/skins.md](./core/skins.md) ·
[homepage/skins.md](./homepage/skins.md).

Per Rule #11, every skin CSS file ships with its row in the matching
`skins.md` and its entry in [`themes.manifest.json`](./themes.manifest.json)
(regenerate with `npm run gen:design-system`).

## The `/admin/settings` → Themes inspector

The Themes tab is **data-driven**, not hand-maintained. Its per-theme
metadata (blurb, files, routes, fonts, selectors, doc + source paths) lives
in one source of truth — [`themes.manifest.json`](./themes.manifest.json) in
this folder. A build step (`npm run gen:design-system`, wired into `prebuild`
in `package.json`) reads the manifest, **computes each file's live line count**
from disk, and emits `src/generated/design-system.json`, which `ThemesTab.tsx`
imports. So the inspector refreshes every deploy and the line counts always
match the deployed code — there is no static blob to update by hand. To change
what the tab shows, edit the manifest (and keep it consistent with the rest of
this folder per Rule #11); never edit the generated JSON or type line counts.
