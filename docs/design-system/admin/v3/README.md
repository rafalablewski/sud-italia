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
`Table` (compact, sticky header, right-aligned numerics). The set grows as
pages migrate.

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
- [x] Dashboard — wired to the live analytics / insights / orders / labour APIs
- [ ] Operations, Inventory, People, Customers, Finance, Growth, Intelligence, System
- [ ] Parity reached → flip `/admin` to v3, delete v2, register in `/admin/capabilities`
