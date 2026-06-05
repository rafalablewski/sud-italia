# Admin v3 — "Operator Terminal"

> **Status: in active build (preview).** v3 is a ground-up rebuild of the
> admin back-office, fully isolated from v2 so that once it reaches parity
> the entire v2 system (`src/app/themes/admin/index.css`,
> `src/components/admin/v2/`, the top-level `Admin*.tsx` page bodies) can be
> deleted in one stroke without touching v3. **This doc grows with the code**
> per design-system Rule #11.

## Why a v3

v2 is mature, polished, and governance-locked — but it was built for
*identity and breathing room*. The operator running two trucks across Kraków
and Warszawa needs the opposite: **maximum signal per screen, fewer clicks,
and a modern data-forward surface**. v3's brief, decided with the owner:

- **Density / efficiency** — more live numbers in view, tighter controls,
  one-glance KPI rails, compact tables, a collapsible icon rail. Built for a
  power user who lives in this product all day.
- **Modernization** — current dashboard idioms (inline sparklines, delta
  chips, restrained motion, tabular numerals everywhere) on a deeper,
  cleaner dark canvas. The reference remains Linear / Stripe / Bloomberg —
  but pushed denser.

The philosophy is unchanged from the admin theme — **Rams restraint, Ive
soul, quiet power** (see [`../theme/philosophy.md`](../theme/philosophy.md)).
v3 spends that restraint differently: the brand still appears once (wordmark,
the single money CTA), colour is still signal, but the *grid is tighter* and
*every pixel of chrome is justified by a number it reveals*.

## Isolation contract (so v2 stays deletable)

| Concern        | v2 (to be deleted)                          | v3 (the rebuild)                               |
| -------------- | ------------------------------------------- | ---------------------------------------------- |
| Theme CSS      | `src/app/themes/admin/index.css`            | `src/app/themes/admin-v3/index.css`            |
| Class prefix   | `.v2-*`, `.glass-*`, `.admin-*`, `.app-sidebar` | `.av3-*` (single prefix, no legacy aliases) |
| Token scope    | `[data-admin-theme]` on `<html>`            | `.av3-root` (reads the same `[data-admin-theme]` attr) |
| JS token mirror| `src/components/admin/v2/theme.ts`          | `src/components/admin/v3/theme.ts`             |
| Components      | `src/components/admin/v2/*`                 | `src/components/admin/v3/*`                     |
| Mount route    | `/admin/*` (live)                           | `/admin-v3/*` (preview, flips to `/admin` at parity) |

**The one shared dependency v3 keeps:** the framework-level libs that are
*not* part of either theme — `@/lib/permissions`, `@/lib/admin-roles`,
`@/lib/admin-auth`, `@/lib/admin-base`, `@/data/locations`, and the
PLN-pinning `AdminCurrencyGuard`. These are app infrastructure, not v2, and
survive a v2 deletion. v3 imports nothing from `components/admin/v2/`.

**Theme boot reuse, not coupling:** v3 reads the same `[data-admin-theme]`
attribute the existing boot script sets on `<html>`, but ships its **own**
boot script (`themes/admin-v3/theme.ts` → `themeBootScriptV3`) so deleting v2
leaves it intact. Dark is canonical; light is opt-in.

## Tokens

All v3 tokens are `--av3-*` and live only inside `.av3-root` in
`src/app/themes/admin-v3/index.css`, mirrored in
`src/components/admin/v3/theme.ts` for charts / inline SVG. Never hardcode a
hex in a v3 component — use the token.

| Group     | Tokens (dark canonical)                                                  |
| --------- | ----------------------------------------------------------------------- |
| Canvas    | `--av3-bg` `--av3-s1` `--av3-s2` `--av3-s3` `--av3-hover`                |
| Hairlines | `--av3-line` `--av3-line-strong`                                         |
| Text      | `--av3-fg` `--av3-muted` `--av3-subtle`                                  |
| Brand     | `--av3-brand` `--av3-brand-soft` · `--av3-platinum` (active / premium)   |
| Status    | `--av3-ok` `--av3-warn` `--av3-bad` `--av3-info` (+ `-soft` mixes)       |
| Geometry  | `--av3-r-{sm,md,lg,pill}` radius · `--av3-gap-{1..5}` spacing            |
| Motion    | `--av3-ease` · `--av3-t-{fast,base,slow}`                                |
| Charts    | `--av3-c1 … --av3-c8` (mirrors `theme.ts` palette)                       |

## Shell

`AdminShellV3` (`src/components/admin/v3/AdminShellV3.tsx`) — a denser frame:
a **232px sidebar that collapses to a 60px icon rail** (state persisted), a
**44px topbar** with breadcrumb + the single shell-level scope switcher +
theme toggle + notification bell, and a content well on a tight grid. Nav
taxonomy + permission gating mirror v2 (`v3/nav.config.ts`, same sections,
same `requiredRole` model via `@/lib/admin-roles`).

## Primitives (so far)

