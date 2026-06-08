# Core v2 — Modules

Per-surface anatomy for the four surfaces the truck runs on. Each lands
(and its doc fills in) as the surface is ported.

| Surface | Route | Status | Doc |
| --- | --- | --- | --- |
| **POS** | `/core-v2/pos` | Scaffold — real menu + rail live; ticket/Charge next | [`pos.md`](./pos.md) |
| **KDS** | `/core-v2/kds` | Scaffold — shell + subbar live (Step 4) | [`kds.md`](./kds.md) |
| **Guest** | `/core-v2/guest` | Scaffold — shell + subbar live (Step 5) | [`guest.md`](./guest.md) |
| **Service** | `/core-v2/service` | Scaffold — shell + subbar live (Step 6) | [`service.md`](./service.md) |

All four share the one chrome — `CoreV2Shell` (`src/core-v2/shell/`),
documented in [`../theme/README.md`](../theme/README.md#components-class-reference).

The surface switcher (`CoreV2Nav`) and global actions (location chip,
clock, theme toggle) are shell-level and identical across surfaces. A
surface owns only its **subbar controls** (`subRight`) and its **body**.
