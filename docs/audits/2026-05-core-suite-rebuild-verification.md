# Core Suite Rebuild — Verification Record

**Date:** 2026-05-31
**Branch:** `claude/modest-dijkstra-UPkK1` (PR #115)
**Scope:** The 1:1 visual rebuild of the Core surfaces onto the
`public/mockups/core-suite/` design — POS, the unified Guest hub
(Inbox · Guests · Concierge) and the KDS (Floor · Fleet · Chef) — plus
the dead-CSS prune, the dark dialog skin, and the mobile-shell fix.

This is a dated snapshot (per the `docs/audits/` convention); it is not
edited retroactively.

## What was verified

Verification ran against `next dev` (production `next build` also green
on every commit) with an authenticated owner session, at the **server /
HTML / served-CSS surface** — the deepest level reachable in this
environment (see constraint below).

### Routing + shell
- `/admin/pos` → renders `.core-suite` + the `<CoreShell>` SI sidebar
  (`brand-mark` = "SI") + topbar; **no `v2-shell`** leak; no SSR error.
- `/admin/guest` (+ `?view=guests` / `?view=concierge`) → `.core-suite`,
  the `.shell` grid, `viewnav`, the `.kpis` strip and the 3-pane
  `.guest` / `.convs` layout all present in the SSR DOM.
- `/admin/kds` → `.kds-core` full-screen surface; no `v2-shell` leak.
- Legacy routes redirect 307: `/admin/crm`→`?view=guests`,
  `/admin/concierge`→`?view=concierge`, `/admin/whatsapp`→`?view=inbox`.
- Unauthenticated `/admin/pos` serves the **login page**, not POS
  content (guard intact).

### Computed-CSS layout invariants (from the served stylesheet)
- `.core-suite` → `position: fixed; inset: 0; z-index: 30;
  background: var(--bg)` — the dark full-screen takeover is real.
- `.core-suite .shell` → `grid-template-columns: 244px 1fr` (sidebar +
  main), matching the mockup.
- `.kds-core` → `position: fixed; inset: 0; z-index: 30; overflow: auto`
  — the full-screen kitchen wall.
- Fonts resolve: `--ui/--display/--mono` map to
  `--font-admin-{body,display,mono}`, and the admin layout wrapper
  carries all three next/font variable classes (Inter / Fraunces /
  JetBrains Mono), so display + mono type render rather than falling
  back to system fonts.

### Dead-CSS prune
- The served theme chunk contains `.kds-core` / `.tk-timer` / `.cstat` /
  `.cmd-head` and **not** `.pos-tabs` — the prune is reflected in the
  actual bundle, not just the source.

### Build / tests
- `next build` succeeds; `npm test` = 119/119 pass — green on every
  commit in the rebuild.

### Functional end-to-end (real data, via the running app's APIs)
Beyond markup, the full POS → KDS chain was exercised against the live
dev server with **real Kraków menu data** (no mocks):
1. `POST /api/admin/pos/tabs` → created a tab.
2. `PUT` set it dine-in + coursed with real items (2× `krk-pizza-
   margherita` + 1× `krk-pizza-diavola`, course `main`); the API echoed
   the coursed line shape back (`course:"main"`, `coursed:true`).
3. `POST /api/admin/pos/orders {tabId, courses:["main"]}` → created a
   real `Order` with `firedCourses:["main"]` (Phase-2 coursing wired).
4. `GET /api/admin/kds/fleet` returned the ticket on the Kraków tile —
   read from the JSON: `[[2,"Margherita"],[1,"Diavola"]]`,
   `status:"confirmed"`, `coursing:{fired:["main"],held:[]}` — i.e.
   `buildKdsTicket` + the coursing hint render off real persistence, not
   fixtures.
5. `PUT /api/admin/orders {status:"preparing"}` (the bump path the
   rebuilt `KdsTk` buttons call) → the fleet feed reflected `preparing`.

The test order lives only in the gitignored dev (filesystem-fallback)
store, so the working tree stayed clean. This is the deepest functional
check reachable without a browser: it proves the rebuilt POS + KDS
render and mutate **real** order data end-to-end, satisfying the "wire
every feature to real data" rule.

## What was NOT verified (constraint)

**No pixel/visual screenshots.** This container has no browser engine,
and the Playwright Chromium CDN is blocked by the network policy
(`403 Host not in allowlist`). So the verification confirms that the
correct components, DOM structure, layout rules and fonts are *live and
served* — but it cannot confirm the final rendered pixels (spacing,
overflow/clipping, scroll behaviour, the dark dialog skin in motion).

**The Vercel preview on PR #115 remains the place for a human pixel
review** of each surface (POS, the three Guest views, the three KDS
lenses, and the dark dialogs) and of the mobile layouts.

## Known, documented deviations (not bugs)

- **Mobile** surfaces (`MobileKDS`, `MobileWhatsApp`, `MobileCustomers`)
  are not on the core-suite design — the mockups are desktop-only, so
  there is no 1:1 mobile target. The mobile shell (bottom nav) is intact.
- **KDS ticket grouping** is by station/category, not the mockup's
  per-course headers (order items don't carry a per-item course); the
  per-station chef filter stays retired. See `core/modules/kds.md`.

## Orphan-class sweep — results (all resolved)

- CRM `ComposeModal` used the pruned `.crm-modal-*` classes (the one
  orphan the rebuild itself introduced) — **fixed** by porting it to the
  dark `v2 Dialog` (`theme="core"`).
- `MobileKDS.tsx` applied `.ka-recall` / `.ka-recall-lab` with **no CSS
  definition** (pre-existing — never had a rule, confirmed against the
  pre-prune `index.css`) — **fixed** with a warning-toned banner rule
  scoped under `.kds-atlas`.
- No orphaned core classes remain (`v2-pos-table*` / `v2-kds-stat*` are
  the admin-namespaced false positives the sweep flags; their CSS lives
  in the admin theme).