`v3/ui` — `Card`, `Button`, `Badge`, `Chip`, `Kpi` (the dense metric tile
with inline sparkline + delta), `Sparkline` (dependency-free inline SVG),
`Table` (compact, sticky header, right-aligned numerics), `Dialog` (portaled
to `#admin-portal-root` per rule #4). The set grows as pages migrate.

Shared list-page chrome lives in `themes/admin-v3/index.css` §11–13: the
filter-chips-with-counts + view toggle (`.av3-filterchips` / `.av3-viewtoggle`),
the Kanban board (`.av3-kanban` / `.av3-kcol` / `.av3-ocard`), and the dialog
(`.av3-dialog-*`).

## The Dashboard — "Operator Terminal"

The v3 home surface (`v3/DashboardV3.tsx`) is **not** an analytics report — it's
a live operations cockpit, owner-gated like the v2 `/admin` HQ. Layout (top →
bottom, then a 2-column split):

- **Revenue → daily-goal hero** — fills against a *real, operator-set* daily
  goal (`getOpsGoals`/`updateOpsGoals` in `store.ts` → `GET/PUT
  /api/admin/ops-goals`, owner-only; chain default + per-location override,
  edited inline). No goal set ⇒ the bar hides and it reads pace-vs-forecast.
  The "on pace for X by close" projection is real: labour-efficiency
  `forecastOrders` × live AOV (never a hardcoded number — rule #1).
- **Live tiles** — Cooking / Ready / Due-late from `/api/admin/kds/fleet`
  counts; Covers from real orders.
- **Levers that move the goal** — AOV, items/order, margin, labour ratio, each
  vs a stated benchmark, with day-over-day deltas where available.
- **What moves it most** — ranked from real signals (goal gap in zł, late
  tickets, hottest KDS bottleneck, labour ratio, attach) — never fabricated
  impact figures.
- **Kitchen pace + Trucks** — per-truck bottleneck/util + open/closed
  (`isLocationOpenNow`) + on-line/on-shift + revenue-today, all from the fleet
  endpoint.
- **Order flow** — orders/min last 60 min, bucketed from `/api/admin/orders`.
- **Live feed + "Needs you now"** — the right-hand spine, from
  `/api/admin/notifications` (+ derived late/low-stock/slot signals).

CSS for these lives in `themes/admin-v3/index.css` §10 (`.av3-goalbar`,
`.av3-tiles`, `.av3-levers`, `.av3-move`, `.av3-station`, `.av3-truck`,
`.av3-flow`, `.av3-feedcard`). Scope is the shell-level switcher; all data
refetches every 30s.

## What v3 is not

- **Not a re-skin of v2.** No `.v2-*` / `.glass-*` class is reused; v3 cannot
  import from `components/admin/v2/`.
- **Not Core.** POS / KDS / Guest stay on the Core theme — v3 never touches
  `/core/*`.
- **Not looser.** If a v3 surface ends up with more whitespace than its v2
  predecessor, it has missed the brief. Density is the point.

## Migration status

- [x] Foundation — tokens, theme mirror, isolation contract
- [x] Shell — sidebar (collapsible rail) + topbar + scope switcher
- [x] Dashboard — the **Operator Terminal** (live cockpit), owner-gated, wired
  to analytics / insights / KDS-fleet / labour / orders / notifications +
  the configurable daily-goal setting (`/api/admin/ops-goals`)
- [x] Orders (`/admin-v3/orders`) — live Kanban + table + detail dialog over
  the real SSE order stream (`useAdminOrdersStream`); status advances via
  `PUT /api/admin/orders`, staff+
- [x] Inventory (`/admin-v3/inventory`) — stock table (value / low-out / 7d
  waste KPIs, status chips) + movements view + edit dialog (par/reorder/on-hand
  via `PUT /api/admin/stock`, log receive/waste/adjust via
  `POST /api/admin/stock-movements`). Aggregates across trucks when scope = all
- [x] Menu (`/admin-v3/menu`) — chain-wide product board, **one row per dish**
  (deduped by `getBaseSlug`, rule #10): price shown as a range + "varies" badge
  when sites diverge, margin, availability. Edit dialog edits chain-wide
  metadata (name/description/category — propagated to every site) + per-site
  price/cost/availability via `PUT /api/admin/menu`. (Modifier editor +
  add/clone/delete deferred.)
- [x] Recipes (`/admin-v3/recipes`) — chain-wide formula board, **one recipe
  per dish** (keyed by base slug, rule #10): recipe status, food cost +
  cost-% (vs avg price). Editor edits the formula (ingredient lines from the
  shared catalog + qty + waste% + yield) with a live cost estimate; saves once
  chain-wide via `POST /api/admin/recipes`, deletes via `DELETE`. (Ingredient
  catalog / distributor offerings / nutrition manager deferred.)
- [x] HACCP log (`/admin-v3/haccp`) — per-location temperature checks with
  live in/out-of-range verdict (`@/lib/haccp`); record + today's log table
- [x] Waste log (`/admin-v3/waste`) — reason-coded write-offs; record + today's
  entries + write-off cost KPI (`POST /api/admin/waste`)
- [x] Shift handover (`/admin-v3/handover`) — end-of-shift sign-off (shift, cash
  counted → variance, temp/waste/equipment checks, managers, comment) + the
  week's log (`POST /api/admin/handover`)
- [ ] Suppliers/POs, People, Customers, Finance, Growth, Intelligence, System
- [ ] Parity reached → flip `/admin` to v3, delete v2, register in `/admin/capabilities`
