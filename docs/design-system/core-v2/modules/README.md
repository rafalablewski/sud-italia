# Core v2 — Modules

Per-surface anatomy for the four surfaces the truck runs on — **all wired**.
POS · KDS · Guest · Service are live on the new theme.

| Surface | Route | Status | Doc |
| --- | --- | --- | --- |
| **POS** | `/core-v2/pos` | **Wired** — multi-tab checks, coursing, combos, Charge→Tender | [`pos.md`](./pos.md) |
| **KDS** | `/core-v2/kds` | **Wired** — Floor lanes + Chef + Fleet, live stream + bump | [`kds.md`](./kds.md) |
| **Guest** | `/core-v2/guest` | **Fully wired** — Inbox · CRM · Loyalty · Concierge · Book | [`guest.md`](./guest.md) |
| **Service** | `/core-v2/service` | **Wired** — Floor (live room) + Slots (capacity + Demand Exchange) | [`service.md`](./service.md) |

All four share the one chrome — `CoreV2Shell` (`src/core-v2/shell/`),
documented in [`../theme/README.md`](../theme/README.md#components-class-reference).

The surface switcher (`CoreV2Nav`) and global actions (location chip,
clock, theme toggle) are shell-level and identical across surfaces. A
surface owns only its **subbar controls** (`subRight`) and its **body**.
