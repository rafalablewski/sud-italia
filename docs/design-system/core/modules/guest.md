# Core · Guest

The guest engagement hub. `/core/guest`.

- **Routes:** five nested views under `/core/guest/*`; the bare hub
  redirects to **Inbox**. The view switcher is `guestTabs(active)`
  (`src/core/guest/guestTabs.ts`) on the CoreShell subbar.
- **Filter glyphs:** `src/core/guest/glyphs.tsx` — `GuestGlyph`, Core's
  own 24-grid line icons (no lucide) for the compact **glyph-only** filter
  bars across the guest surfaces (Inbox header actions + conversation
  filters, the Loyalty bar, the CRM bar). The shared bar shell is
  `.core-gfilters` (one row, every control a uniform 34px, search flex-grows);
  pods are `.core-seg.icons`. Every glyph button keeps its label as
  `title` + `aria-label` + `aria-pressed`.
- **Status:** **Inbox wired** (Step 5a). Guests · Loyalty · Concierge ·
  Book render the shell + scaffold panel (their tabs live) until 5b–5e.

## Inbox (`/core/guest/inbox`) — wired

- **Live code:** `src/core/guest/CoreInbox.tsx`.
- **Theme:** `.core-guest-inbox` / `.core-kpi-strip` / `.core-inbox` (3-pane:
  `.core-convs` · `.core-thread` · `.core-ctx`) in `themes/core/index.css`.
- **Layout:** a 5-up KPI strip over the 3-pane console — conversation list
  (`.core-conv` rows with avatar, LIVE/PAY badges; the list header is a
  `.core-convs-h.core-gfilters` unified bar — a search field with a leading
  magnifier glyph that flex-grows, then a **glyph-only `.core-seg.icons`**
  status filter: inbox=tray · live=signal · awaiting=hourglass ·
  archived=box, each tooltip-labelled) · thread (`.core-bub` bubbles toned by actor:
  customer/operator/bot/system, with a `.core-bub-kind` badge on non-text
  kinds — Template / Buttons / List / Link / 📍 Location / Selection —
  grouped under `.core-day-sep` **day separators**; the header carries a
  `.core-window` **24h-window** chip open/closed) + a `.core-quickreplies`
  row of starters (Menu · Payment link
  [injects the live pay URL] · Reservation · Comp dessert) over the
  composer · context (`.core-ctx`: live cart + guest rollup + tier).
  The three subbar actions are **icon-only `.core-iconbtn` glyphs** (funnel ·
  megaphone · sliders, from `./glyphs.tsx`) to keep the header uncluttered —
  each keeps its label as a `title` + `aria-label`.
- **Funnel:** a subbar **funnel** glyph button opens a `CoreDialog` with a
  7d/30d/all window switch — `GET /api/admin/whatsapp/funnel?window=` →
  Started/Paid/Conversion/Unique KPIs over per-stage `.core-funnel-stage`
  bars (count · % of start · drop-from-previous).
- **Broadcast:** a subbar **broadcast** glyph button opens `WaBroadcastDialog`
  (`GET /api/admin/whatsapp/broadcasts` → audiences + campaigns) — pick an
  audience snapshot (All / Active / Lapsed / VIP / New, with live counts)
  + a Meta template, `POST` to queue, then **Drive send →** loops
  `POST …/broadcasts/{id}/send` in batches (updating the `.core-bc` progress
  bar) until the campaign hits a terminal status.
- **Settings:** a subbar **settings** glyph button opens `WaSettingsDialog`
  (`.core-wa-settings`) — bot enable, welcome message, AI toggle +
  instructions, away message, daily cap, auto-archive, re-open template,
  opt-out phrases, **keyword auto-replies** (add/remove), **business
  hours** (per-day open/close/closed), **abandoned-cart** recovery, and a
  **scripted-flows** builder (`.core-wa-flows` — name/trigger/enable per
  flow + ordered step prompts, add/remove). Loads
  `GET /api/admin/whatsapp/settings`, writes the whole edited object back
  via `PATCH` (preserving `defaultLocation`).
- **Engine + API** — the WhatsApp engine + API:
  `GET /api/admin/whatsapp/{sessions,transcripts,flags,metrics,funnel}`
  (visibility-aware 10s `usePolling`), `GET …/transcripts/{phone}` (6s on
  select, skipped while a reply is sending),
  `GET /api/admin/customers/{phone}` for the rollup; **send** =
  `POST …/sessions/{phone}/message {body}` (the reply bubble appears
  optimistically and reconciles via the thread refetch; rolls back on
  failure); **archive/pin** = `POST …/flags {phone, archived?, pinned?}`.
  `mergeConversations` folds active sessions over transcript heads.

## Guests · CRM (`/core/guest/guests`) — wired

