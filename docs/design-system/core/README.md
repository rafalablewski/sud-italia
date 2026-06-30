# Core — the staff operating system

`/core/*` is the staff-facing operating system — POS, KDS, Orders, the
Guest hub and Service. It is a **clean-room build**: one theme, its own
shell, and its **own** UI primitives (`src/core/ui/` — toasts, dialogs)
rather than the admin-styled `src/ui` kit, so "Core ≠ Admin" is true at
every layer.

> **History.** Core was rebuilt from the ground up alongside the previous
> `/core` (the old three-layer `suite.css` theme) under a temporary
> `/core-v2` segment, then **promoted to `/core` on 2026-06-12** — the old
> suite and its `index.css`/`suite.css` threads were deleted in the same
> swap. The redesign brief: dark-first, grotesk display, flat materials,
> one theme, no admin inheritance. If you are starting the *next* redesign,
> read **"Naming contract & swap playbook"** below first.

## What Core reuses (and what it does not)

**UI: nothing shared.** No admin `suite.css`, no `src/ui` kit. The theme,
shell, and every primitive live under `src/app/themes/core/` + `src/core/`.

**Platform: the shared engine** — forking it would mean two databases, two
auth systems, two menus:

- data/store — `@/data/menus`, `@/data/types`, `@/lib/locations-store`
- auth — `@/lib/admin-auth`, `@/lib/permissions`
- shared state/infra — `@/shared/LocationContext` (`LocationProvider` /
  `useLocation`), `@/shared/CurrencyGuard` (PLN pin)

The shared infra is **neutralised** out of the `Admin*` naming
(`AdminLocationProvider` → `LocationProvider`, `useAdminLocation` →
`useLocation`, `AdminCurrencyGuard` → `CurrencyGuard`) so nothing in Core
reads as "admin". (Admin's own scope hook is the separate
`useAdminLocationV3`, untouched.)

## The design language

Distinct from Admin (glass) — Core is dark-first and flat. The decisions,
locked:

| Axis | Decision | Why |
| --- | --- | --- |
| **Mode** | **Dark-first**, light optional. KDS board follows the theme; the fullscreen kiosk stays dark. | Night trucks + kitchen glare. Light is there for bright daytime POS. |
| **Display type** | **Bricolage Grotesque** (all-sans, optical size) | No serif — reads as an *operating system*, not a menu. |
| **UI / mono** | Inter (UI) · JetBrains Mono (figures) | Neutral, dense, legible at a glance across a busy line. |
| **Brand** | **BRACE** — ember terracotta (`--brand #E86B3E`), the warm char of a wood-fired crust | Warm + appetising, not aggressive. Red stays only as the `--danger` accent. |
| **Material** | **Flat** — 1px hairlines, crisp small shadows | No glass, no gradient, no glow. Admin owns glass; Core stays crisp. |
| **Layout** | A single **command bar** on top + a centred **bottom surface-switcher** nav | One chrome shared by every surface; no sidebar. The command bar holds brand · a horizontally-scrolling context strip (eyebrow + the surface's view tabs + its own controls) · global controls (location · clock · **notifications bell** · theme). The primary surface switcher (POS · KDS · Orders · Guest · Service) sits as a centred pill at the very bottom (thumb-reach). |
| **Radius** | 7 / 10 / 14 / 20 px | Softer than Admin, tighter than a consumer app. |

### Tokens (`themes/core/`)

Defined per-mode on `.core[data-theme="dark|light"]` in `tokens.css`.
Canonical names:

- **Surfaces** — `--bg` · `--panel` · `--panel-2` · `--panel-3` · `--hover`
- **Ink** — `--ink` · `--ink-2` · `--ink-3`
- **Lines** — `--line` · `--line-2`
- **Brand** — `--brand` · `--brand-bright` · `--brand-ink` · `--brand-wash`
- **Semantic** — `--basil` (+`-wash`) · `--amber` (+`-wash`) · `--info`
  (+`-wash`) · `--danger` (+`-wash`)
- **Contrast inks** (text on filled accents) — `--on-accent` (dark, on the
  light ember/saffron) · `--on-basil` (dark, on basil) · `--on-danger` (white,
  on the one dark accent, San Marzano red)
- **Elevation** — `--sh-1` · `--sh-2` · `--sh-pop`
- **Type** — `--display` · `--ui` · `--mono`
- **Radius** — `--r-sm` · `--r-md` · `--r-lg` · `--r-xl` · `--pill`
- **Motion** — `--fast`

KDS re-declares the surface/ink + tone tokens to a dark wall by default; the
**in-shell board** follows the app theme (a light override on
`.core-body .core-kds`), while the **fullscreen kiosk** stays dark regardless.

## Surfaces

Every surface is wired to the real engine. Routes are built from
`CORE_BASE` in [`src/core/routes.ts`](../../../src/core/routes.ts) — never
hard-code `/core/...` in the shell, tabs or redirects.

- **POS** (`/core/pos`) — category rail · text-forward menu cards ·
  multi-tab open checks · dine-in coursing (Fire per course) · combo +
  cross-sell offers · capacity-true pace steering · Charge → Tender · a
  **QR pill** surfacing QR table orders + Print-table-QR.
- **KDS** (`/core/kds`) — Fleet · **Floor** (New → Firing → Ready·Expo
  lanes, SLA tiers, cook-meters, bump) · Chef. Board follows the theme;
  fullscreen kiosk drops the chrome and stays a dark wall.
- **Orders** (`/core/orders`) — every order at the location, live &
  history: scope tabs (Current · Paid · All), channel filter, search
  (id / guest / phone / table), KPI strip, and a detail dialog with the
  full ticket + Mark paid + Print receipt. See `modules/orders.md` +
  `modules/receipt-printer.md`.
- **Guest** (`/core/guest`) — Inbox (WhatsApp 3-pane + live order
  context + NBA) · Guests (CRM) · Loyalty · Concierge · Book.
- **Service** (`/core/service`) — **Floor** (zoned table tiles, status,
  turn time) · Slots (capacity fill + demand surge).

The original design-language mockups are kept for reference at
`tests/sketches/core-v2-design-language.html` (POS hero) and
`tests/sketches/core-v2-all-surfaces.html` (all surfaces, switchable).

## Re-theming — a theme change vs a structural change

Two very different kinds of "redesign", with very different blast radius — know
which one you're doing before you start.

**Theme change (re-skin) — edit `themes/core/` only; `/core/` untouched.**
Palette, typography, radius, materials, dark/light feel. Every colour, font,
radius, shadow and motion value is a token, and the components reference
semantic classes (`core-*`) — never raw colours. So a re-skin is: edit
`tokens.css` (and the `next/font` instances in `src/app/core/layout.tsx`); the
route + component code in `src/core/` and `src/app/core/` does **not** change.

Where each colour lives:

- **`tokens.css`** — the global palette + semantics (`--bg`, `--panel`,
  `--ink`, `--brand`, `--basil`/`--amber`/`--info`/`--danger` + washes), the
  filled-accent inks (`--on-accent` for white-on-brand, `--on-basil` for
  ink-on-green), the loyalty tier metals (`--tier-platinum`/`-silver`/`-bronze`
  + washes), elevation, type, radius, motion — in the dark + light blocks.
- **`index.css` → `.core-kds` / `.core-kiosk`** — the KDS kitchen wall's OWN
  scoped surface palette + status tones (`--t-firing`/`-warn`/`-risk`/`-late`/
  `-ready`/`-queued`), because they're KDS-specific (dark by default; the
  in-shell board follows the app theme, the fullscreen kiosk stays a dark wall).
