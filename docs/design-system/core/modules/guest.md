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
- **Status:** **Inbox wired** (Step 5a). Guests · Loyalty · Concierge
  render the shell + scaffold panel (their tabs live) until 5b–5e.
  (Book is no longer a Guest view — it moved to **Service**.)

## Inbox (`/core/guest/inbox`) — wired

- **Live code:** `src/core/guest/CoreInbox.tsx`.
- **Theme:** `.core-crumb` · `.core-sectionhead` · `.core-statstrip` ·
  `.core-guest-inbox` / `.core-inbox` (3-pane: `.core-convs` · `.core-thread`
  · `.core-ctx`) in `themes/core/index.css`.
- **Layout:** dense-console (mockup 07-guest-inbox) — a `.core-crumb`
  breadcrumb + `.core-sectionhead`, then a **5-up `.core-statstrip`** (open
  convos · awaiting reply · live · conversion · paid 7d — all from live
  WhatsApp metrics, Rule #1; coloured values + deltas) over the 3-pane console
  — conversation list
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

`src/core/guest/CoreCrm.tsx`. Rendered in the **dense-console** language (1:1 with `tests/sketches/core-pages/08-guest-crm.html`): a `.core-crumb` breadcrumb + `.core-sectionhead`, then a **6-up `.core-statstrip`** — **guests · VIPs · new · at-risk · avg spend · repeat rate** (all derived from the live book: at-risk = RFM health < 34, repeat = 2+ orders; coloured values + mono deltas, Rule #1).
- **Filter bar** (`.core-crm-filterbar`): a `.core-crm-search`, **labelled segment chips** `.core-segchips` with live counts (All · VIP · Regular · New · At-risk — see `inSeg`/`segCounts`), **loyalty-tier gems** `.core-gems`/`.core-gemchip` (Bronze · Silver · Gold · Platinum, toggling `tierF` via `gemClass`), a **sort** `.core-seg` (recent · spend · visits → `recent`/`ltv`/`orders`), and refresh.
- **Roster** (`.core-crm-grid` → `.core-roster` table): **Guest** (`.core-g-av` tier-tinted avatar + `.core-g-nm`/`.core-g-meta`) · **Phone** · **Visits** · **Last seen** · **Spend** · **Tier** (`.core-gem` + label) · **RFM health** (`.core-rfm` bar `hi`/`mid`/`lo` + score). The selected row highlights via `tr.sel`.
- **Persistent profile panel** (`.core-drawer`, replaces the old dialog — the grid drops to one column and the panel hides only when the book is empty; otherwise the **top visible guest is auto-selected on load** so the inspector reads populated by default like the mockup, and it re-homes to the first row whenever the current pick falls out of the active filter/segment — a manual pick always wins): a `.dh` header (avatar + name + tier gem), **Lifetime** `.core-dstat-grid` (visits · spend · avg · points), **Consent** `.core-tog` switches (SMS · Email), a **Recent orders** `.core-dtimeline`, an **Adjust points** `.core-dstepper` + Apply, a **Notes** textarea + Save, and a **Data** section (**GDPR export** + **Erase**, Art. 17 via the confirm `CoreDialog`).
Engine: `GET /api/admin/crm`, `customer-notes` (GET/POST/DELETE), `members/points` (POST), `customers/{phone}/consent` (PATCH), `gdpr/export` (GET) + `gdpr/delete` (POST `{ phone, confirm }`). `health`/`rfm`/`inSeg`/`gemClass` mirror the live classification. (The ad-hoc SMS/email composer moved off the CRM panel to match the mockup; guest messaging lives on the Inbox surface.)

## Loyalty (`/core/guest/loyalty`) — wired

`src/core/guest/CoreLoyalty.tsx`. Headed by a `.core-crumb` breadcrumb + `.core-sectionhead`, then a **6-up `.core-statstrip`** — **members · points outstanding · redemptions · gold+ · avg points · wallets** (all live — Rule #1; the standard 100 pts = 1 zł drives the liability delta). On the **Members** tab the roster sits in a `.core-loy-grid` beside a **right rail** (`.core-loy-rail`): a **Family wallet** `.core-frame` (rendered only when a shared `WalletSummary` exists — combined `spendablePool` + each member's live points) and a **Tier mix** `.core-frame` (`.core-tiermix` bars per tier, metal-tinted, counted from the live roster). **One unified, fully glyph-only filter bar** (`.core-gfilters`) under the strip — every control the same 34px height, all glyphs from `./glyphs.tsx`, each keeping its label as `title` + `aria-label` + `aria-pressed`. Left→right: the **view switcher** (`.core-seg.icons` — Members · Wallets · Redemptions · Win-back); then, on the Members tab, a **search** field (leading magnifier glyph) that **flex-grows to fill the bar**, a **tier filter** (`.core-tierseg` — "All" = layer-stack glyph, each tier a gem **tinted by its metal**: platinum/gold/silver/bronze, selected gets a ring in its own colour), and the **sort** pod (Points = star · Spent = banknote · Orders = bag · Name = A–Z). The growing search is what keeps it a single tidy row at any width (it wraps gracefully on the narrowest). Over a KPI strip (the **Points out** card carries a `.core-kpi-sub` ≈zł **liability** line, 100 pts = 1 zł). Members table — columns **Member · Tier · Points · Visits · Next reward** (+ intel `◆`): the **Next reward** cell (`.core-nextreward`) is a live progress bar toward the cheapest active reward the member hasn't yet reached (from the loyalty settings' reward ladder, passed in via the server page — `Free Dessert 104/120`, Rule #1). Tier badges Bronze→Platinum, tier filter + search + sort; row → points-adjust dialog; a `◆` action opens the **customer-intelligence** modal — `GET /api/admin/customer-intelligence?phone=` → next-order headline + confidence, churn-risk + reason, cadence, channel-mix bars, favourite dishes, attach patterns). Wallets cards (dissolve). Redemptions log. Win-back pulls the retention queue (per-candidate Send + Send-all **behind a confirm dialog**). Engine: `GET /api/admin/{members,wallets,wallet-redemptions,retention,customer-intelligence}`; `members/points` POST; `wallets` DELETE; `retention` POST (single / `{mode:"all"}`).

## Concierge (`/core/guest/concierge`) — wired

`src/core/guest/CoreConcierge.tsx` (+ a server page that builds the meta / per-location samples / allergen matrix + a `waConfigured` flag from the WhatsApp env, like today's). Headed by a `.core-crumb` breadcrumb (`… mcp inspector · N/N live`) + a `.core-sectionhead` (`Guest · Concierge · ai capability server · model-context inspector`), then a **6-up `.core-statstrip`** — **capabilities · live · requests today · avg latency · deflection · errors** — to match the dense-console mockup (10-guest-concierge). Capabilities/live are config; the rest are **real telemetry** from `getAgentCallStats()`: every hit on `/api/agent/[capability]` writes an `AgentCall` (`logAgentCall`, bounded ring buffer), aggregated to today's requests / avg latency / error rate / deflection (served-OK share) + per-capability count · latency (shown as `N req · N ms` on each capability row). The demo seed writes a day of representative calls so the strip isn't empty out of the box (Rule #1 — real records, not fabricated figures). A two-pane inspector: the six MCP capabilities with live exposure toggles (`.core-toggle`, PATCH `/api/admin/concierge`) · then the selected capability's **transports** panel (`.core-transport` — the MCP/HTTP read API, always Live; WhatsApp Business `/api/whatsapp/webhook`, *Connected ↗* to the inbox when `waConfigured` else *Needs config*) · a **live probe** (`▶ Test live` hits `/api/agent/{cap}` for real, times it, shows an HTTP-status `.core-tbadge2` + the response JSON in place of the static sample) · the EU-14 allergen matrix per location (`.core-matrix`, columns = only the allergens present on that menu, `●` per dish, with a legend noting the agent reads — never guesses — allergens). Allergens are **operator-declared** (EU 1169/2011, via the admin Menu editor → the `allergens` field of the menu-override); the demo seed declares the factual set for the classic dishes (`seedAllergens` in `scripts/seed-core-demo.ts`) so the matrix + `get_allergens` tool have real data out of the box. The inspected location follows the **shell's global location switcher** (`CoreLocationChip`, `useLocation()`) — there is **no** page-local location switch; on "All restaurants" it falls back to the first concrete location.

> **Book moved to Service.** The booking timeline (`CoreBook`) is now a
> **Service** view (`/core/service/book`, alongside Floor · Slots · Dispatch) —
> it is no longer a Guest sub-tab. See `service.md` → "Book". The Guest hub's
> views are **Inbox · CRM (Guests) · Loyalty · Concierge**.

The whole Guest hub is wired to the live engine.

## Dense-console 1:1 parity pass (2026-07-02)

Per-surface parity layers live in `src/app/themes/core/parity/{crm,loyalty,concierge,inbox}.css` (imported after the base theme + skin in `src/app/core/layout.tsx`; every rule scoped under `.core`). See `../redesign/PARITY-AUDIT.md`.

- **CRM** — 3rd consent row (WhatsApp); roster/drawer identity reads `segment · location · guest since {firstOrderAt}`; bronze tier gets its own avatar tint; default sort `recent`; GDPR erase block demoted below Notes/Save-profile. (WhatsApp opt-in has no backend flag yet — the toggle renders but persists SMS/Email only.)
- **Loyalty** — labeled sub-tabs with count pills; members table title bar + text tier chips (search relocated there, sort on column headers); tier = gem chip (diamond + UPPERCASE metal), reused in tier-mix; stat strip Members · Points · Redemptions · Gold+(gold) · Breakage(flagged) · Avg points; family wallet uses an SVG glyph + avatar stack + derived household subtitle + `role · Tier` subrows.
- **Concierge** — capability rows render friendly `m.label` + per-id SVG glyph in a two-pane MCP inspector; JSON pane has a green `tools/call`/`resources/read` chip, a basil "Test" pill, and span-based JSON syntax highlighting; the EU-14 matrix now always emits all 14 FIC columns (`buildAllergenMatrix`) with text headers + brand dots / dim `·` cells + a legend footer.
- **Inbox** — context panel gains guest card (avatar + tier + member-since), lifestats grid, itemized live-order + total, and a Next-Best-Action card; conversation list has a title + open-count badge + labeled filter chips; thread supports named-staff/Concierge-bot labels + in-bubble cards; composer has a circular send + attach; left subbar `whatsapp · live` label. (Renders empty until WhatsApp conversations are seeded — 90-min session TTL.)

_(Book's dense-console parity notes moved to `service.md` → "Book" along with the surface.)_
