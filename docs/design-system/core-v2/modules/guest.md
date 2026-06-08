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

## Planned anatomy (5b–5e)

- **Guests** — the customer book (CRM): roster + filters + profile drawer
  (LTV, points, timeline). `GET /api/admin/crm`.
- **Loyalty** — members (Bronze → Platinum), wallets, redemptions,
  win-back. `GET /api/admin/{members,wallets,wallet-redemptions}`.
- **Concierge** — MCP capability inspector + EU-14 allergen matrix.
  `GET/PATCH /api/admin/concierge`.
- **Book** — slot + table in one move (shared with Service).

Parity target: today's `/core/guest`. Classes documented here when ported.
