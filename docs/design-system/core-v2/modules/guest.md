# Core v2 · Guest

The guest engagement hub. `/core-v2/guest`.

- **Routes:** five nested views under `/core-v2/guest/*`; the bare hub
  redirects to **Inbox**. The view switcher is `guestTabs(active)`
  (`src/core-v2/guest/guestTabs.ts`) on the CoreV2Shell subbar.
- **Status:** **Inbox wired** (Step 5a). Guests · Loyalty · Concierge ·
  Book render the shell + scaffold panel (their tabs live) until 5b–5e.

## Inbox (`/core-v2/guest/inbox`) — wired

- **Live code:** `src/core-v2/guest/CoreV2Inbox.tsx`.
- **Theme:** `.cv-guest-inbox` / `.cv-kpi-strip` / `.cv-inbox` (3-pane:
  `.cv-convs` · `.cv-thread` · `.cv-ctx`) in `themes/core-v2/index.css`.
- **Layout:** a 5-up KPI strip over the 3-pane console — conversation list
  (`.cv-conv` rows with avatar, LIVE/PAY badges, search + inbox/live/
  awaiting/archived filters) · thread (`.cv-bub` bubbles toned by actor:
  customer/operator/bot/system) + composer · context (`.cv-ctx`: live
  cart + guest rollup + tier).
- **Engine + API** — same as today's `/core/guest/whatsapp`:
  `GET /api/admin/whatsapp/{sessions,transcripts,flags,metrics}` (10s
  poll), `GET …/transcripts/{phone}` (6s on select),
  `GET /api/admin/customers/{phone}` for the rollup; **send** =
  `POST …/sessions/{phone}/message {body}`; **archive/pin** =
  `POST …/flags {phone, archived?, pinned?}`. `mergeConversations` folds
  active sessions over transcript heads.

## Guests · CRM (`/core-v2/guest/guests`) — wired

`src/core-v2/guest/CoreV2Crm.tsx`. Roster (`.cv-tbl`) with a 4-up KPI strip, search + segment chips (All/VIP/Members/Active/Repeat/New/Lapsed) + sort (value/recency/orders/points/name), an RFM-derived **Health** pill, and a profile drawer (`CoreV2Dialog`): stat grid, SMS/email **consent** toggles + GDPR export, recent-orders timeline, **points** adjust, and **notes** (add/delete). Engine: `GET /api/admin/crm`, `customer-notes` (GET/POST/DELETE), `members/points` (POST), `customers/{phone}/consent` (PATCH). `health`/`rfm`/`inSeg` mirror the live classification.

## Loyalty (`/core-v2/guest/loyalty`) — wired

`src/core-v2/guest/CoreV2Loyalty.tsx`. Four tabs (Members · Wallets · Redemptions · Win-back) over a KPI strip. Members table (tier badges Bronze→Platinum, tier filter + search + sort; row → points-adjust dialog). Wallets cards (dissolve). Redemptions log. Win-back pulls the retention queue (per-candidate Send + Send-all). Engine: `GET /api/admin/{members,wallets,wallet-redemptions,retention}`; `members/points` POST; `wallets` DELETE; `retention` POST (single / `{mode:"all"}`).

## Concierge (`/core-v2/guest/concierge`) — wired

`src/core-v2/guest/CoreV2Concierge.tsx` (+ a server page that builds the meta / per-location samples / allergen matrix, like today's). A two-pane inspector: the six MCP capabilities with live exposure toggles (`.cv-toggle`, PATCH `/api/admin/concierge`) · the selected capability's real sample JSON + a Test link to `/api/agent/{cap}` + the EU-14 allergen matrix per location (`.cv-matrix`).

## Planned anatomy (5e)

- **Book** — slot + table in one move (shared with Service).

Parity target: today's `/core/guest`. Classes documented here when ported.