- **Functional literals that are NOT theme colours** and must stay hard-coded:
  the QR quiet-zone white and the print-document styles in `CoreQrQueue` — a QR
  must scan and a printed poster is theme-independent. These are the only raw
  colours left in the components, by design.

The rule for components: a colour is always a token (`var(--…)`), never a hex
literal or a `var(--token, #fallback)` fallback. If you need a new colour, add
a token in `tokens.css` first.

**Structural change — this touches `/core/` components.**
A new layout/DOM, a different shell, a new class taxonomy, new surfaces. The
class names + structure live in the components' JSX, so this is real component
work — it **cannot** be a `themes/`-only edit. Treat it as a rebuild and follow
the swap playbook below; don't try to force it through CSS alone.

## Naming contract & swap playbook

The promotion that created today's Core was a **large diff** for one
avoidable reason: the parallel build encoded its name into every
identifier — the `core-v2` directories, the `CoreV2*` symbols, and the
`.core`/`core-*` classes were all minted as `cv2`/`cv-`, so promotion meant
renaming all of them. Don't repeat that. The contract for the next redesign:

**1. The current names are stable and version-free.** Dir `core`, route
base `/core`, symbols `Core*`, theme root `.core`, class prefix `core-`,
font vars `--font-core-*`, theme key `core`. None carry a version. Keep it
that way.

**2. Prefer an in-place rebuild over a parallel directory.** The cheapest
swap is no rename at all: build the redesign on a **branch**, replacing the
contents of `src/core` / `src/app/themes/core` in place, and ship by merge.
Identifiers never change, so the diff is the real design work and nothing
else. Use a feature flag / `data-core-rev` attribute if you need both looks
behind one route during rollout.

**3. If a parallel *live* route is unavoidable**, build it under
`/core-next` with a temporary `cn-` class prefix + `CoreNext*` symbols, and
promote with one scripted token-swap (`cn-`→`core-`, `CoreNext`→`Core`,
`core-next`→`core`) **plus the checklist below** — not an ad-hoc sweep.

**4. Route base.** A re-base (Core moving under another segment) is a
one-line change to `CORE_BASE` in `src/core/routes.ts`; the shell switcher,
the Guest/Service view tabs and the index `redirect()`s all read from it.

**Swap/promotion checklist**

1. Make the parallel build self-contained (no `@/core/*` imports left
   reaching into the version being replaced).
2. Delete the outgoing surfaces: `src/app/core`, `src/core`,
   `src/app/themes/core`, `docs/design-system/core`.
3. Move the incoming build into those paths (`git mv`), then rename files
   and run the token-swap.
4. Repoint external refs: `next.config.ts` redirects, `src/app/capabilities`,
   `docs/design-system/themes.manifest.json` (collapse to one `core` entry).
5. Regenerate the manifest: `npm run gen:design-system`.
6. Verify: `npx tsc --noEmit`, `npx eslint`, `npm test`, `npm run build`.
7. Add a `/core-prev/*` (or old-segment) redirect so stale bookmarks resolve.

## Layout of this folder

```
core/
├── README.md          ← you are here (overview + design language + swap playbook)
├── theme/             ← tokens, type, material, components (theme-owned)
└── modules/           ← per-surface anatomy: pos · kds · orders · guest · service · receipt-printer
```

`theme/` and `modules/` land in the same commits as the code they
document (Rule #11).

## Rules that still apply

Core is held to the same project rules as everything else — real data only
(no mock/hardcoded), serverless-safe store access, no server imports in
client components, portals for overlays, five-part metric explainers,
chain-wide recipes, and **design-system docs ship with the code**. See the
root `CLAUDE.md`.
