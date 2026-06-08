# Core v2 · Service

The merged Floor + Slots surface. `/core-v2/service`.

- **Live code:** `src/app/core-v2/service/page.tsx` (scaffold via
  `ScaffoldSurface`).
- **Status:** **Scaffold (Step 6 pending).** Shell + subbar live (Floor ·
  Slots tabs); body is the scaffold panel.

## Planned anatomy

- **Floor** — the live room: zoned table tiles (**seated / booked /
  free**) with covers, turn time, and per-table state; a capacity KPI
  strip.
- **Slots** — tonight's capacity fill bar + the slot list with demand
  **surge** flags.

Parity target: today's `/core/service`. Classes documented here when
ported.
