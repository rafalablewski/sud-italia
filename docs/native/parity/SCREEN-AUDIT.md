# OttavianoKDS — Screen-by-Screen Parity Audit

> **Scope & method.** Audits the **operator** app's screens against their web
> counterparts. The native app can't be screenshotted from the backend container
> (SwiftUI is macOS-only), so this is a *source-level* audit: each native screen
> read against the web route it mirrors, the `/api/v1` endpoint it consumes, and
> the design-system contract. Structural IA parity is machine-verified in
> `PARITY-LEDGER.md` (54 surfaces, 52 live, 2 scaffold); this doc covers *does each
> screen render the right thing, the DS way?*
>
> **The web facts below are now resolved** against the canonical Core source
> (`src/core/kds`, `src/core/orders`, `src/core/pos`) — no more "(confirm vs web)"
> guesses. Where native can't match yet, the reason is the `/api/v1` facade
> (missing endpoint or DTO field), called out honestly rather than faked (Rule #1).

Legend: ✅ at parity · 🟡 functional, gaps noted (reason given) · 🏗 scaffold by design.

---

## High-traffic surfaces (deep dive)

### KDS — Kitchen Display (`/core/kds` · `KDSBoardView.swift`) ✅🟡
- **Web (resolved):** three columns — **New** (confirmed) → **Firing** (preparing)
  → **Ready·Expo** (ready); station filters (all/pizza/pasta/…); forward bump
  (`nextStatus`); a **recall** of the *last completed* ticket within 10 min
  (`POST /api/admin/orders/[id]/recall`); predictive at-risk tone tiers.
- **Native now:** **three lanes** (New / Firing / Ready) — brought to 1:1 with the
  web columns this pass (`KDSStore.incoming/cooking/ready`) — each a
  `DSSectionHeader` + count `DSBadge`, tickets via **`KDSTicket`** (age timer
  fresh→cooking→late), forward bump over SSE/PATCH, per-lane `DSEmptyState`.
- **Deferred (facade-gated):** **station filter** needs `category` on the Order
  line DTO (not in `/api/v1` yet); **recall** needs the v1 facade to expose the
  recall transition (web uses a non-v1 `/api/admin` route). Both noted, not faked.

### POS — Till (`/core/pos` · `OperatorPOSView.swift`) 🟡
- **Web (resolved):** open **tabs**, category **coursing** (fire course-by-course),
  combo discount + cross-sell, Send-to-KDS / Fire-course / Charge. **No split-bill**
  (the nav blurb overstates; the web does coursing, not bill-splitting).
- **Native now:** single-ticket counter sale off the live menu → `ChargeSheet`
  with guest capture + a **Card/Cash** payment step (**`POSKeypad`** cash tender
  with change-due; total stays server-priced via `POST /api/v1/admin/pos/order`).
- **Deferred (facade-gated):** **tabs** (`/api/admin/pos/tabs`), **coursing**
  (`fire-course`), and **combo/cross-sell** all need their `/api/v1` endpoints.
  These are the real POS gaps — *not* split-bill.

### Orders board (`/admin`,`/core/orders` · `OperatorBoardView.swift`) ✅🟡
- **Web (resolved):** scope tabs (current/paid/all) + channel filter + **search**
  (id/guest/phone/table), KPI strip, a **detail dialog** (inspect the full ticket)
  with **Mark paid** (settle) + **Print receipt**. **No "refund"** (the earlier
  audit note was wrong — it's settle + print).
- **Native now:** KPI trio via **`MetricTile`**, a **search field + Current/All
  scope** toggle (`shown` filter), `DSSectionHeader` sections, and **tappable rows
  → read-only order detail sheet** (the inspect path) — added this pass.
- **Deferred (facade-gated):** **channel + paid** filters need `channel`/`paidAt`
  on the Order DTO; **Mark paid** + **Print receipt** need the v1 settle/print
  endpoints. The detail sheet says so in-line rather than showing dead buttons.

### Dashboard (`/admin` · `OperatorDashboardView.swift`) ✅
- **Native now:** six KPIs via **`MetricTile`** (status-tinted icons), "Latest
  orders" under a `DSSectionHeader`, live off `GET /api/v1/orders`. Migrated off
  the hand-rolled fixed-size tiles this pass.

---

## Design-system adoption — done this pass

Every **fixed-size text** site (`.font(.system(size:))` on `Text`/`MoneyText`) —
a **DS rule #1 (Dynamic Type) violation** — is gone from the operator + customer
features. Migrated: Dashboard + Orders KPIs → `MetricTile`; Reports / Agent HQ /
Calculator metric values + the Rewards loyalty-points hero → `.textRole(…)`. The
only remaining `.system(size:)` calls are **SF Symbol images** (icons), which are
legitimately fixed-size. Verified by grep in CI-adjacent review.

## Remaining live surfaces (48)

Render real `/api/v1/admin/*` data through the shared loaders
(`OperatorListLoader`, `OperatorScreens*.swift`) + dedicated views. Now DS-clean
on typography. Remaining work is **interaction depth** (filters/detail/write
actions) per surface, which is facade-gated — tracked as the waves land.

## Scaffolds (2) 🏗 — intentional
`/admin/soc2` and `/admin/capabilities` render `OperatorSurfaceView` (purpose +
honest "pending /api/v1" status). Hardcoded TSX content pages on the web with no
data source; mirroring them would duplicate a Rule #9/#11 source of truth. Leave.

---

## Action items (updated)

- ✅ **DS adoption sweep** — done (no fixed-size text remains; KPIs on `MetricTile`).
- ✅ **KDS 3-lane parity** — done (New/Firing/Ready).
- ✅ **Orders search + scope + inspect** — done (read path).
- ⏳ **Facade-gated** (need `/api/v1` work, then native is a small UI add):
  - KDS **recall** transition + ticket-line **`category`** (station filter).
  - Orders **channel/paidAt** DTO fields + **settle/print** endpoints.
  - POS **tabs**, **coursing**, **combo/cross-sell** endpoints.
- ⏳ **Verify on-device** — the one step needing both apps running: walk KDS, POS,
  Orders, Dashboard side-by-side on a simulator vs `npm run dev` once a Mac is in
  the loop. Everything resolvable from source is resolved above.
