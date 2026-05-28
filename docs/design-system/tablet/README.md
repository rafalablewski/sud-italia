# Tablet — Design System

**Status:** placeholder. Tablet currently falls into the desktop layout
above the mobile breakpoint (~900px in `useIsMobile`). When a tablet-only
pattern ships (counter iPad POS, server handheld, manager floor walk,
etc.) it gets a dedicated doc here.

Until then, tablet inherits:

- **Foundations** ([`../foundations/`](../foundations/)) — color, type,
  material, motion.
- **Admin** ([`../admin/`](../admin/)) — same shell, same glass tokens,
  same portal rule.
- **Mobile** ([`../mobile/`](../mobile/)) — touch-target sizing and
  thumb-zone guidance apply once `useIsMobile` returns true.

## Backlog (when needed)

- `pos-counter.md` — fixed-counter iPad POS, two-hand operation
- `server-handheld.md` — table-side ordering with the same coursing model
- `manager-walk.md` — floor walks with stock counts + temp logs
