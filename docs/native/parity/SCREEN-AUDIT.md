# OttavianoKDS — Screen-by-Screen Parity Audit

> **Scope & method.** This audits the **operator** app's screens against their web
> counterparts. The native app can't be screenshotted from the backend container
> (SwiftUI is macOS-only), so this is a *source-level* audit: each native screen
> read against the web route it mirrors, the `/api/v1` endpoint it consumes, and
> the design-system contract. The structural IA parity (which surfaces exist, role
> gates) is already machine-verified — see `PARITY-LEDGER.md` (54 surfaces, 52
> live, 2 scaffold). This doc covers what the ledger can't: *does each screen
> render the right thing, the DS way?* Action items are concrete and grouped at
> the end. Web-behaviour claims I haven't verified against the running web app are
> marked **(confirm vs web)** rather than asserted.

Legend: ✅ at parity · 🟡 functional, gaps noted · 🔧 design-system adoption owed · 🏗 scaffold by design.

---

## High-traffic surfaces (deep dive)

### KDS — Kitchen Display (`/core/kds` · `KDSBoardView.swift`) 🟡🔧→✅
- **Native today:** two lanes (Cooking / Ready), each a `DSSectionHeader` + count
  `DSBadge`, tickets via the new **`KDSTicket`** (age timer fresh→cooking→late,
  bump-forward over the live SSE/PATCH path), a connection dot in the toolbar,
  `DSEmptyState` per empty lane. Now fully on the design system.
- **Parity verdict:** the core loop (see live tickets, bump to advance) is at
  parity and the ticket aging is arguably *ahead* of a plain web board.
- **Gaps:** ticket supports **forward bump only** — no **recall** (Ready→Cooking)
  and no **course/seat grouping** **(confirm vs web)**. Lanes are fixed to two;
  if the web exposes an "All-day"/expo view that's not mirrored **(confirm vs web)**.

### POS — Till (`/core/pos` · `OperatorPOSView.swift`) 🟡
- **Native today:** category-sectioned live menu (`/api/v1/admin/menu`), tap to
  build a ticket, ticket bar with line count + server total, `ChargeSheet` with
  guest capture (name/phone/table) and a **Payment** step — Card or **Cash via the
  new `POSKeypad`** (digit-shift entry, quick-cash, change-due). Server-priced
  through `POST /api/v1/admin/pos/order`; success screen shows the order id.
- **Gaps:** the nav blurb promises **"split bills"** — not implemented; the cash
  amount is a till aid (change calc) and isn't persisted to the order **(by design;
  total is server-authoritative)**. Table is a free-text field, **no floor-map
  picker** (Service surface owns the map). Menu rows + ticket bar still use raw
  `.font` — see 🔧 below.

### Orders board (`/admin/orders` · `OperatorBoardView.swift`) 🟡🔧
- **Native today:** summary stat trio + four status sections (Incoming/Cooking/
  Ready/Done) off `GET /api/v1/orders`, read-and-refresh, rows via
  `OperatorOrderRow`. Empty/error states handled.
- **Gaps:** the nav blurb promises **"filter, inspect, refund, recall"** — the
  native board is **read-only** (no filter bar, no order detail/inspect, no refund
  action) **(confirm scope vs web)**. Bump lives only on the KDS lanes. Stat cards
  use raw `.font(.system(size: 30))` — 🔧.

### Dashboard (`/admin` · `OperatorDashboardView.swift`) 🟡🔧
- **Native today:** six KPI tiles (live/cooking/ready/completed counts + board
  revenue + avg ticket) computed from `GET /api/v1/orders`, plus a "Latest orders"
  list. Genuinely live (Rule #1).
- **Gaps:** tiles are hand-rolled (`VStack` + `.font(.system(size: 30))` +
  manual border) instead of **`MetricTile`** — the most visible 🔧. No trend/delta
  (MetricTile supports it). Web dashboard widgets beyond these six **(confirm vs web)**.

---

## Remaining live surfaces (48) — characterization

The other live operator surfaces (Reports, Customers, Staff, Suppliers, Feedback,
Inventory, Purchase orders, Recipes, Menu, Guest, Service, Cash, Calculator, Ops
Agent, Agent HQ, Users, Audit log, Compliance, …) render real `/api/v1/admin/*`
data through the shared list/detail loaders (`OperatorListLoader`,
`OperatorScreens*.swift`) and the dedicated views (`OperatorReportsView`,
`OperatorCalculatorView`, `OperatorAgentView`, `OperatorAgentHQView`,
`OperatorPOSView`). Per the ledger these are **data-backed**, so the audit
priority for them is **design-system adoption + interaction depth** (filters,
detail, write actions) rather than "is it wired" — tracked as the 🔧 sweep below.
A per-surface deep dive is out of scope for this pass; the four above are the
revenue-critical ones and set the pattern.

## Scaffolds (2) 🏗 — intentional
`/admin/soc2` and `/admin/capabilities` render `OperatorSurfaceView` (purpose +
honest "pending /api/v1" status). Both are hardcoded TSX content pages on the web
with no store/data source; mirroring them in Swift would duplicate a Rule #9/#11
source of truth and drift. **Leave as scaffolds** until they get a real endpoint.

---

## Action items

### A. Design-system adoption (🔧 — highest leverage, low risk)
The DS now has the components these screens predate. Migrating removes the last
raw-`.font(.system(size:))` sites, which **violate DS rule #1 (Dynamic Type)** —
fixed sizes don't scale for low-vision staff.
1. **Dashboard** `OperatorDashboardView.tile`/`tileMoney` → **`MetricTile`** (gets
   Dynamic Type, optional deltas, `DSCard` elevation for free).
2. **Orders board** `OperatorBoardView.stat` → `MetricTile`; section headers →
   `DSSectionHeader` + `DSBadge`.
3. **POS** `padRow` / `ticketBar` → `.textRole(...)` + `DSCard`; success screen
   `.font(.system(size: 56))` → `.textRole(.displayXL)`.
4. Replace direct `RoundedRectangle(cornerRadius: theme.cornerRadius)` card
   constructions with **`DSCard`** across the Operator screens (grep
   `surface2, in: RoundedRectangle`).
5. Direct `ContentUnavailableView` → **`DSEmptyState`** for one empty-state voice.

### B. Interaction depth (🟡 — confirm scope with product first)
6. KDS: add **recall** (Ready→Cooking) to `KDSTicket`/`KDSStore`.
7. Orders board: **filter bar + order detail/inspect**; surface **refund/recall**
   if the web exposes them.
8. POS: **split-bill** flow (the nav blurb advertises it).

### C. Verify against the running web app
9. Walk KDS, POS, Orders, Dashboard side-by-side with the web (`npm run dev` →
   `/core/*`, `/admin`) and resolve every **(confirm vs web)** above into either
   "matches" or a tracked gap. This is the only step that needs both apps running
   and is the natural next milestone once a Mac/simulator is in the loop.