`src/core/guest/CoreCrm.tsx`. Headed by a `.core-crumb` breadcrumb + `.core-sectionhead`, then a **6-up `.core-statstrip`** — **guests · VIPs · new · at-risk · avg spend · repeat rate** (all derived from the live book: at-risk = RFM health < 34, repeat = 2+ orders; coloured values + mono deltas, Rule #1). Roster (`.core-tbl`) sits under **one unified, fully glyph-only filter bar** (`.core-gfilters`, every control the same 34px height, glyphs from `./glyphs.tsx`, labels kept as `title` + `aria-label` + `aria-pressed`): a flex-growing **search** (magnifier glyph) then four `.core-seg.icons` pods — **segment** (All=people · VIP=crown · Members=badge · Active=pulse · Repeat=repeat · New=sparkle · Lapsed=user-x), **channel** (All=asterisk + per-channel: dine-in=utensils · takeaway=cup · delivery=truck · WhatsApp=chat · web=globe, via `chanGlyph`), **recency/seen** (Any=∞ · 24h=clock · 7d=week-calendar · 30d=month-calendar), and **sort** (value=coins · recency=clock · orders=bag · points=star · name=A–Z) — an RFM-derived **Health** pill, and a profile drawer (`CoreDialog`): stat grid, SMS/email **consent** toggles, **GDPR export** + **Erase** (Art. 17 right-to-erasure via a confirm dialog), recent-orders timeline, **points** adjust, and **notes** (add/delete). Engine: `GET /api/admin/crm`, `customer-notes` (GET/POST/DELETE), `members/points` (POST), `customers/{phone}/consent` (PATCH), `gdpr/export` (GET) + `gdpr/delete` (POST `{ phone, confirm }`); ad-hoc **SMS/email** = `POST /api/admin/customers/{phone}/send` (consent-gated). `health`/`rfm`/`inSeg` mirror the live classification.

## Loyalty (`/core/guest/loyalty`) — wired

`src/core/guest/CoreLoyalty.tsx`. **One unified, fully glyph-only filter bar** (`.core-gfilters`) under the KPI strip — every control the same 34px height, all glyphs from `./glyphs.tsx`, each keeping its label as `title` + `aria-label` + `aria-pressed`. Left→right: the **view switcher** (`.core-seg.icons` — Members · Wallets · Redemptions · Win-back); then, on the Members tab, a **search** field (leading magnifier glyph) that **flex-grows to fill the bar**, a **tier filter** (`.core-tierseg` — "All" = layer-stack glyph, each tier a gem **tinted by its metal**: platinum/gold/silver/bronze, selected gets a ring in its own colour), and the **sort** pod (Points = star · Spent = banknote · Orders = bag · Name = A–Z). The growing search is what keeps it a single tidy row at any width (it wraps gracefully on the narrowest). Over a KPI strip (the **Points out** card carries a `.core-kpi-sub` ≈zł **liability** line, 100 pts = 1 zł). Members table (tier badges Bronze→Platinum, tier filter + search + sort; row → points-adjust dialog; a `◆` action opens the **customer-intelligence** modal — `GET /api/admin/customer-intelligence?phone=` → next-order headline + confidence, churn-risk + reason, cadence, channel-mix bars, favourite dishes, attach patterns). Wallets cards (dissolve). Redemptions log. Win-back pulls the retention queue (per-candidate Send + Send-all **behind a confirm dialog**). Engine: `GET /api/admin/{members,wallets,wallet-redemptions,retention,customer-intelligence}`; `members/points` POST; `wallets` DELETE; `retention` POST (single / `{mode:"all"}`).

## Concierge (`/core/guest/concierge`) — wired

`src/core/guest/CoreConcierge.tsx` (+ a server page that builds the meta / per-location samples / allergen matrix + a `waConfigured` flag from the WhatsApp env, like today's). A two-pane inspector: the six MCP capabilities with live exposure toggles (`.core-toggle`, PATCH `/api/admin/concierge`) · then the selected capability's **transports** panel (`.core-transport` — the MCP/HTTP read API, always Live; WhatsApp Business `/api/whatsapp/webhook`, *Connected ↗* to the inbox when `waConfigured` else *Needs config*) · a **live probe** (`▶ Test live` hits `/api/agent/{cap}` for real, times it, shows an HTTP-status `.core-tbadge2` + the response JSON in place of the static sample) · the EU-14 allergen matrix per location (`.core-matrix`, with a legend noting the agent reads — never guesses — allergens). The inspected location follows the **shell's global location switcher** (`CoreLocationChip`, `useLocation()`) — there is **no** page-local location switch; on "All restaurants" it falls back to the first concrete location.

## Book (`/core/guest/book`) — wired

`src/core/guest/CoreBook.tsx` (shared with Service). Tops the lens with a
**timeline-over-tables grid** (`.core-book-timeline` — tables as rows,
11:00–23:00 as columns): reservation **blocks** are positioned by time/duration,
**overlaps hatch red** live (`.core-tl-block.conflict`, one
`findReservationConflicts` pass per booking), and a block **drags to another
table row to reassign** (HTML5 drag → the reservations `POST` upsert with
`override`, so the conflict check re-runs on the result). Below: pick a dine-in
slot (`.core-pk`) + party size, then a table — live fit/conflict (booked/too-small
tables dim) with a ✨ Recommend that fits party to seats — capture the guest, and
confirm. Today's bookings on the right with cancel. Engine: `GET
/api/admin/{slots,floor/tables,floor/reservations}`; create `POST
/api/admin/booking`; reassign/cancel via `POST` / `DELETE /api/admin/floor/reservations`.

The whole Guest hub is wired to the live engine.
