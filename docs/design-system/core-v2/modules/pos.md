# Core v2 · POS

The till. `/core-v2/pos`.

- **Live code:** `src/core-v2/pos/CoreV2Pos.tsx` (client surface) +
  `src/app/core-v2/pos/page.tsx` (server: resolves per-location menu
  snapshots and passes them in).
- **Theme:** `.cv-pos` + `.cv-rail` / `.cv-cat` / `.cv-menu` /
  `.cv-prod` / `.cv-ticket` in `themes/core-v2/index.css`.

## Layout

A three-column grid inside the shell body: **rail · menu · ticket**.

- **`.cv-rail`** — the category rail. `.cv-cat` buttons list only the
  categories present on the active location's menu, each with a live
  item count (`.n`). `.on` = the selected category (filled ink).
- **`.cv-menu` / `.cv-menu-grid`** — auto-fill grid of `.cv-prod` cards.
  Each card is **text-forward** (no photo dependency): `.pn` (display
  name) · `.pd` (description) · `.cv-tagrow` of `.cv-tag` chips
  (veg/vegan → `.veg`, spicy → `.hot`, gluten-free → `.fast`) · `.pf`
  footer with the `.pp` mono price and the burgundy `.add` button.
- **`.cv-ticket`** — the open-check panel. Today it shows
  `.cv-ticket-empty` (the no-open-check state).

## Data

Real, server-resolved. `page.tsx` calls `getMenuWithOverrides(slug)` for
every active location and hands `menusByLocation` to the client. The
surface picks the menu for the location in `LocationContext` (the shell's
location chip), falling back to the first active truck. Prices are in
grosze, formatted to `27,90` (Polish decimal). **No mock data** — the
grid is the live menu (Rule #1).

## Status & what's next

**Scaffold (Step 3).** Live: per-location menu, category rail with
counts, text-forward cards, the empty-ticket state. The card `.add`
button and category switch are wired; the **ticket** is not yet.

Next pass wires the till proper, at parity with today's `/core/pos`:
multi-tab open checks · add-to-ticket · dine-in **coursing** (Fire
course-by-course) · combo + cross-sell offers · capacity-true pace
steering · table assignment + covers · the **Charge → Tender** flow.
Those land here with their `.cv-*` classes documented in the same commit.
