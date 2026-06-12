# Core v2 — Modules

Per-surface anatomy for the five surfaces the truck runs on — **all wired**.
POS · KDS · Orders · Guest · Service are live on the new theme.

| Surface | Route | Status | Doc |
| --- | --- | --- | --- |
| **POS** | `/core/pos` | **Wired** — multi-tab checks, coursing, combos, Charge→Tender | [`pos.md`](./pos.md) |
| **KDS** | `/core/kds` | **Wired** — Floor lanes + Chef + Fleet, live stream + bump | [`kds.md`](./kds.md) |
| **Orders** | `/core/orders` | **Wired** — all orders (live & history), filters, Mark paid, Print receipt | [`orders.md`](./orders.md) |
| **Guest** | `/core/guest` | **Fully wired** — Inbox · CRM · Loyalty · Concierge · Book | [`guest.md`](./guest.md) |
| **Service** | `/core/service` | **Wired** — Floor (live room) + Slots (capacity + Demand Exchange) | [`service.md`](./service.md) |

Receipt printing (ESC/POS + browser fallback) is engine-level and shared with
the platform — its Core surface is the Orders detail action; see
[`receipt-printer.md`](./receipt-printer.md).

All five share the one chrome — `CoreShell` (`src/core/shell/`),
documented in [`../theme/README.md`](../theme/README.md#components-class-reference).

The surface switcher (`CoreNav`) and global actions (location chip,
clock, theme toggle) are shell-level and identical across surfaces. A
surface owns only its **subbar controls** (`subRight`) and its **body**.
