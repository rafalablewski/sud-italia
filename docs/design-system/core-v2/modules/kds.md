# Core v2 · KDS

The kitchen wall. `/core-v2/kds`.

- **Live code:** `src/app/core-v2/kds/page.tsx` (scaffold via
  `ScaffoldSurface`, `bleed`).
- **Status:** **Scaffold (Step 4 pending).** Shell + subbar live (Fleet ·
  Floor · Chef tabs); body is the scaffold panel.

## Planned anatomy

An **always-dark wall** (overrides the theme tokens regardless of
`data-theme`) under the light command bar; fullscreen kiosk drops the
chrome for the bare wall. Three views:

- **Fleet** — every truck at a glance: KPI band + per-truck health.
- **Floor** — the expo board: a 6-up KPI strip + three lanes
  (**New → Firing → Ready·Expo**) with SLA-tier colouring, station
  grouping, cook-time meters, and one-tap **bump**.
- **Chef** — a station-filtered, oversized make-queue.

Parity target: today's `/core/kds`. Classes documented here when ported.
