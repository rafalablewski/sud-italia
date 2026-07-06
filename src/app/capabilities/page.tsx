import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { adminBaseForRole, withAdminBase, type AdminBase } from "@/lib/admin-base";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { PageHero } from "@/ui";

/**
 * Platform capabilities ledger. Every feature shipped across Phases
 * 0-5, grouped by domain, with:
 *   - live / needs-config / disabled status (introspected from env
 *     + simple runtime checks),
 *   - the URL to actually use it,
 *   - which env vars unblock it when in needs-config.
 *
 * Server component so we can read env vars without leaking them to
 * the client. Refreshes on every page load — capabilities flip from
 * needs-config → live the moment the env update redeploys.
 */

export default async function CapabilitiesPage() {
  const user = await getCurrentAdminUser();
  if (!user) {
    redirect("/login");
  }
  // The ledger's "URL to use it" links are canonical /admin/*; re-root them onto
  // the viewer's own prefix so they're zero-hop (a manager gets /manager/*, a
  // franchisee /franchisee/*) instead of bouncing through AdminShell's
  // convergence redirect. Computed once here, server-side, from the role.
  const base = adminBaseForRole(user.role);

  const env = process.env;
  const has = (...keys: string[]): boolean => keys.every((k) => !!env[k]?.trim());

  const groups: CapabilityGroup[] = [
    {
      id: "core",
      title: "Core platform",
      items: [
        {
          name: "Admin v3 (Operator Terminal) — preview",
          status: "live",
          href: "/admin",
          summary: "Ground-up, density-first rebuild of the admin back-office (isolated under themes/admin-v3 + src/admin-v3 so v2 can be deleted at parity). Live at /admin: the owner-gated Operator Terminal cockpit — revenue→daily-goal hero (real configurable goal via /api/admin/ops-goals, GET/PUT, chain + per-location), live KDS-fleet tiles (cooking/ready/late), the levers that move the goal, a ranked 'what moves it most', kitchen pace + truck status, order-flow, and a live feed/needs-you-now — all wired to real analytics/insights/kds-fleet/labour/orders/notifications endpoints, refetching every 30s. Orders (/admin/orders) is live — a real-time Kanban + table over the SSE order stream with a detail dialog and pipeline status mutations (PUT /api/admin/orders), staff+. Inventory (/admin/inventory) is live — stock table with value/low-out/7d-waste KPIs, status chips, a movements view, and an edit dialog that writes par/reorder/on-hand (PUT /api/admin/stock) and logs receive/waste/adjust movements (POST /api/admin/stock-movements), aggregating across trucks when scope=all. Menu (/admin/menu) is live at full v2 parity — the chain-wide product board (one row per dish deduped by base slug per rule #10; diverging prices shown as a range + 'varies' badge) with multi-select + a sticky bulk toolbar (mark available / 86 / bulk-edit / clone-to-site / reset overrides / delete via POST /api/admin/menu/bulk), a Show-hidden toggle for soft-deleted seed rows, Add-item creating a chain-wide custom SKU on every site (POST /api/admin/menu/custom), and an edit dialog covering product metadata (name/description/category/tags/menu-role), service (delivery-only/packaging), a modifier-group editor, regulatory disclosures (halal/Nutri-Grade/pork/alcohol/allergens) and per-site price/cost/availability/SKU — written via PUT /api/admin/menu, plus per-dish reset/delete. Recipes (/admin/recipes) is live at full v2 parity — a two-tab page: Recipes board (one recipe per dish keyed by base slug per rule #10; food-cost / cost-% / kcal) whose editor shows per-portion KPIs, a cost-breakdown bar, live per-portion macros, missing-kcal/no-distributor line flags, prep time + notes and saves chain-wide via POST /api/admin/recipes (wasteFactor now stored correctly as the 1+waste% multiplier, fixing an under-costing bug); and an Ingredients catalog with add/edit/delete (/api/admin/ingredients) plus a per-ingredient distributor-offerings manager (/api/admin/ingredient-products: add/edit/delete, supplier+SKU+cost+per-unit macros, make-active star via PATCH). Suppliers are read for the picker. The Operations logs are live too: HACCP (/admin/haccp, temperature checks with live verdict), Waste (/admin/waste, reason-coded write-offs + cost), and Shift handover (/admin/handover, cash-variance + checks sign-off) — each a per-location record form + log over its real endpoint. Suppliers (/admin/suppliers, chain-wide CRUD directory) and Purchase orders (/admin/purchase-orders, per-location restock POs with a create dialog + draft→sent→received status flow where receiving auto-credits stock) round out Inventory. People is live: Staff (/admin/staff — directory with clock in/out via /api/admin/time-punches + add/edit/delete) and Schedule (/admin/schedule — this week's shifts grouped by day with add/edit/delete via /api/admin/shifts). Customers (/admin/customers — phone-based directory with repeat/CLV KPIs + search, derived from real orders) and Feedback (/admin/feedback — guest-review board with status flow + AI sentiment analyze) are live. Corporate (/admin/corporate — B2B wallet accounts with bonus/billing editor) and Pulse surveys (/admin/surveys — NPS pulse + survey active toggles) complete the Customers section. Finance is underway: Reports (/admin/reports — range presets, revenue/profit/margin/tips KPIs, category bars, top items, JPK export) and Business costs (/admin/business-costs — expense register with monthly/annualised/payroll KPIs + add/edit/delete) are live; Cash (/admin/cash — till session lifecycle: open float, record sale/drop/payout, expected-drawer, close with counted-cash → variance, session history) is live. The Calculator (AdminSimulation) is the remaining Finance surface; Growth is underway: Scheduled bundles (/admin/scheduled-bundles — standing pre-order approval board) and Events & bookings (/admin/events — events + run-sheets CRUD with a segments editor) are live; Campaigns (/admin/growth — loyalty levers: referral + reward/challenge/seasonal toggles), Cross-sell (/admin/crosssell — full v2 parity: four tabs over the per-location selling config (PUT /api/admin/upsell, full config round-tripped) — Cart pairings (Coffee/Dessert/Side/Drink slots), Combo deals CRUD, Time-of-day windows CRUD, and Menu badges multi-selects with menuRole-intrinsic auto-locks; the Combo deals tab is a Menu/Recipes-style workbench — a reactive KPI rail (active combos / avg discount / item-gated / windows-live-now, with five-section ⓘ explainers), search + Board⇄Table toggle, and a two-column drill-in editor with a live customer-nudge preview + a real-price worked złoty example; the Time-of-day editor gained a live cart-banner preview + showing-now indicator) and Upsell (/admin/upsell — full v2 parity: Bundles tab with a full bundle-ladder editor (composition slots, fixed/dynamic pricing, anchor/decoy/default flags, loyalty/channel/members/scarcity/active-days gating), a bundle-rules card, an A/B experiment editor (variants/weights/per-bundle overrides/metric/control/start-stop/promote-winner) and an ML-ranker panel (rollout slider, Train-now via POST /api/admin/ml-upsell, model status, live ML-vs-rules comparison via /api/admin/ml-upsell/compare); plus a read-only Item-modifiers inventory — all round-tripped through PUT /api/admin/upsell; the Bundles tab is now a Menu/Recipes-style workbench wired to real 30-day /api/admin/bundle-analytics — a reactive KPI rail with five-section ⓘ explainers (active bundles / penetration / bundle AOV / 30d revenue / avg effective discount), search + Board⇄Table toggle, a meal-period-grouped board with per-bundle live 30d stats, and a two-column drill-in editor with a live bundle-card preview + this bundle's real 30d performance grid) complete the Growth section. Intelligence is underway: Multi-location (/admin/locations — cross-site comparison), Menu engineering (/admin/menu-engineering — star/puzzle/plowhorse/dog classification), and Expansion (/admin/expansion — new-site readiness checklists) are live; Manage locations (/admin/locations/manage — site CRUD with hours editor + re-seed) and Insights (/admin/ai — AI demand forecast + chatbot-FAQ manager) complete Intelligence. System is underway: Audit log (/admin/audit-log), SOC 2 controls (/admin/soc2, real buildSoc2Register introspection), Currency + Languages settings, and Capabilities (→ this ledger) are live; Users (/admin/users — account directory + CRUD) and Permissions (/admin/permissions — action-level RBAC matrix from the shared PERMISSION_GROUPS catalog, persisting custom grants) are live. Compliance (/admin/compliance — license/inspection expiry calendar) and Regulatory disclosures (/admin/regulatory-compliance — per-site EU/NYC/SG packs) are live. Settings (/admin/settings — business + storefront-layout toggles + feature flags) is live. The Calculator (/admin/simulation) is live through Part 3a: its P&L compute engine was extracted to a shared pure lib (src/lib/simulation-engine.ts — computeScenario + computeTornado + computeReturns + projectMonths/projectTwelveMonths) so v3 runs identical real math; live levers drive the P&L, KPIs (margin/break-even/prime/CM1/capacity/payback) and a sensitivity tornado, saved via PUT /api/admin/simulation. Investor Returns (NPV @ 10/15/20%, bisected IRR, payback month + 24-month cumulative cash-recovery) and a seasonality×weather×inflation-composed 12-month revenue/net-profit projection chart are live too. A real-order Sandboxes card (window selector over four tabs reading live orders) is live: Cohort/LTV-CAC (/api/admin/simulation/cohorts), Dayparts (/dayparts), Hourly throughput with capacity colouring (/hourly), and Menu engineering quadrants with margin-trap/prep-heavy flags (/menu-engineering), all ?days=N. Five-section ⓘ explainers (Rule #12) are live on the six headline KPIs via a v3-native MetricExplainer/InfoButton primitive (src/admin-v3/ui/Explainer.tsx) that fixes the description → INSTITUTIONAL ANALYSIS → IN PLAIN TERMS → TIPS → METHODOLOGY order. Behaviour & environment levers fold into the headline P&L: applyAssumptions + applyAnnualWeather were extracted into the shared engine, with input cards for Behaviour assumptions (6 attach levers + combo + delivery share), Ingredient cost stress (10 per-line deltas) and Seasonality & weather (quarterly multipliers + a calibrated weather/holiday model). The fleet/franchise model + channel-economics breakdown (computeFleetEconomics/computeChannelEconomics) are now in the engine + v3 Calculator: a Channel mix & fleet input card drives the per-channel fee mix and multi-unit model, with a Channel economics table (unblended per-channel CM1) and a Fleet economics card (fleet revenue/EBITDA, avg per unit, HQ absorption, per-unit table). The v3 Calculator is at functional parity with v2 AdminSimulation. Every admin section now runs on v3. Core (POS/KDS/Guest) is untouched.",
        },
        {
          name: "Theme skins (per-surface theme swap)",
          status: "live",
          href: "/admin/settings",
          summary: "Infrastructure to swap the entire look of any surface — Business (storefront), Admin, or Core — to a totally distinct theme (its own classes, selectors & tokens), DB-global so one choice repaints for every visitor. Pick a skin per surface at /admin/settings → Themes → Active skins (saves instantly per Rule #7, owner-gated + audited via PUT /api/admin/themes). The registry (src/lib/theme-skins.ts) lists skins per surface; the shipped theme is the 'default' skin and alternates are self-contained stylesheets scoped under [data-skin=\"<id>\"]. Admin + Core server-render data-skin onto the surface root (force-dynamic → reflects the live setting, no flash); the storefront stays static and applies its skin via /api/settings/public (homepageSkin) + a pre-paint boot script + HomepageSkinSync on <body> (reaches Rule-#4 portal overlays, cleans up on nav). TODAY each surface ships only its single current theme; the add-a-skin checklist lives in docs/design-system/{homepage,admin,core}/skins.md (Rule #11).",
        },
        {
          name: "Distributed locks (Upstash)",
          status: has("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN") ? "live" : "needs-config",
          envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
          summary: "Cross-instance slot oversell + idempotency. Falls back to in-process when unset.",
        },
        {
          name: "Postgres substrate (Neon)",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          envVars: ["DATABASE_URL"],
          summary: "25+ normalized tables with self-bootstrap DDL. No manual migration step.",
        },
        {
          name: "Webhook + checkout idempotency",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          summary: "Stripe retries land once; Idempotency-Key from clients prevents duplicate orders.",
        },
        {
          name: "Durable POS write queue (offline-safe send/charge)",
          status: "live",
          href: "/core/pos",
          summary:
            "The till never loses a ticket or double-charges on a flaky network. Server withIdempotency(key, fn) (src/lib/store.ts) runs each POS mutation at most once per Idempotency-Key — serialized by the distributed lock, memoizing only successes with a 24h TTL — so a charge re-sent after a lost response replays its original { orderId, total } instead of taking a second payment or 404-ing on the deleted tab; applied to POST send-to-KDS + PATCH charge (pos/orders). Client idempotentFetch (src/lib/idempotentFetch.ts) attaches the key and retries transient blips (dropped connection / 5xx) with backoff; wired into POS send / fire-course / charge + the KDS bump. When the network is genuinely down, durableMutate (src/store/writeQueue.ts) parks the write in a localStorage outbox under its key, closes the check optimistically, and replays it — exactly once, FIFO per tab — on reconnect, surviving a reload; a '↻ N writes syncing' amber pill on the POS check-bar shows pending writes. Verified by idempotency.test.ts + writeQueue.core.test.ts.",
        },
        {
          name: "Guest QR orders settle through the tender model",
          status: "live",
          href: "/core/pos",
          summary:
            "Guest-placed QR table orders already surface as first-class per-table entities on the Floor (channel 'qr', with a 'QR · … to pay' chip + inline settle) and in the POS QR queue. Settling one is now a real tender, not a bare 'Mark paid': QrTenderPanel (src/core/pos/CoreQrQueue.tsx) captures method (Card/Cash), a tip preset and a cash change-due before confirming. The settle route (src/app/api/admin/pos/qr-orders/route.ts) applies the tender to the EXISTING order — no duplicate order or tab, so there is no double-charge — writing the same tipAmount / payments[] / cashTendered+changeGiven fields the POS tender uses, so a guest order and a server-rung check settle through one money model. A bare settle (no tender) still just marks it paid; the order stays the single server-owned source of truth.",
        },
        {
          name: "KDS all-day batch rail",
          status: "live",
          href: "/core/kds",
          summary:
            "A Σ control on the KDS board (src/core/kds/CoreKds.tsx, Floor + Chef views) toggles an 'all-day' rail (.core-allday): every still-to-make item (New + Firing, not yet Ready) summed by dish across all active tickets, biggest first, with the ticket count — the line's 'make-now' batch the pizzaiolo cooks from. Derived live from the same KdsTicket stream (no mock data, Rule #1) and respects the station filter. Also tightened the ticket hierarchy (larger mono due-clock, allergen strip gets a left safety rule) and fixed fmtClock to round to whole seconds (the Oldest/Avg-age KPIs and due clocks were rendering fractional seconds like '41:3.96099').",
        },
        {
          name: "Delivery dispatch board",
          status: "live",
          href: "/core/service/dispatch",
          summary:
            "Core · Service · Dispatch (src/core/service/CoreDispatch.tsx) is the delivery driver board: it lists the active delivery orders (confirmed→preparing→ready→assigned→picked_up) with address, item count, total and live status, plus in-kitchen / ready-to-go / on-the-road KPIs, polling /api/admin/dispatch every 8s. Drivers are the location's 'delivery'-group staff (roles driver/courier, status active) surfaced as one-tap assign chips; assigning writes order.assignedDriverId (new store helper assignOrderDriver — DB column + kv mirror already existed) and moves the order to 'assigned'. A single advance button walks it 'picked up' → 'delivered' via the shared updateOrderStatus. Every write goes through PUT /api/admin/dispatch (audit-logged as orders.assign_driver / orders.status_change) reusing the order money/lifecycle model — no parallel state. Glass-styled via theme tokens so it follows the active Core skin.",
        },
        {
          name: "Liquid Glass — the default Core skin",
          status: "live",
          href: "/admin/settings",
          summary:
            "The 2026 Service OS visual language ships as the default Core skin (src/app/themes/core/skins/liquid-glass.css, scoped .core[data-skin=\"liquid-glass\"]; DEFAULT_THEME_SKINS.core in src/lib/theme-skins.ts). It redefines the Core palette to translucent frosted glass, paints an ambient ember aurora on the root, and frosts the shared chrome + surface primitives (command bar, bottom nav, POS/Floor/Guest/Book cards, ticket, check panel, KPI bands) with backdrop-blur + specular rim + floating shadow. The KDS kitchen wall stays a dark wall by design. Fully reversible — 'Core Dark' is selectable in /admin/settings → Themes.",
        },
        {
          name: "Seating Intelligence Engine — smart table recommendation",
          status: "live",
          href: "/core/service/book",
          summary:
            "A pure, explainable table-assignment engine (src/lib/seating.ts, suggestTables/recommendTable — 27 unit tests) behind Service · Book. Once a slot supplies a seating time, every table is hard-filtered (capacity fit · free-for-the-full-turn using the turn-time model + reset buffer · availability · occupied-now · VIP hold · section cap) then scored 0–100 over weighted soft signals (right-size · runway comfort · guest preference/zone · pacing per 15-min bucket · yield). The Book table-picker's ✨ Recommend row is the engine's top pick and each row's tag + tooltip is its reason; a SIGNALS PANEL below the picker lays the score open (a colour-coded bar per signal + the reasons + the total + a shadow badge) so a pick is never a black box; excluded tables dim. LIVE capabilities: (1) SEAT LIFECYCLE — Today's-bookings rows carry Seat / No-show / Complete actions that transition the reservation and stamp seatedAt/completedAt (POST /api/admin/floor/reservations), which also fans out to the floor via the TableSession spine. (2) WALK-IN GUARD — a '+ Walk-in' dialog ranks tables at NOW and only seats a genuinely-free one. (3) MANAGER POLICY — a '⚙ Policy' dialog with presets + weight sliders + numeric rules (reset buffer / pace cap / large-table seats / SECTION CAP per zone per 15-min) + GUARD TOGGLES (Protect large tables — hard-drops a small party from a big top when a smaller fits; Auto-suggest — pre-selects the engine pick; Learn-from-overrides; Shadow mode — advisory-only) + a VIP-HOLD zone picker (held zones exclude non-VIP parties) + a TRUST-LOOP readout, all persisted per location (GET/PUT /api/admin/seating/policy, saves instantly per Rule #7). (4) LEARNED TURN-TIMES — a shrinkage-smoothed model derived live from completed reservations' seatedAt→completedAt spans, learned per party × daypart × weekday-group (weekday vs Fri/Sat) with a confidence band (GET /api/admin/seating/turn-model), cold-starting on party-size defaults. (5) TRUST LOOP — every booked seat logs recommended-vs-chosen plus, on an override, the reason (guest-request / server-balance / large-party / vip / other) and the recommended pick's dominant signal (POST /api/admin/seating/decisions when Learn-from-overrides or Shadow mode is on; getSeatingDecisionSummary rolls up the agreement rate, the top override reason, and a weight-tuning NUDGE — 'operators override yield 75% of the time, consider lowering it'), so trust is a real measured number (Rule #1 — no fabricated data). Every advanced lever defaults off/neutral so a bare preset ranks exactly as before (non-regressing). Pure & client-safe (reuses floor.ts, no I/O). Deep-dive: tests/sketches/host-06-engine.html.",
        },
        {
          name: "Waitlist & pre-service forecast — the host queue + a book simulation",
          status: "live",
          href: "/core/service/book",
          summary:
            "Two additions that close the concept-5/6 gaps. WAITLIST — Book & Seat's Arrivals lens now has a real Waitlist column (Expected · Waitlist · Seated): walk-ins queue with a LIVE wait quote from estimateWaitMin (the soonest a fitting table frees, pushed out by the parties ahead competing for the same tables), an entry flips to 'table ready' when a table opens, and Seat drops them onto the engine's pick (a walk-in seated reservation, via the TableSession spine) and closes them out of the queue. Backed by /api/admin/floor/waitlist (GET/POST/PATCH/DELETE) + waitlist.json; the legacy Floor's Waitlist stat now reads this real source, not a fabricated 0. FORECAST — a '◔ Forecast' dialog runs simulateService() (GET /api/admin/seating/simulate) over the whole reservation book before doors open: bookings/covers/peak-occupancy KPIs, a per-30-min table-occupancy chart, and every at-risk booking (no table · too small even with joined tables · double-booked). Both are pure-compute over real data (Rule #1).",
        },
        {
          name: "TableSession spine — Book & Seat and Floor share one occupancy truth",
          status: "live",
          href: "/core/service/book",
          summary:
            "The unification that ends the bookings-vs-floor disconnect (who's sitting where; walk-ins stealing reserved tables). ONE pure, unit-tested derivation — buildTableSessions in src/lib/table-session.ts (11 tests) — fuses the two truths the room has: reservations (booked/seated/due, from Book & Seat) and the physical FloorTable.status (a walk-in seated off-book on the legacy floor has no reservation, only a seated table). It emits a per-table session (state free/held/due/seated/oos · who · elapsed · free-for-window · source booking/walk-in/floor). Book & Seat's section-header LENS TOGGLE (the unified-header `.core-seg` view switch) drives three views over this one spine so they can never disagree — Timeline (the plan), Floor (a live tile grid: seated tiles show the guest + minutes with Complete, due bookings show Seat, held tiles count down the next booking, free tiles seat a walk-in, and an off-book floor walk-in shows as a dashed 'occupied' tile), Arrivals (Expected · Walk-ins · Seated). The spine is BIDIRECTIONAL on write: seating/completing/no-showing/cancelling/reassigning a booking fans out to FloorTable.status via reconcileFloorTable in the reservations route (POST/DELETE /api/admin/floor/reservations), so the floor-twin (shift handover + the POS table picker) reflects a Book & Seat seat instantly and frees the table on completion — unless an open dine-in check still holds it. nowMin ticks every 30s so the live lenses stay current. Additive: the legacy floor-twin, POS and Timeline are untouched; pure engine has no I/O (caller passes nowMin).",
        },
        {
          name: "Context Dock — cross-lens selected check",
          status: "live",
          href: "/core/service/book",
          summary:
            "A persistent glass dock (src/core/shell/CoreDock.tsx + SelectionContext) shows the selected entity's check and follows the operator across every Core lens. Selecting a table (Book Floor-lens tile), the active till check (POS, standalone), or a ticket (KDS header) pins it; the dock shows status/covers/allergy/amount + an Open jump and expands (peek→expand) to the captured line items. Additive with a no-op fallback context — renders nothing until something is selected, so no surface regresses.",
        },
        {
          name: "Service · Tables — the floor-plan management surface",
          status: "live",
          href: "/core/service/tables",
          summary:
            "/core/service/tables (src/core/service/CoreTables.tsx) is the table PLAN, not the live room: it does one job — manage zones, tables and seats. /core and /core/service both land here and the Lens Rail's Service lens is 'Tables'. Zones are first-class per-location entities (FloorZone in src/lib/store.ts, GET/POST/PATCH/DELETE /api/admin/floor/zones?location=), separate from tables, so an empty zone persists — you can Add zone, rename or delete a zone inline, and drag a table between zone groups (reassignZone rewrites its zone name via the same status-preserving write, so a move never frees a seated party); reconcileZones back-fills a zone for any table.zone not yet listed, renameZone cascades the new name onto member tables, deleteZone frees its tables to Unzoned. Tables are grouped under those zones with a zone-scope filter; a stat strip reads live off the catalogue (tables · seats · zones · available · out-of-service · accessible — Rule #1). Tapping a tile (or its ⋯) opens the table editor (CoreDialog, portaled per Rule #4) which edits only the physical plan — number/label, seats, zone (a picker of the zones that already exist, plus No-zone) and accessibility features (accessible/high-chair/step-free); status and the service note are deliberately absent (operational, owned by Book/POS — the editor carries them through untouched, re-reading live status before the whole-row write so an edit can't free a seated party). All persisted to the shared per-location catalogue via /api/admin/floor/tables (Add/Save/Delete, manager+). There is deliberately NO seating, order lookup or live-occupancy tooling here — that operational flow lives in Book's Floor lens (seat parties, open checks) and POS. Reads/writes the same FloorTable rows every other surface shares, so a table added here shows up in the POS picker and Book instantly.",
        },
        {
          name: "POS tender — tips, splits, comps & cash change",
          status: "live",
          href: "/core/pos",
          summary:
            "The charge step is a real tender sheet, not a bare Card/Cash tap. TenderDialog (src/core/pos/CorePos.tsx) captures: a tip (5/10/15% of net or custom zł), a manager comp with reason chips, an even OR by-item split across the cover count (per-guest share + Cash/Card per share), a MIXED tender for a single payer (a 'Cash + Card' pad: type the cash portion, the card remainder auto-computes — payments:[{cash},{card}] that always sum to the total), and a cash change-due calculator with denomination quick-keys. Removing a dish is idiot-proof: an unfired line decrements instantly, but deleting the last unit of a dish already sent to the kitchen confirms with a reason (Wrong item / Guest changed mind / 86 / Duplicate / Sent in error) so a cooking dish is never silently wiped — and the cancel NOTIFIES the kitchen (POST /api/admin/kds/void-item → voidKitchenItem records it on Order.voidedItems and pulls it from the make-list), so the KDS ticket shows the dish struck-through ('✕ CANCEL 1× Margherita · 86 / out') instead of quietly vanishing. Audit-logged as kds.void_item. Everything is server-authoritative in chargeTab (src/lib/pos/fireTab.ts): the bill is re-derived by buildOrderShape; the comp is clamped to the bill and gated by the shared evaluateRefundGuard (owners bypass, others hit the per-shift comp cap) and logged via appendAuditLog action 'pos.comp' so Reports + getActorCompTotalToday count it; split payments are validated to cover net due + tip (a short tender 400s); cash change = tendered − cash share. The tender persists on the Order as tipAmount / payments[] / compAmount+compReasonCode+compNote / cashTendered+changeGiven (PosPayment type), so receipts, Reports and cash reconciliation read a real breakdown. PATCH /api/admin/pos/orders now takes { tabId, tender } and returns { totalAmount, tip, comp, change, netCollected }; a bare PATCH still charges the full bill so the native /api/v1 till is unchanged.",
        },
        {
          name: "POS line modifiers & special requests",
          status: "live",
          href: "/core/pos",
          summary:
            "The till can now author per-line modifier picks and a special-request note, closing the gap where only the guest app could customise a line. A customisable product card (an item with modifierGroups) opens LineEditorDialog (src/core/pos/CorePos.tsx): radio/checkbox option groups honouring min/max selections (required groups gate the Add button), quick note chips plus free text, and a ⚠ Allergy chip that flags the note. Each line carries its modifiers + notes (PosTabLine extended; sanitised + persisted in savePosTab); line identity is the item + picks + note (posLineKey, src/lib/pos-line.ts) so a plain and a customised line of the same dish stay separate and the stepper / re-course / edit target the right row. Pricing stays server-owned — buildOrderShape (src/lib/pos/fireTab.ts) re-resolves each pick against the live menu, drops any option id not on that item, and adds the menu's priceDelta via effectiveUnitPrice; the same number drives the till subtotal. The KDS ticket already renders selectedModifiers (.mod / .mod.flag) + the per-line note, so a customised line and its allergy flag reach the line cook unchanged.",
        },
        {
          name: "Rate limiting",
          status: "live",
          summary: "5/min/IP login, 10/min/IP checkout, 5/min/phone feedback, plus a blanket per-user limit on EVERY admin API route (default 1200/min/user, override ADMIN_RATE_LIMIT_PER_MIN) enforced inside withAdmin. Fail-open on Redis error.",
          envVars: ["ADMIN_RATE_LIMIT_PER_MIN"],
        },
        {
          name: "Admin IP allowlist",
          status: has("ADMIN_IP_ALLOWLIST") ? "live" : "disabled",
          envVars: ["ADMIN_IP_ALLOWLIST"],
          summary: "Optional network gate on the whole admin surface. Set ADMIN_IP_ALLOWLIST to a comma-separated list of exact client IPs; requests from any other IP get 403 before auth or DB are touched (enforced in withAdmin + the login route). Unset = open to all (default). Exact-match only, no CIDR yet.",
        },
        {
          name: "Security headers (CSP, HSTS, XFO)",
          status: "live",
          summary: "Set in next.config.ts. Audit via curl -I.",
        },
        {
          name: "Per-route role + location enforcement",
          status: "live",
          summary: "withAdmin middleware blocks cross-tenant reads + enforces role/location scope and the per-user rate limit. 120+ of ~140 admin routes wrapped (the rest are cron/health endpoints with their own gates).",
        },
        {
          name: "Health endpoint",
          status: "live",
          href: "/api/admin/health",
          summary: "DB + Redis latency, lock contention, business KPIs, AI usage.",
        },
        {
          name: "Nightly DB backup → S3",
          setup: {
            goal: "turn on nightly S3 backups with least-privilege creds",
            appliesAt: "Vercel → Project → Settings → Environment Variables (Production)",
            doc: "docs/runbooks/backup-restore.md",
            steps: [
              { text: "Create an S3 bucket. Enable Versioning + a lifecycle rule to expire old backups (e.g. 35 days)." },
              { text: "Create an IAM user/role allowed ONLY s3:PutObject on the backup prefix — the app never reads or deletes:", code: "arn:aws:s3:::<bucket>/<prefix>/*" },
              { text: "Set BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY in Vercel (Production), then redeploy — this card flips to Live." },
              { text: "Confirm CRON_SECRET is set (cron auth), then trigger a manual run to verify:", code: "curl -X POST -H \"Authorization: Bearer $CRON_SECRET\" https://<host>/api/admin/cron/db-backup" },
              { text: "Check the object appears in S3 under today's date partition. Rehearse a restore against a Neon branch before you ever need it (see runbook)." },
            ],
          },
          status:
            has("BACKUP_S3_BUCKET", "BACKUP_S3_REGION", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY")
              ? "live"
              : "needs-config",
          href: "/api/admin/cron/db-backup",
          envVars: ["BACKUP_S3_BUCKET", "BACKUP_S3_REGION", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY", "BACKUP_S3_PREFIX", "BACKUP_S3_ENDPOINT"],
          summary: "Logical snapshot of every public table (relational + kv_store) → gzipped JSON → S3, nightly via the cron dispatcher. Self-describing dump (records column types) restored by scripts/restore-backup.ts in FK order inside a transaction. Self-skips when S3 unset. Runbook: docs/runbooks/backup-restore.md.",
        },
        {
          name: "Error monitoring + alerting (Sentry)",
          setup: {
            goal: "ship errors to Sentry and alert on >1% 5xx + lock fallback",
            appliesAt: "Vercel env (SENTRY_DSN) + the Sentry dashboard (alert rules)",
            doc: "docs/runbooks/alerting.md",
            steps: [
              { text: "In Sentry, open (or create) the project and copy its DSN. Set SENTRY_DSN in Vercel (Production) and redeploy — this card flips to Live once set." },
              { text: "Confirm capture: trigger a deliberate 500 on a preview deploy and check it lands in Sentry with the path / requestId tags." },
              { text: "Alert 1 — error rate: Sentry → Alerts → Create Alert → Metric alert → condition 'failure rate > 1%' over a 5-minute window; action = notify on-call." },
              { text: "Alert 2 — lock fallback: Sentry → Alerts → Create Alert → Issue alert filtered to messages containing 'withDistributedLock' (or extra alert = lock.fallback); trigger on any occurrence in production." },
              { text: "In each alert's Actions step, route to your channel (email / Slack / PagerDuty)." },
            ],
          },
          status: has("SENTRY_DSN") || has("NEXT_PUBLIC_SENTRY_DSN") ? "live" : "needs-config",
          envVars: ["SENTRY_DSN"],
          summary: "instrumentation.ts (register + onRequestError) ships every server error, RSC failure and cron throw to Sentry; logger.error/warn mirror with request context. Lock timeouts and Redis-broken fallbacks are logged as alertable events. Alert rules (>1% 5xx, lock-fallback) are documented in docs/runbooks/alerting.md — configure the thresholds in the Sentry dashboard.",
        },
        {
          name: "Audit log",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/audit-log",
          summary: "Every write tagged with actor + entity. Full retention, no trim. Managers+ read it; owners can purge it from the page — delete selected rows, the current action filter, or the whole trail (DELETE /api/admin/audit-log, owner-only), with the purge itself logged as audit.purge.",
        },
        {
          name: "Users & RBAC management",
          status: "live",
          href: "/admin/users",
          summary: "Owner-only CRUD on admin accounts, with an advanced roster: a KPI strip (accounts, active, 2FA/passkey coverage, on-shared-password risk), a per-row security-posture chip, security + location filters, and a click-through account detail drawer (identity, scope, how-they-sign-in, effective access, security actions). Each operator also gets a self 'How you sign in' panel in Settings → Security (fed by /api/admin/me). Roles: staff, kitchen, manager, owner, franchisee. Accounts can be scoped to one OR several locations (a manager can run multiple sites) via AdminUser.locationSlugs — none = all; the set is bound into the session's comma-separated locationScope and enforced by requireLocationAccess everywhere. Each account carries its own scrypt password + optional terminal PIN (owner sets/resets via the per-row 'Login' dialog → /api/admin/users/[id]/credentials); login no longer rides the shared ADMIN_PASSWORD once a personal password is set. Secrets (hash + PIN hash + TOTP) are never sent to the client.",
        },
        {
          name: "Permission matrix (live RBAC cross-tab)",
          status: "live",
          href: "/admin/permissions",
          summary: "Owner-only live cross-tab of every capability against roles and real accounts — derived from the permission catalog, the role table (ROLE_RANK) + presets, and the current user list (nothing hand-maintained; a new capability key, role, or user appears automatically on next load). 'By role' shows each role's default grant; 'By user' shows each account's effective access (custom grants override role) and lets an owner click any cell to grant/revoke — persisting a custom grant through the owner-only /api/admin/users, the same gate the Users editor uses. Search + group filters; owners are always all-access and locked. Code: src/components/admin/AdminPermissions.tsx.",
        },
        {
          name: "Hire-with-login (manager team provisioning)",
          status: "live",
          href: "/admin/staff",
          summary: "A manager (or anyone with the staff.hire permission) hires an employee by job title — pizzaiolo, chef, KP, waiter, driver, courier — and, in the same dialog, provisions a personal login scoped to their own location. The hire flow can only mint staff/kitchen tiers (manager/owner accounts stay owner-only via Users & roles) and is location-bound by withAdmin. Job title → access tier → landing surface is mapped once in src/lib/staff-roles.ts. Wired via POST /api/admin/staff { login } → provisionStaffLogin.",
        },
        {
          name: "Manager portal (scoped home)",
          status: "live",
          href: "/manager",
          summary: "A manager's home after sign-in (managers no longer land on the owner's company-wide /admin HQ, which is now owner-gated server-side). /manager is a standalone surface that renders the av3 dark-canonical theme — the same surface as the sign-in door it follows (its layout loads themes/admin-v3 + the av3 brand lockup, like /franchisee) — showing today's revenue, orders, covers and who's on shift — every figure derived live from real orders (getOrders) + shifts (getShifts/getStaff), filtered to the manager's location scope (the same */comma-list claim the session enforces). Owners can preview it; staff/kitchen are redirected to their own surface. It is a home, not a cage: a 'Jump to' rail links into the operational pages (Orders, KDS, Schedule, Inventory, POS, Team). Those cards are not hard-coded — getDashboardQuickLinks (src/lib/dashboard-links.ts) filters a permission-annotated registry to the cards the viewer's effective permissions unlock, so the admin controls exactly what shows there via the Permission Matrix (role default or per-user custom grant) and a card appears only when its destination is reachable (no click-then-bounce). Those back-office pages are served under the manager's own URL prefix — /manager/* (a franchisee gets /franchisee/*, the owner keeps /admin/*) — via Next.js rewrites onto the single /admin/* page set, so the path reads as their space, not 'admin'; the whole shell (sidebar, command palette, breadcrumbs, intra-page links) re-roots onto that prefix and a stray /admin/* URL converges back to it (src/lib/admin-base.ts). Landing is mapped once in src/lib/staff-roles.ts → landingPathForRole.",
        },
        {
          name: "Team tasks, daily routines & announcements (comms)",
          status: "live",
          href: "/admin/comms/tasks",
          summary: "Internal comms board, split into two separate Overview surfaces: TASKS (/admin/comms/tasks) and ANNOUNCEMENTS (/admin/comms/announcements) — each its own nav entry/route, no shared tab. An owner — or anyone granted comms.manage in the Permission Matrix — assigns to-do TASKS to a specific teammate or a whole role (optionally scoped to a location; role-targeting fans out to one task row per person, each with its own done-state), defines DAILY ROUTINES (the recurring 'regular to-do list' — orders, delivery, clean walls, coffee-machine maintenance), and posts ANNOUNCEMENTS (Title subject + textarea body) to everyone / chosen roles / chosen locations / named people (pinnable, edit-in-place + delete). DAILY ROUTINES are templates, not tasks: targeted by role + location like a task (both empty ⇒ everyone everywhere), pausable via an Active toggle, managed in the Tasks view (POST/DELETE /api/admin/routines, gated comms). They appear on every matching teammate's portal each day and RESET AT MIDNIGHT (Europe/Warsaw) with no cron — the list is derived from templates + per-day completion rows (routine-completions.json), so a new day has no ticks and one person ticking never ticks for everyone. Each teammate sees their own tasks + daily routine + targeted announcements on their role portal (Manager/Franchisee, via PortalInbox): announcements lead as a Gmail-style NOTIFICATION inbox with three mailbox tabs — INBOX / ARCHIVED / DELETED — and per-row actions Mark read · Archive · Delete (Restore from Archived/Deleted). The Inbox shows only the 3 most-recent UNREAD rows with a 'Load more' beneath; 'Daily routine' (checkboxes that reset daily, with a quick-add for personal recurring items — scope personal, owned by you — and remove on your own routines via /api/admin/my-routines) and 'Your to-do list' sit below. The to-do list isn't read-only: a quick-add box (title + priority + optional due date) lets ANY teammate add a one-off item to their OWN list (POST /api/admin/my-tasks stamps the session user as both assignee + creator, so it can never assign onto someone else), and the FULL LIFECYCLE is wired across To-do/Done/Archived/Deleted tabs — Done · Archive · Delete · Reopen · Restore (PUT /api/admin/my-tasks status open|done|archived|deleted, single-axis since one task = one owner); self-added items (createdBy === assigneeId) show 'added by you' and can be purged for good from Deleted (DELETE /api/admin/my-tasks, restricted to items you created — manager-assigned tasks keep the record). Mailbox state is per-recipient (archivedBy/deletedBy on the announcement, deleted wins over archived) so one person archiving never hides it for others. Every interaction — open/read, archive, delete, restore — PUTs {id,action} to /api/admin/my-announcements and is written to the central AUDIT LOG as notification.{read,archive,delete,restore} (entityType=announcement) so an owner can review who did what, when. The unread + open-to-do + pending-routine count also surfaces in CommsBell (src/components/portal/CommsBell.tsx) — an inbox-icon button rendered in the shell topbar AND on both portal headers, deliberately separate from the operational alerts bell beside it; its glance dropdown links to the portal inbox. Receiving needs NO permission (personal feeds on /api/admin/my-tasks + /api/admin/my-routines + /api/admin/my-announcements, any authed user, identity = session never a query param); only the team management board is gated (comms.view to open, comms.manage to assign/define/post/edit/delete — owner-default, grantable). Persisted via the store (readJSON/writeJSON → Postgres KV + filesystem: tasks.json, routine-templates.json, routine-completions.json, announcements.json); recipient matching (incl. isRoutineForUser) + mailbox-state helper + types in src/lib/comms.ts; writes audited (tasks.assign / routines.{create,update,delete} / announcements.post / notification.*). No mock data — empty until someone assigns/defines/posts.",
        },
        {
          name: "Per-person login + role routing (password, PIN, passkey)",
          status: "live",
          href: "/terminal",
          envVars: ["WEBAUTHN_RP_ID", "WEBAUTHN_ORIGIN"],
          summary: "Professional per-person sign-in across separate doors that all mint the same signed, location-scoped session and route by role (kitchen → KDS, floor → POS, manager → /manager portal, franchisee → /franchisee portal, owner → /admin HQ). Doors: /admin/login is the OWNER-ONLY admin door; /login is the universal team door (managers, pizzaiolo, chef, KP, waiter — and owners) — both render the shared LoginForm and send a portal flag the API enforces (a non-owner is rejected at /admin/login and pointed to /login); /terminal is a fast numeric PIN for shared kitchen/POS devices (location-scoped, 5/min/IP). Methods: email + per-user scrypt password (optional TOTP); passwordless passkey / hardware security key (YubiKey, Touch ID) via WebAuthn (enrolled self-service in /admin/users → Keys, verified at /api/admin/webauthn/authenticate). Unauthenticated /admin/* redirects to /login. RP id/origin derive from the request host; override with WEBAUTHN_RP_ID + WEBAUTHN_ORIGIN behind a proxy. A linked staff login is auto-disabled when the roster row goes inactive or is removed.",
        },
        {
          name: "Granular permissions (action-level RBAC)",
          status: "live",
          href: "/admin/users",
          summary: "Per-user, action-level permission grants (75 capability keys across orders, menu, finance, growth, system). Only an owner can grant — user-management writes are owner-only. Each non-owner account inherits its role's default preset or carries a fully-custom grant edited in the user dialog. The manager default is deliberately narrow: head-office surfaces (Finance reports/business-costs/calculator, all of Growth & marketing, and governance/config like Boardroom, Audit log, Capabilities, Payments, QR ordering, AI Insights) are owner-only by default but stay grantable to an individual manager via the Permission Matrix — Cash, Compliance and Menu engineering remain with the manager. Enforced end-to-end: the v3 sidebar is filtered by effective permissions and a shell page guard bounces any non-owner from a surface they lack, withAdmin rejects ungranted /api/admin/* calls, and high-value handlers (refunds, cash, GDPR export, loyalty adjustments, purchase orders, settings) re-check the specific capability at the call site. Owners are always full-access; accounts left on 'role default' keep legacy role-rank behaviour for unmapped routes. Catalog + maps: src/lib/permissions.ts.",
        },
        {
          name: "Admin MFA (TOTP two-factor)",
          setup: {
            goal: "require a 6-digit code on admin login",
            appliesAt: "Vercel env (shared session) and/or /admin/users (per user)",
            doc: "scripts/generate-totp-secret.ts",
            steps: [
              { text: "Per-user MFA (recommended): each user opens /admin/users → their row → MFA → Begin setup → scan the secret into an authenticator app → enter the code to confirm." },
              { text: "Shared owner session: generate a shared secret + otpauth URI:", code: "tsx scripts/generate-totp-secret.ts" },
              { text: "Scan the otpauth:// URI (or paste the secret) into an authenticator app (Google Authenticator, 1Password, Authy)." },
              { text: "Set the printed value as ADMIN_TOTP_SECRET in Vercel (Production) and redeploy — this card then reads Live." },
            ],
          },
          status: has("ADMIN_TOTP_SECRET") ? "live" : "needs-config",
          href: "/admin/users",
          envVars: ["ADMIN_TOTP_SECRET"],
          summary: "RFC 6238 TOTP on admin login. Per-user MFA enrolls in /admin/users (Begin setup → scan secret → confirm code); login then requires a 6-digit code. The shared owner session is protected by ADMIN_TOTP_SECRET (generate with `tsx scripts/generate-totp-secret.ts`). Codes verified constant-time with ±1 step skew; secrets never leave the server.",
        },
        {
          name: "Admin password hashing (scrypt)",
          setup: {
            goal: "rotate the admin password to a salted hash",
            appliesAt: "Vercel → Project → Settings → Environment Variables (Production)",
            doc: "scripts/hash-admin-password.ts",
            steps: [
              { text: "Generate a hash from a strong new password (input is hidden; not stored in shell history):", code: "tsx scripts/hash-admin-password.ts" },
              { text: "Copy the printed line (it starts with scrypt$…) and set it as ADMIN_PASSWORD_HASH in Vercel for Production." },
              { text: "Delete the old plaintext ADMIN_PASSWORD env var on the same screen." },
              { text: "Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new env loads, then confirm this card flips to Live." },
              { text: "Verify by logging in at /admin/login with the new password." },
            ],
          },
          status: has("ADMIN_PASSWORD_HASH") ? "live" : "needs-config",
          envVars: ["ADMIN_PASSWORD_HASH"],
          summary:
            "Admin login verifies against a salted scrypt hash in constant time — no plaintext compare. Generate the hash with `tsx scripts/hash-admin-password.ts` and set ADMIN_PASSWORD_HASH; rotating = re-run and replace the var. Falls back to the deprecated plaintext ADMIN_PASSWORD (with a warning) until the hash is set.",
        },
        {
          name: "Admin settings hub",
          status: "live",
          href: "/admin/settings",
          summary: "Loyalty, growth, AI, seasonal items and feature toggles. Persists via withLock on save. Also home to the operator-managed public-footer fields — businessPhone, businessEmail, and the socialLinks (Instagram / Facebook / TikTok) URL set. Empty fields hide the corresponding row / link in the footer, so the operator can ship without placeholder strings; the Footer is an async server component that reads getSettings() on every render so edits surface within the next request.",
        },
        {
          name: "Storefront layout toggles (Settings → Layout)",
          status: "live",
          href: "/admin/settings",
          summary:
            "Layout tab in /admin/settings lets the operator turn whole pieces of the public site on or off. 11 toggles: Header (currency switcher, language switcher), Landing (bundles showcase, loyalty pitch), Menu pages (seasonal specials), Cart (cross-sell rail, free-delivery progress), Order confirmation (push opt-in, feedback survey, post-order upsell), Site-wide (chat widget). Each call site wraps the owning component in <LayoutGate flag=...> which reads /api/settings/public on mount and returns null when the flag is false — no DOM, no painted CSS, no event listeners. Persists via AppSettings.layout; toggle is the saved state per the toggle-=-saved rule.",
        },
        {
          name: "Themes inspector (Settings → Themes)",
          status: "live",
          href: "/admin/settings",
          summary:
            "Read-only inspector for the three-theme architecture (Core / Admin / Homepage). Each theme view shows: source files + line counts, the routes that load it, live token swatches imported from the typed JS mirror (themes/{core,homepage}/theme.ts + admin/v2/theme.ts) so colours always match the code, the font stack and how it's loaded, the CSS selector prefixes the theme owns, and the file paths to edit. Inspector-only today; future capabilities (live token override, theme upload) land on the same surface.",
        },
        {
          name: "Multi-currency display (PLN / USD / SGD / EUR / AED)",
          status: "live",
          href: "/admin/currency",
          summary:
            "Customer header switcher exposes USD, SGD, EUR, AED alongside the source-of-truth PLN. Operator sets exchange rates + enabled list + default at /admin/currency; rates flow to /api/settings/public so the customer site hydrates the formatter on mount. formatPrice() in src/lib/utils.ts routes through src/lib/currency.ts and converts grosze→target at display time. The Finance Calculator (/admin/simulation) carries its own PLN/USD/EUR/AED selector that overrides the admin PLN pin — the whole P&L, premises, heatmaps and inputs reformat + reparse (convertToGrosze) at the operator rate, persisted as SimulationScenario.displayCurrency. Charges still settle in PLN via the Stripe account — non-PLN selections are a reference display, with an explicit footer note in the switcher. Admin pages never mount the customer CurrencyProvider so they continue to render PLN.",
          caveats:
            "Display-only. Stripe Checkout still creates PLN sessions — to charge in USD/SGD/EUR end-to-end we'd need separate Stripe accounts (currency is bound to the merchant account at creation). Acceptable for cross-border tourists / DACH-Singapore expansion who want to see what they'd pay in their home currency before committing.",
        },
        {
          name: "Multi-language UI (pl / en / de / en-SG)",
          status: "live",
          href: "/admin/languages",
          summary:
            "Customer-facing i18n dictionary (src/lib/i18n.ts) covers all four locales for nav, hero, menu, cart, order confirmation, loyalty, and footer copy. Header switcher dropdown picks among the operator-enabled set; /admin/languages controls which appear + which loads as default. Reload-on-change keeps SSR and client hydration agreed.",
        },
        {
          name: "Per-location regulatory disclosures (EU / NYC / SG)",
          status: "live",
          href: "/admin/regulatory-compliance",
          summary:
            "Operators tag each truck with a regulatory pack (EU 1169/2011 default · NYC §81.50 calorie + DOH letter grade + FRESH Act packaging + FDA Big-9 allergen · SG NEA Nutri-Grade + MUIS Halal + 9% GST + PDPA §13 consent) at /admin/regulatory-compliance. Per-item halal / Nutri-Grade / pork / alcohol flags live next to product name + tags + description on each item's recipe editor at /admin/recipes. Per-portion kcal is auto-computed from `ingredient.kcalPerUnit × quantity / yieldPortions` (wasteFactor is excluded — that covers extra purchased for trim/spill, which is a cost concern, not a calorie one; the customer eats `quantity`, not `quantity × wasteFactor`) — set kcal once on each ingredient's active distributor offering (also at /admin/recipes → Ingredients tab) and every recipe that uses it gets a live calorie figure with no manual retyping. Customer surfaces upgrade their chrome to match: location-page DOH banner, per-item kcal pill on NYC, Nutri-Grade hex + halal/non-halal chip + contains-pork / contains-alcohol disclaimer on SG, GST line + PDPA consent text in the cart. Nothing is inferred — if the operator hasn't filled the field (or kcal data is missing on any ingredient), the customer sees no claim. Compliance config served via /api/settings/public?location= so SSR + client hydration agree.",
          caveats:
            "Display-only. Legal copy still needs counsel review for each jurisdiction — the admin lets the operator paste the lawyer-approved text without a code deploy. The GST line is back-calculated from the inclusive total (IRAS practice for GST-inclusive F&B pricing); when Stripe Tax / TaxJar is wired in, the per-line GST will flow from there instead.",
        },
        {
          name: "Global admin search",
          status: "live",
          href: "/admin",
          summary: "Top-bar search across orders, customers, menu items. Server endpoint at /api/admin/search.",
        },
        {
          name: "Notifications inbox",
          status: "live",
          href: "/admin",
          summary: "Recent system alerts surfaced in the shell — new orders, slot capacity, low stock.",
        },
        {
          name: "Responsive admin (1:1 phone ↔ desktop)",
          status: "live",
          href: "/admin",
          summary:
            "The admin serves the SAME responsive desktop layout on every viewport — phone, tablet and desktop are now 1:1. Below 900px the sidebar collapses into the hamburger drawer and pages reflow via their own @media (max-width: 720px) rules; there is no separate phone UI to drift. The old divergent mobile shell (MobileShell + bottom-nav + MoreDrawer + the ~30 per-page Mobile* components) has now been DELETED — useIsMobile() is gone and AdminShell renders one chrome for every width. The only surviving mobile primitives back the standalone /admin/alerts list. See docs/design-system/admin/mobile/README.md.",
        },
        {
          name: "Mobile admin push notifications",
          status: has("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY") ? "live" : "needs-config",
          envVars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
          summary:
            "Full pipeline live: per-device opt-in in Settings → General → Push notifications (useAdminPush) → /api/admin/push/subscribe → admin_push_subscriptions table → pushToAdmins() server helper. Fan-out from addNotification (new order / slot pressure / slot full / low stock / bundle low margin), cash close with |variance| ≥ 50 zł, and refund processed (excluding the actor). Dead-endpoint pruning on 404/410.",
        },
        {
          name: "Mobile operator-action telemetry",
          status: "live",
          href: "/api/admin/telemetry",
          summary:
            "useActionTiming + /api/admin/telemetry capture span timings via navigator.sendBeacon. Wired on kds.bump, orders.refund, orders.comp. Backs the audit's ≤ 12s refund / ≤ 1.5s bump targets.",
        },
        {
          name: "Events & bookings admin",
          status: "live",
          href: "/admin/events",
          summary: "Private bookings, catering & special events with a run-sheet (timed-segment) planner. Pairs with the public live-event location endpoint.",
        },
        {
          name: "DB-backed locations registry",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/locations/manage",
          envVars: ["DATABASE_URL"],
          summary:
            "Add / edit / archive locations from the admin UI — no code change or deploy. Hardcoded src/data/locations.ts is the first-deploy seed only; once the table has rows it wins. 30s in-process cache.",
        },
        {
          name: "Per-location lock scoping (hot path)",
          status: has("UPSTASH_REDIS_REST_URL") ? "live" : "needs-config",
          envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
          summary:
            "Request-blocking writes are concurrency-safe per location: createOrder's kv-fallback path scopes its lock as `orders:${slug}` via withLockScoped (and the DB-first path doesn't need an app-level lock at all — Postgres handles row-level concurrency via drizzle). The 300 orders/hour ceiling from audit §4 is lifted to N × that on the hot path.",
          caveats:
            "Mirror writes to the legacy kv_store['orders.json'] / kv_store['slots.json'] blobs still take a single global lock — those blobs share one key across all locations, so the lock has to be global to prevent interleaved read-modify-write. They run as fire-and-forget (void mirrorOrderToKvStore) so they never block the user, but cross-truck mirror updates do serialize on the same Redis key. The proper fix is to split the kv mirror into per-location keys (orders.krakow.json, orders.warszawa.json), or — since the DB is now source-of-truth — delete the kv mirror entirely. Tracked in audit §10.3.",
        },
        {
          name: "Retention trim (webhook_events, audit_log)",
          status: has("DATABASE_URL", "CRON_SECRET") ? "live" : "needs-config",
          envVars: ["DATABASE_URL", "CRON_SECRET"],
          summary:
            "Daily cron prunes webhook_events (>30d), checkout_attempts (>7d), audit_log (>180d). Default windows are overridable via RETENTION_*_DAYS env vars. Bytes-deleted is logged for observability.",
        },
      ],
    },
    {
      id: "apps",
      title: "Installable apps (PWA)",
      items: [
        {
          name: "Ottaviano — customer app",
          status: "live",
          href: "/",
          summary:
            "The customer-facing home-screen app: order Neapolitan pizza/pasta and carry the Soci e amici loyalty card. Installs from any storefront route — the root layout advertises /manifest.json + the apple-web-app title \"Ottaviano\" + the brand-red theme, portrait, with its own icon set (public/icons/ottaviano/*, generated by scripts/gen-app-icons.ts). Manifest shortcuts jump straight to Order and My loyalty card. On Android/Chromium the in-page Install button (src/components/pwa/InstallAppButton.tsx, shown on /rewards) fires the native install; on iOS it opens an Add-to-Home-Screen how-to. No config — works in demo mode.",
        },
        {
          name: "OttavianoKDS — operator app",
          status: "live",
          href: "/operator",
          summary:
            "The operator home-screen app for tablets/iPads: full Admin back-office + all of Core (POS, KDS, Orders, Guest, Service). Its home is /operator — an auth-gated launcher with big touch tiles into every surface and an Install button. The admin, core, kitchen, operator (+ admin login/welcome) layouts all advertise /ottaviano-kds.webmanifest + the apple-web-app title \"OttavianoKDS\" + a dark theme, landscape-first, with its own icon set (public/icons/kds/*). Manifest shortcuts jump to KDS, POS, Orders and Admin. Installing from any operator surface yields the KDS icon, not the customer one — both apps coexist on one home screen because each route subtree overrides the manifest + apple title (see src/lib/pwa.ts). One service worker (public/sw.js) serves both shells.",
        },
        {
          name: "OttavianoKDS — native SwiftUI operator app",
          status: "live",
          href: "/api/v1/openapi.json",
          summary:
            "The operator console as a native SwiftUI app, living at native/ottaviano-ios — \"we build only SwiftUI\" (owner directive), so OttavianoKDS was rebuilt in SwiftUI (the previously-retired seed restored, scoped to the operator app only; the customer experience stays on React Native, see the entry below). iPad-first NavigationSplitView in the dark operator skin, gated on a staff sign-in. The sidebar is the full 54-surface operator IA — the Core surfaces (POS/KDS/Orders/Guest/Service) plus every /admin section — role-filtered exactly like the web admin rail (filterNavForRoleV3): owner sees all, a franchise manager their scope, a chef the line. The Kitchen Display reproduces src/core/kds/CoreKds.tsx (live SSE lanes Floor/Chef/Fleet, tone tiers + SLA meter + due countdown, bump via PATCH /api/v1/orders/:id, recall, 86 via PATCH /api/v1/admin/menu, all-day, station filter), and 52 of 54 surfaces are live off their /api/v1/admin/* endpoint (real rows, no mock data — Rule #1); the only 2 not mirrored are SOC 2 + Capabilities (content pages with no data source — honest scaffolds). CRITICALLY, the design colours are NOT hand-picked — the skin palette is GENERATED from the current web Core (BRACE) theme: scripts/gen-native-tokens.ts reads src/app/themes/core/tokens.css → Sources/DesignSystem/Tokens.generated.swift (per-line provenance), and scripts/gen-native-nav.ts emits Sources/AppInfra/OperatorNav.generated.swift from the web nav, so neither the colours nor the IA can drift (the gate npm run check:native now covers both the Swift and the RN artifacts). Built on macOS CI (.github/workflows/ios-swift.yml — XcodeGen → xcodebuild, scheme OttavianoKDS) and shipped via ios-swift-testflight.yml. Set OTTAVIANO_API_BASE_URL to the /api/v1 origin — the only host reference, so the Vercel exit needs no client release.",
        },
        {
          name: "Native customer app — React Native",
          status: "live",
          href: "/api/v1/openapi.json",
          summary:
            "The customer experience in bare React Native, living at native/ottaviano-rn (one TypeScript codebase shared with the web, buildable via GitHub Actions or Xcode). Ottaviano (customer, warm parchment skin): the full order path — browse the live menu (GET /menu) → cart → server-priced POST /api/v1/orders (guest or phone-OTP customer) → live SSE order tracker (/customer/orders/:id/stream) → Rewards loyalty card + order history + account delete/export. The customer skin is GENERATED from the web homepage theme (scripts/gen-native-tokens.ts → src/theme/tokens.generated.ts) so it can't drift. (The operator app was migrated off this RN codebase to native SwiftUI — see 'OttavianoKDS — native SwiftUI operator app' above; the RN OttavianoKDS target remains in-tree but is superseded by the SwiftUI build.) Set EXPO_PUBLIC_API_BASE_URL (or app.json extra.apiBaseUrl) to the /api/v1 origin. Pending before an App Store submission: Stripe PaymentSheet wiring (endpoint live) and a green CI iOS build.",
        },
      ],
    },
    {
      id: "native-api",
      title: "Native platform — /api/v1 facade",
      items: [
        {
          name: "Versioned API facade (/api/v1)",
          status: "live",
          href: "/api/v1/openapi.json",
          summary:
            "The stable, versioned API the native apps consume (docs/native/ — Stage 2 of the native rewrite; the apps are now React Native/Expo at native/ottaviano-rn, see 'Native apps — React Native (Expo) rebuild'). Single response envelope ({ data, meta } | { error: { code, message, details } }) with machine-readable error codes, the version echoed in X-Ottaviano-API, and an OpenAPI 3.1 contract at /api/v1/openapi.json GENERATED from the server Zod schemas (src/lib/api/v1/schemas.ts → one definition drives request validation, the inferred TS response types, and the published contract, so the wire shape can't drift from any of the three). It is the codegen source for the app's typed DTOs (the RN app mirrors them in src/api/types.ts; the published openapi.json drives codegen); npm run gen:openapi writes the committed docs/native/openapi.json and a test fails CI if it drifts. Public reads: GET /api/v1/locations and GET /api/v1/menu?location= (curated DTOs, prices in grosze). Operator order spine (Bearer + location-scope enforced, reusing the live order domain): GET /api/v1/orders (board, newest-first, capped), GET /api/v1/orders/:id (detail), PATCH /api/v1/orders/:id (idempotent status bump — no-op when already at target), and GET /api/v1/orders/stream (Server-Sent Events live board for KDS, header-auth, same hybrid emitter as the web admin stream). Host-portable by design — relative server URL, no Vercel-only primitives — so it survives the planned Vercel exit (ARCHITECTURE §2.1). Additive-only within v1; breaking changes mint v2.",
        },
        {
          name: "Native payments — Stripe PaymentIntent + Apple Pay",
          status:
            has("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")
              ? "live"
              : "needs-config",
          href: "/api/v1/openapi.json",
          envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
          summary:
            "POST /api/v1/orders/:id/payment-intent creates a Stripe PaymentIntent for the order's server-authoritative total (order.totalAmount grosze — client never names the amount) and returns { clientSecret, publishableKey, amount, currency } for the iOS Stripe PaymentSheet, which renders Apple Pay + cards natively (automatic_payment_methods on). Idempotent per order (idempotencyKey v1-pi-<orderId>) so a retry never double-charges; ownership-gated when a customer token is present, else the hard-to-guess order id is the gate (web-checkout trust model); 503 when Stripe unset, 409 if already paid, 404 if unknown. Settlement: the /api/webhook now handles payment_intent.succeeded → updateOrder(confirmed, paidAt, stripePaymentIntentId), guarded on not-already-paid so a hosted-Checkout payment (which emits both events) can't double-run referral qualification. Verified to the Stripe boundary (503/404/409 + reaches paymentIntents.create); real keys return the client secret.",
        },
        {
          name: "Native customer auth (phone OTP) + order create",
          status: "live",
          href: "/api/v1/openapi.json",
          envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
          summary:
            "The Ottaviano customer app's zero-friction surface (Rule #6, no passwords). POST /api/v1/customer/auth/request sends a 6-digit phone code (SHA-256 at rest, 5-min TTL, attempt-capped, double rate-limited) via the SMS provider — with no provider configured, in non-prod, the code is returned as devCode so the flow is testable; POST /api/v1/customer/auth/verify exchanges it for a CUSTOMER token pair (aud ottaviano, subject = phone) reusing the same JWT + rotating-refresh infra as operators (the refresh route branches the identity resolver on audience). GET /api/v1/customer/me returns the loyalty profile (points/tier from the live rollup). POST /api/v1/orders creates an order for a logged-in customer (phone from token) OR a guest (name+phone in body) — NEVER self-priced: it delegates to the shared createOrderFromCart (live menu lookup, bundle/combo math, delivery fee, slot-capacity claim, min-order/availability enforcement — the exact path the web checkout uses), with Idempotency-Key retry safety (a repeat returns the original order). Orders are created unpaid; Stripe/Apple Pay payment is a later increment. The customer also gets their own order history + live tracking: GET /api/v1/customer/orders (their orders by token phone, newest-first, pending included), GET /api/v1/customer/orders/:id (ownership-gated — a non-owned/missing id is a uniform 404 so ids can't be probed), and GET /api/v1/customer/orders/:id/stream (Bearer-header SSE live tracker for the order-tracker / Live Activity — the operator's KDS status bump propagates to the customer's tracker in real time through the shared in-process emitter). SMS needs Twilio; everything else works in demo.",
        },
        {
          name: "Native operator auth — JWT access + rotating refresh",
          status: "live",
          href: "/api/v1/auth/me",
          envVars: ["API_JWT_SECRET", "SESSION_SECRET", "ADMIN_PASSWORD"],
          summary:
            "Token auth for the native apps, reusing the existing admin-user / RBAC model (no parallel identity). POST /api/v1/auth/login mirrors the web login's credential resolution (shared-owner password, or email-bound user with per-user scrypt password + optional TOTP) and returns a short-lived HS256 access JWT (15 min, src/lib/api/v1/jwt.ts) + an opaque, server-stored, rotating refresh token (30 days). POST /api/v1/auth/refresh rotates on every use with reuse/theft detection (replaying a spent token burns the whole rotation family); refresh re-resolves the live user so a re-scope/disable takes effect within one access-token lifetime. POST /api/v1/auth/logout revokes; GET /api/v1/auth/me returns the current operator. Refresh tokens persist through the standard store (Postgres in prod / filesystem in dev) as SHA-256 hashes (the secret half lives only in the device Keychain). Signing secret = API_JWT_SECRET, falling back to SESSION_SECRET/ADMIN_PASSWORD so it works in demo. JWT sign/verify is unit-tested (tests/api-v1-jwt.test.ts).",
        },
      ],
    },
    {
      id: "core-systems",
      title: "Core systems (Guest Engagement)",
      items: [
        {
          name: "Guest Engagement hub",
          status: "live",
          href: "/core/guest",
          summary:
            "One surface for the relationship layer (/core/guest) with five views — Inbox (live WhatsApp conversations + order context + funnel), Guests (the CRM customer book), Loyalty (the member roster + family wallets + redemption log), Concierge (the AI capability layer + EU-14 allergen matrix) and Book (the slot+table booking console, moved here from Service). CRM, Loyalty, Concierge, WhatsApp and Booking are each their own nested route (/core/guest/{whatsapp,crm,loyalty,concierge,book}); the bare /core/guest redirects to the Inbox, and every view shares the canonical customer record, identity-merge rules and loyalty-points ledger.",
        },
        {
          name: "CRM — Regulars customer book",
          status: "live",
          href: "/core/guest/guests",
          summary:
            "System of record for every customer who leaves data — members and contacts alike. Searchable book split into Agentic (WhatsApp) vs staff-channel customers, with lifecycle / data-facet / channel / period filters, a derived relationship-health gauge (RFM + reliability), AI next-best-action, invite-to-loyalty, manual points, consent toggles (toggle = saved), email collection and notes. A 'Send today' prompt surfaces today's birthdays + first-order anniversaries (GET /api/admin/campaigns/triggers). Each profile carries a GDPR panel — Export (DSAR, Art. 15, GET /api/admin/gdpr/export) and Erase (Art. 17, owner-only, POST /api/admin/gdpr/delete). Wired to live orders + loyalty members + point adjustments via /api/admin/crm.",
          caveats:
            "Relationship-health score and next-best-action are heuristics computed from RFM + reliability, not an ML churn model. No-shows are derived from cancelled orders.",
        },
        {
          name: "Loyalty — roster, wallets & redemptions",
          status: "live",
          href: "/core/guest/loyalty",
          summary:
            "The fourth Guest-hub view (/core/guest/loyalty), rebuilt onto the clean-room Core theme. Members tab: every loyalty member with tier badge (bronze/silver/gold/platinum), point balance, order count, lifetime spend and last-order date, with name/phone search + tier-filter chips + sortable columns, and a per-member manual point adjustment (signed amount + reason → POST /api/admin/members/points). Family wallets tab: each shared pool (up to 6 phones) with member status, dissolvable by an operator (DELETE /api/admin/wallets). Redemptions tab: the burn log (who redeemed what reward, solo or wallet). Reads /api/admin/members, /api/admin/wallets and /api/admin/wallet-redemptions; shares the one points ledger with the rest of the Guest hub. The programme config itself (tier ladder, rewards catalogue, referral mechanics) is edited at /admin/growth.",
        },
        {
          name: "Customer Intelligence — per-guest behavioural graph",
          status: "live",
          href: "/core/guest/loyalty",
          summary:
            "Keystone of the Customer Identity Network (docs/strategy/restaurant-os-blueprint.md). Every member row in the Loyalty view has an Intelligence action that opens a per-guest behavioural graph derived live from real orders (no mock data): go-to dishes + category, the temporal signature in Europe/Warsaw time (the 'Friday ~18:30' pattern), visit cadence → predicted next visit + a churn-hazard assessment (low / watch / high / lost, aligned to the 90-day lapse line), conditional attach rules ('adds Tiramisù when party ≥ 4' with lift + support), channel mix, average order value, and a one-line next-order prediction headline. Pure-compute engine src/lib/customer-intelligence.ts (unit-tested, 10 cases) over getOrdersByPhone(); served by GET /api/admin/customer-intelligence?phone= (withAdmin, staff+, chain-wide per guest). Confidence is gated by order count so a thin history never over-claims.",
        },
        {
          name: "Win-back — auto-retention (Phase 2)",
          // The queue + incentive grant always work; auto-send goes live the
          // moment an SMS (Twilio) or email (Mailgun) provider is configured.
          // Until then sends degrade to a logged no-op, so introspect rather
          // than claim "live" delivery.
          status: has("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM")
            ? "live"
            : has("MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM")
              ? "live"
              : "needs-config",
          href: "/core/guest/loyalty",
          envVars: [
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "TWILIO_FROM",
            "MAILGUN_API_KEY",
            "MAILGUN_DOMAIN",
            "MAILGUN_FROM",
          ],
          summary:
            "Turns the Customer Intelligence keystone from informing into operating (blueprint Phase 2). The Win-back tab in the Loyalty view runs the intelligence engine across every guest, queues the ones whose churn hazard says they're slipping (high/lost), and ranks them by value-at-risk (hazard × lifetime spend) so comp dollars go where the money is. For each it prescribes the whole action: an incentive sized to lifetime value, the consented channel (SMS / email, respecting the per-channel opt-out flags — or flags 'needs consent'), and a message drafted from the guest's own go-to dish. Approve → the system grants the points on the real loyalty ledger (addPointAdjustment) AND sends the message on the consented channel through getSmsProvider()/getEmailProvider() (opt-outs honoured, audit-logged as comms.win_back), then logs the outreach (retention-outreach.json) so a 30-day cooldown holds. 'Send all reachable' runs the whole queue in one click — the decay-to-autonomy lever. When no SMS/email provider is configured the send degrades to a logged no-op (the incentive still applies), so it never breaks without creds; the tab shows which channels are live vs logged-only. Engine src/lib/retention.ts (pure-compute, 6 unit tests); GET/POST /api/admin/retention, manager+.",
        },
        {
          name: "Concierge — agent commerce (MCP + WhatsApp)",
          // Read capabilities (get_menu/check_availability/...) are always live
          // off the real menu, but the headline agent-commerce channel
          // (place_order / create_payment over WhatsApp) needs the channel env
          // to be more than demo mode — so introspect rather than claim "live".
          status: has("WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "ANTHROPIC_API_KEY")
            ? "live"
            : "needs-config",
          href: "/core/guest/concierge",
          summary:
            "One capability layer exposed to AI assistants over a public read endpoint and to guests over WhatsApp. Operator toggles per-capability exposure (toggle = saved) for get_menu / check_availability / get_allergens / locate_truck (served live from the real menu at /api/agent/<capability>) plus the conversational place_order / create_payment that run through the WhatsApp bot + Stripe checkout. Inspector shows the live JSON + an EU-14 allergen matrix from the real menu.",
          envVars: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "ANTHROPIC_API_KEY"],
          caveats:
            "No standalone MCP transport server yet — capabilities are served over the public HTTP read endpoint and consumed by the existing WhatsApp ordering bot. WhatsApp env vars unblock the live channel; without them the bot runs in demo mode.",
        },
      ],
    },
    {
      id: "kds",
      title: "Kitchen Display (KDS v2)",
      items: [
        {
          name: "Station routing",
          status: "live",
          href: "/core/kds",
          summary: "Per-station tickets (pizza / fryer / cold prep / drinks / expo).",
        },
        {
          name: "Fullscreen kitchen display + stage switcher",
          status: "live",
          href: "/core/kds",
          summary:
            "The floor board doubles as a wall-mountable kitchen-display appliance. A Fullscreen button takes it edge-to-edge (native Fullscreen API + a portaled overlay that escapes the admin shell per CLAUDE.md rule #4) and repaints into a dedicated always-dark, high-contrast 'kitchen OS' theme — oversized type, color-coded lanes, live wall-clock — regardless of the admin light/dark toggle, so it reads across a hot, bright kitchen. A stage switcher (All lanes · New · In prep · Ready, each with a live count) focuses one stage into a dense full-width grid or shows the three-column board. The component stays mounted across the portal, so the SSE stream, bump-bar hotkeys, sound and SLA timers keep running; Esc or the browser control exits fullscreen and drops kiosk. Decorative stat cards, the manager ops header and chef strip collapse in kiosk to maximize ticket space.",
          caveats:
            "Native fullscreen is best-effort — if the browser denies it (sandboxed iframe, kiosk policy) the immersive dark layout still applies and Esc / the Exit button leave it. Kiosk is the floor board on any viewport; on a phone the same board reflows via the responsive layout (the dedicated mobile KDS shell is retired). The owner Fleet roll-up is not a kiosk surface.",
        },
        {
          name: "Line cook view",
          status: "live",
          href: "/kitchen/krakow",
          summary: "Kitchen-session auth at /kitchen/[slug]/login.",
        },
        {
          name: "Expo / pass screen",
          status: "live",
          href: "/kitchen/krakow/expo",
          summary: "Consolidated tickets. Bump-bar hotkeys 1-9 + 0. Audible alert on SLA breach.",
        },
        {
          name: "Fire-together stagger + promised-ready SLA",
          status: "live",
          summary:
            "Longest-prep first; siblings auto-staggered. KDS surfaces T-MM:SS countdown to promised-ready next to elapsed; tone flips warning < 3 min, danger when LATE. Distinct audible chime once per ticket on first cross of 0 (separate from the new-ticket chime, mutable).",
        },
        {
          name: "KDS bump-bar hotkeys (1–9, 0)",
          status: "live",
          summary:
            "Number keys 1–9 (and 0 = 10) advance the Nth ticket in the leftmost active column — wired to the Core KDS keydown listener. No modifier required; ignored while an input/textarea is focused so admin search still works. Pairs with a USB number pad to remove ~3s of mouse hunt per bump at rush.",
        },
        {
          name: "Responsive KDS layout on phones",
          status: "live",
          summary: "The one KDS board reflows on small viewports — its lanes stack and the ticket cards go full-width with glove-friendly bump buttons. Same board, same data as desktop (the old dedicated mobile-KDS view is retired; phones now get the responsive desktop board).",
        },
        {
          name: "Per-station analytics",
          status: "live",
          href: "/api/admin/kds/analytics",
          summary: "P50 / P95 bump time per station. Manager+.",
        },
        {
          name: "Predicted-ready engine + Pace (capacity vs demand)",
          status: "live",
          href: "/core/kds",
          summary:
            "src/lib/kds-prediction.ts models every active ticket as a single-server FIFO queue per menu-category station, using real per-item prepTimeMinutes (the same basis as the promise SLA) plus the live queue depth the KDS already streams. It predicts each ticket's actual ready time and flags it AT RISK (the violet tier) when the model says the promise will be missed BEFORE the ticket is actually late. The Pace layer derives per-station capacity (units the station clears within the 15-min window at its real per-unit prep), current load (items on in-progress tickets) and forecast (queued/new tickets = incoming load); the bottleneck = max utilisation drives the truck's capacity meter. Health score = 100 − 18/late − 9/at-risk − 2·(target − promise-accuracy). Promise-accuracy + the throughput sparkline come from the kds_tickets ledger (getKdsServiceHistory: finished tickets vs promised_ready_at). Pure functions, no fabricated numbers — degrades to live-queue-only when no DB history exists. Surfaced on the owner Fleet board via GET /api/admin/kds/fleet.",
          caveats:
            "Predictions + the Pace layer compute from live orders without a DB, but promise-accuracy and the throughput sparkline need the kds_tickets history (Postgres) — they read PROMISE_TARGET (90%) and an empty sparkline until tickets have been fired and bumped. Per-ticket predictions assume one server per category (no per-station staffing model yet), so a heavily staffed station may clear faster than predicted.",
        },
        {
          name: "Pace → POS demand steering (prototype)",
          status: "live",
          href: "/api/admin/pace/steering",
          summary:
            "src/lib/pace-steering.ts turns the SAME analyzeTruck() Pace signal that paints the KDS bottleneck gauge into an actionable plan for the point of sale — the actuator end of the kitchen control loop. From the live per-station demand-vs-capacity it derives: a capacity-true promise time per station (queue depth ÷ throughput, not a flat number); a make-now set (items off the bottleneck station, ≈ free to make, ranked by contribution margin); a soft-throttle set (the lowest margin-per-bottleneck-second items that DO load the constraint — eased, never hidden); and a delivery intake cap (units the bottleneck can still absorb this 15-min window, so an aggregator dump can't detonate a hot line). Pure + deterministic, engages once the bottleneck leaves 'calm', every plan carries a human 'reason'. Unit-tested against analyzeTruck in src/lib/pace-steering.test.ts (run: npx tsx --test src/lib/pace-steering.test.ts). Served by GET /api/admin/pace/steering (staff+, per-location, real orders only — sims never steer the sell side).",
          caveats:
            "The decision module + API are wired to real data and now drive the live /core/pos Tabs terminal: the POS fetches GET /api/admin/pace/steering for the active truck and badges make-now / ease items, quotes per-category promise times on the category chips + active check, and shows the bottleneck strip + delivery-intake cap, all behind the header 'Steer' toggle (on by default). The objective is margin-per-bottleneck-second (textbook Theory of Constraints) and is not yet demand-weighted, so it eases a high-volume low-margin hero (e.g. Margherita) before a premium slow item — correct for yield-per-constraint, but a production version should weight by sales velocity. Promise times assume one server per station (same limitation as the Pace engine).",
        },
        {
          name: "Allergen surfacing + admin edit",
          status: "live",
          href: "/admin/recipes",
          summary: "EU 1169/2011 + FDA Big-9 allergens (gluten, dairy, eggs, fish, shellfish, nuts, peanuts, soy, celery, mustard, sesame, sulfites, lupin, molluscs) on each menu item. Editable from the recipe editor at /admin/recipes — tap a chip in the Dietary disclosures section to toggle. Persists through MenuOverride.allergens (seed items) or CustomMenuItem.allergens (admin-created items); `null` clears the override and the customer falls back to the kodawari seed; `[]` declares 'no major allergens' explicitly. Render surfaces: customer item-detail drawer, kitchen expo board (/kitchen/[slug]/expo), and the Core KDS ticket (the “Allergens · …” row). Not yet on the menu-card CompliancePills row — planned. The merge in getMenuWithOverrides() backfills item.allergens from src/data/kodawari.ts when no override is set, so the data path is unified for downstream consumers.",
        },
        {
          name: "Role-aware KDS — owner / manager / chef lenses",
          status: "live",
          href: "/core/kds",
          summary:
            "One live-order KDS engine, three lenses by role. OWNER lands on the Fleet command board — on desktop AND mobile (the dark fleet-command surface reflows to a single-column responsive layout on a phone, with the Fleet ↔ Floor toggle reflowing the same board to the phone): both trucks side by side on a dark fleet-command surface, each with a live health ring/score, a stat row (active / at-risk / late / ready / on-shift + a throughput sparkline), the per-truck Pace layer (covers/hr, revenue/hr, a bottleneck capacity meter, and per-station pace gauges), and a tone-sorted ticket stack with depleting SLA rings, the violet predicted-miss tier, allergen alerts and notes. A fleet command bar aggregates active / at-risk / late / ready / throughput / covers / revenue and a cross-truck promise-accuracy benchmark (per-truck bars vs target, leader-vs-lagger gap, throughput-weighted fleet mean). Header carries Refresh, a live clock, and Fullscreen (native Fullscreen API + a portaled overlay that escapes the admin shell per CLAUDE.md rule #4). Tickets advance inline (Start prep / Mark ready / Bump) through PUT /api/admin/orders; clicking a truck header drills into its floor board (sets location + switches lens). GET /api/admin/kds/fleet, owner-only, 1s live tick + 6s data refresh. MANAGER / FRANCHISEE (and an owner drilled into a truck) get the floor board plus a floor-control header: live open / late / due-soon / oldest / average-age from the active orders the board streams, with throughput (done last hour) + on-shift staff (open time-punches) + live 86 management (restore chips + '86 an item' picker) from GET /api/admin/kds/floor-ops. CHEF (kitchen / staff) get a line strip: live queue depth (tickets in queue + oldest age), and one-tap 86 of an item they've run out of (candidates are the items actually on the active tickets) + restore, via the kitchen-permitted GET/POST /api/admin/kds/eighty-six (audit-logged as menu.item_86). Every surface — the Fleet board, the floor board (desktop + mobile, which keeps its New / In prep / Ready lanes) and the fullscreen kiosk — renders the Core KDS ticket (ring timer, predicted-ready line, violet at-risk tier, allergen alert, station-grouped items) built by buildKdsTicket and toned by the same analyzeTruck predictive engine, so the cards are byte-for-byte identical across the whole KDS. The floor-ops / fleet roll-ups (promise-accuracy + throughput sparkline, from the kds_tickets ledger) and every report are real-only. Bump-time P95 reads getKdsStationAnalytics (real kds_tickets only).",
          caveats:
            "A persisted expedite / reprioritize action (pin a ticket to the top of every screen) is the remaining enhancement. Throughput counts orders completed-and-created in the trailing hour (no separate completedAt timestamp), accurate at truck prep times. The kitchen 86 endpoint can only flip availability (not edit price/menu), and every flip is audit-logged with the actor.",
        },
      ],
    },
    {
      id: "ai",
      title: "AI Operating System",
      items: [
        {
          name: "Agent HQ (editable AI agent fleet)",
          status: gatewayConfigured() ? "live" : "needs-config",
          envVars: ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "AI_DAILY_BUDGET_GROSZE"],
          href: "/admin/agent-hq",
          summary:
            "The Boardroom rebuilt as a full agent-operations console with eight sections. Command center loads in ONE aggregated request (/api/admin/ai/boardroom/command) so it renders in a single pass with no layout shift: fleet KPIs (active agents, runs today, success rate 7d, cost 7d, scheduled) + the business traffic-light KPIs (today's sales, food cost %, labour %, prime cost, avg ticket, satisfaction, refund rate, SSSG, each with a 5-section ⓘ explainer), then an org/reporting chart (click an agent to edit it), a 7-day activity chart, recent activity, upcoming work, the daily digest and month-to-date cost. Agents is a master-detail CONSOLE (left the agent list, right a working panel with three sub-tabs — Overview / Goals / Logs): Overview = run/cost/last-run/success tiles + owned KPIs + recent activity; Goals = the full inline editor where everything is set (prompts, tools, schedule, spend, KPIs) alongside the generated live system prompt; Logs = the agent's events. (Per-agent KPI target-vs-actual logging lives in Scorecards and per-agent chat in Inbox.) The whole console is responsive — the master/detail split, the stat rails and the editor's field rows stack below their breakpoints so Agent HQ and every sub-section work on a phone. Scorecards is a per-agent scorecard (status + model + authority, a 7d success-rate bar, runs 7d / cost 7d / last-run tiles, and the agent's KPIs as target-vs-actual where operators log an actual value per KPI — /scorecards GET+POST). Work is an operator-assigned board: create a task, drag it onto an agent to assign, Queued → Running → Recent, and Run it on the agent's live config (persisted in agent-work.json; runAgentWorkItem). Approvals is the human-in-the-loop queue (Action / Mark done / Dismiss transitions the decision). Inbox is escalations + chat any agent. Reports are meeting transcripts + decisions, exportable to CSV + print-to-PDF. Settings holds the FLEET-WIDE controls (so they aren't set per agent): the global AI model (Claude/Gemini, moved out of Command center), the daily AI budget (a persisted override of AI_DAILY_BUDGET_GROSZE that every run/meeting/work item is gated by — getEffectiveDailyBudgetGrosze; today's TOTAL spend — chat + meetings + scheduled + work — is summed by getTodayAiSpendGrosze so the gate and the Settings spend bar count everything, not just chat), and an auto-daily-briefing toggle + time the briefing cron honours. EVERY agent is editable end-to-end — name, role/title, status, reporting line, model, effort, authority (observer/advisor/operator), runtime managed memory, mandate, responsibilities, KPIs, guardrails & ethics, escalation threshold, tone, collaborators, tool allowlist (full role-gated registry, ·writes badges on mutating tools), spend controls (daily + per-run caps) and schedule — and the editor renders the LIVE SYSTEM PROMPT generated from those fields (exactly what it runs on); Reset-to-defaults drops the override. Edits drive runtime: the agent loop + meetings + scheduled + work runs read the resolved config (generated prompt, tools ∩ role ∩ authority, model, effort, spend caps, status). Every agent carries an escalate_to_admin lever that lands a real Inbox item + timeline entry. Overrides persist as a per-agent patch over the seed defaults (agent-configs.json), edits write a before/after audit row, and a per-agent timeline (agent-events.json) logs runs/edits/escalations/approvals/work with spend + a success flag (drives success-rate). Two crons: the daily boardroom briefing (whole board) and per-agent scheduled self-reviews by cadence (/api/admin/cron/agent-runs); the briefing self-skips when auto-briefing is turned off in Settings. The active model (Claude or Gemini) is switched in Settings. KPIs + configs render even without a key; chat/meetings/work degrade to 'needs-config'. Shares the gateway, tool registry, conversation store, and daily budget with the Ops Agent.",
          caveats:
            "Food cost %, refund rate, and SSSG are chain-wide (computed across all locations); today's sales, labour %, and satisfaction honour the location switcher. Meeting decisions are advisory until an operator approves the proposed action; 'Mark done'/'Dismiss' transition the decision so it leaves the queue. Per-agent scheduled runs require the agent-runs cron to be wired into the dispatcher (the route + runner ship here). PDF export is print-to-PDF (a print-styled window); CSV is generated client-side. /admin/boardroom redirects to /admin/agent-hq.",
        },
        {
          name: "Welcome / Morning Brief (owner landing)",
          status: "live",
          href: "/admin/welcome",
          summary:
            "The owner's post-login landing (landingPathForRole owner → /admin/welcome) — a full-bleed CEO 'morning brief' that lives under /admin but renders OUTSIDE the AdminShell (no sidebar, no nav, like the admin login door; its own route group src/app/admin/welcome/*). Built on the shared av3 design system — av3 tokens (no parallel palette), the shared Monogram avatar, the shared PLN formatters (formatPricePLN / formatPricePLNCompact in src/lib/utils.ts), and the five-section Rule #12 InfoButton on the pacing, constraint, repeat-rate and Pulse metrics. The header's truck count + open-now status come from the live DB-backed getActiveLocationsAsync + isLocationOpenNow (never hardcoded), so editing a site in /admin/locations/manage moves the count. Built as a command brief, not a recap: it leads with yesterday's close + delta and MONTHLY goal-pacing (MTD vs target with a run-rate projection + ahead/behind), then the decisions awaiting you (the AI boardroom approval queue, owners named from the agents roster), what-needs-you (unread notifications), THE CONSTRAINT (your busiest hour / throughput ceiling from 30-day order history), LEADING INDICATORS (30-day repeat rate, new customers/mo, the 14-day bookings pipeline, and the Pulse/NPS score with its 30-day trend), an AI AGENTS module (LLM spend — a closed-day view: yesterday, the trailing 30 days, and the day-over-day % change — the 'are the agents working / what do they cost' check, and the Simulation-mode dry-run receipt; no partial-current-day figure on a morning brief), an ANOMALY to copy (the location whose avg ticket most beats the chain), the per-location split, today's goal/forecast + profit-per-order, and a demoted recap. The analytics half is computed server-side in ONE pass at /api/admin/welcome (getSummary / getInsights / getOpsGoals / computeLaborEfficiencyDaily / computeHourlyThroughput / computeCohortSnapshot / getEvents + pulseBreakdown over getSurveyResponses + getAiSpendBriefGrosze, which sums the ai_messages chat ledger + off-ledger meeting/schedule/work agent-events bucketed by Warsaw midnight into yesterday / trailing-30-days / prior-day) so it can't drift from Dashboard / Reports / Calculator / Surveys / Agent HQ; the decisions + alerts come from the boardroom approvals + notifications routes. Every module is LIVE data and degrades to nothing when its source is empty or 403s — no placeholders, no fake numbers (pacing omits when no revenue goal is set; Pulse omits below 3 recent answers; a manager sees fewer panels than an owner). A one-tap 'Enter the dashboard' returns to the /admin HQ; still listed first in the Overview nav.",
          caveats:
            "The constraint is the busiest-hour throughput ceiling (a real load signal), not a fabricated capacity % or 'orders turned away' — that needs a per-station capacity model. The monthly target is dailyRevenueGoal × days-in-month (set the daily goal in the Dashboard to light pacing up). Margin is shown as profit-per-order + margin %, not a per-ingredient contribution decomposition. Pulse is the 5★-derived NPS-style score (src/lib/surveys.ts), shown with a trend only once both 30-day windows have ≥3 answers.",
        },
        {
          name: "Ops Agent (Claude / Gemini)",
          status: gatewayConfigured() ? "live" : "needs-config",
          envVars: ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"],
          href: "/admin/ai/agent",
          summary: "Conversational agent with read + write tools. Mutating actions require operator approval. Runs on whichever model the AI-model selector points at (Claude or Gemini); the model picker sits at the top of this page.",
        },
        {
          name: "AI model selector (Claude / Gemini)",
          status: has("ANTHROPIC_API_KEY") || has("GEMINI_API_KEY") ? "live" : "needs-config",
          envVars: ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"],
          href: "/admin/ai/agent",
          summary:
            "One global setting picks which model the whole AI OS talks to — Ops Agent, Boardroom chats + meetings, forecasting. Claude (Anthropic) and Gemini (Google) for now, persisted in ai-model.json and resolved by the gateway at call time, so switching providers is a single click with no redeploy. To run on Gemini you must set GEMINI_API_KEY (Claude uses ANTHROPIC_API_KEY); the picker shows each model's configured / needs-key state and a model whose provider key is missing stays selectable but surfaces a clear 'needs-config' error on use. The gateway keeps every call in Anthropic's message shape internally and translates Gemini's REST request/response — including tool (function) calls — at the boundary, so a provider switch is transparent to the agent loop and conversation store. Default: Claude Opus 4.8. Picker: Agent HQ → Settings (and the top of /admin/ai/agent).",
          caveats:
            "Cost/budget math uses each model's published per-token pricing; the Gemini path has no prompt-cache rail. Gemini requires GEMINI_API_KEY; Claude requires ANTHROPIC_API_KEY.",
        },
        {
          name: "Tool registry + audit",
          status: "live",
          summary: "21 tools incl. query_orders, query_customers, refund_order, mark_item_86, send_sms, plus the Agent HQ advisor reads (get_pnl_snapshot, get_labor_cost, get_menu_engineering, get_inventory_status, get_staff_roster, get_suppliers_and_pos, get_feedback_summary, get_marketing_settings, get_demand_forecast, get_scheduled_bundles), the gated levers update_item_price + manage_scheduled_bundle (approve/pause/cancel standing pre-orders), and escalate_to_admin (any agent can raise a flag to the human — Agent HQ → Inbox). Every call audit-logged as actor='claude:<userId>'.",
        },
        {
          name: "Daily spend budget",
          status: "live",
          envVars: ["AI_DAILY_BUDGET_GROSZE"],
          summary: `Default 1000 PLN/day. Current: ${env.AI_DAILY_BUDGET_GROSZE ? `${Number(env.AI_DAILY_BUDGET_GROSZE) / 100} PLN` : "1000 PLN (default)"}.`,
        },
        {
          name: "Insights dashboard (anomalies + reorder)",
          status: "live",
          href: "/admin/ai",
          summary:
            "Anomaly tile flags today's revenue / orders / AOV against the trailing 28-day average at ±20%. Reorder tile lists ingredients at or below reorder point with suggested PO cost.",
          caveats:
            "Anomalies are simple percentage deltas, not seasonal residuals — a low Tuesday looks the same as a low Monday. Replace with statsforecast STL when time allows.",
        },
        {
          name: "Demand forecasting (Claude-backed)",
          status: gatewayConfigured() ? "live" : "needs-config",
          envVars: ["ANTHROPIC_API_KEY"],
          href: "/admin/ai",
          summary:
            "/api/admin/ai/forecast feeds the last 60 days of orders + revenue to Claude with a structured-JSON system prompt; returns 7-day predicted_orders + 80% confidence band + 1-2 sentence operator reasoning. Cached 24h per (location, fingerprint). Source ('Claude' / 'Heuristic') is surfaced in the dashboard badge so operators can't mistake one for the other.",
          caveats:
            "Falls back to a 7-day moving average + naive projection when ANTHROPIC_API_KEY is unset or the model output is unparseable. The MA fallback is honest fallback — don't ship the forecast tile without the key if you want to call it 'AI'.",
        },
        {
          name: "Dynamic pricing suggestions",
          status: "needs-config",
          href: "/admin/ai",
          summary:
            "Margin-based price-change recommendations were sketched as a UI panel but the recommendation engine is not implemented — the tile renders an empty state. Treat as roadmap.",
          caveats:
            "Marked needs-config because no automation is wired. Removing from `live` to keep the capabilities ledger honest (audit §3 row 4).",
        },
        {
          name: "Anomaly detection",
          status: "live",
          href: "/admin/ai",
          summary:
            "Flags today's metrics that deviate ±20% from the trailing 28-day average. Surfaced as cards on the Insights → Anomalies tab.",
          caveats:
            "Heuristic, not Claude-backed. Won't separate weekly seasonality from genuine drops. Good enough for daily sanity check; not 'ML anomaly detection'.",
        },
        {
          name: "Menu engineering matrix (standalone)",
          status: "live",
          href: "/admin/menu-engineering",
          summary:
            "Dedicated, discoverable Kasavana-Smith page (no longer buried behind the simulation feature flag). Computes star / puzzle / plowhorse / dog quadrants over real order line items from computeMenuEngineering() — velocity (units sold) × per-unit gross profit, cut at the median of each. Window selector (30 / 60 / 90 / 180 days); honours the top-bar location switcher (per-location or chain-wide). Each item carries True CM1 (per-unit GP netted against payment fees + waste + refunds + loyalty burn, delivery-only items at a 27% marketplace-commission proxy), a margin-trap / spoilage-risk / prep-heavy flag, and operator role tags (HERO / DRIVER / ANCHOR). Surfaces a KPI strip, the 2×2 matrix, a margin-traps callout, and a sortable all-items table with a recommended action per row. GET /api/admin/menu-engineering?days=&location=, manager+ with per-location scope enforced by withAdmin; cached 60s.",
          caveats:
            "Quadrant cuts are median-relative to the menu in scope, so a tiny menu can put nearly everything on a boundary. Spoilage risk is a name-match heuristic (burrata / truffle / tartufata / frozen tiramisù), not a shelf-life field.",
        },
      ],
    },
    {
      id: "comms",
      title: "Customer comms",
      items: [
        {
          name: "SMS (Twilio)",
          status: has("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM") ? "live" : "needs-config",
          envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
          summary: "Falls back to logging noop when unset. Customer opt-out honoured.",
        },
        {
          name: "Email (Mailgun EU)",
          status: has("MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM") ? "live" : "needs-config",
          envVars: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM", "MAILGUN_REGION"],
          summary: "HTML receipts + lifecycle templates. PL + EN.",
        },
        {
          name: "Outbox dispatcher",
          status: "live",
          summary: "Exactly-once side effects via outbox_events. Drained by cron + on order events.",
        },
        {
          name: "Manual send from customer page",
          status: "live",
          href: "/admin/customers",
          summary: "Per-customer Send SMS / Send Email button.",
        },
        {
          name: "Web push notifications",
          status: has("VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY") ? "live" : "needs-config",
          envVars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
          summary:
            "End-to-end wired (audit §3 fix). web-push installed, sendNotification path calls the real push service. BOTH directions have an opt-in surface now: the customer order-confirmation page mounts <PushOptInButton/> (→ /api/push/subscribe, cookie = phone) for 'your order is ready 🍕', and the OttavianoKDS launcher (/operator) mounts <OperatorPushOptInButton/> (→ /api/admin/push/subscribe, admin cookie = user) so a KDS tablet/owner phone wakes on 'New order · 84 zł' / refunds / cash variance / low slots — the pushToAdmins emission was already fired from addNotification(new_order) + the order-status hooks, this adds the missing device opt-in. Both buttons surface only when VAPID is configured + the browser supports push, and self-hide once subscribed. Outbox dispatcher fans order.ready to every saved subscription per phone, prunes 404/410 endpoints. SW shipped at /public/sw.js with push + notificationclick handlers.",
          caveats:
            "Subscriptions are stored in kv_store push-subscriptions.json — fine at 2 trucks, migrate to a real table when subscription volume exceeds ~10k rows.",
        },
        {
          name: "WhatsApp ordering (Meta Cloud API)",
          status: has(
            "WHATSAPP_PHONE_NUMBER_ID",
            "WHATSAPP_ACCESS_TOKEN",
            "WHATSAPP_VERIFY_TOKEN",
            "WHATSAPP_APP_SECRET",
            "ANTHROPIC_API_KEY",
            "STRIPE_SECRET_KEY",
          )
            ? "live"
            : "needs-config",
          caveats:
            "Depends on 6 env vars — until they're all set, the channel is inert. Currently `needs-config` until the operator finishes the Meta Cloud API onboarding.",
          envVars: [
            "WHATSAPP_PHONE_NUMBER_ID",
            "WHATSAPP_BUSINESS_ACCOUNT_ID",
            "WHATSAPP_ACCESS_TOKEN",
            "WHATSAPP_VERIFY_TOKEN",
            "WHATSAPP_APP_SECRET",
            "WHATSAPP_API_VERSION",
            "ANTHROPIC_API_KEY",
            "STRIPE_SECRET_KEY",
          ],
          href: "/core/guest/inbox",
          summary:
            "LLM-driven WhatsApp Business ordering: customer messages the number, Claude walks them through menu → cart → slot → Stripe Checkout link in chat. Signature-verified Meta webhook at /api/whatsapp/webhook. The /admin/whatsapp operator console is a KDS/POS-style command surface (3-pane inbox: live conversation list · chat thread with operator reply + re-open template · context panel showing cart/order/funnel), with a fullscreen kiosk mode. The Inbox/Live/Awaiting-pay/Archived filters drive an operator-side auto-archive: a chat with no new message for `autoArchiveMinutes` (default 5) drops to Archived — console-only, so the customer's 90-min bot session/cart is untouched and a new message restores it to the inbox. The Settings overlay (WhatsAppSettingsDialog) is the advanced config hub, all wired end-to-end via WaSettings: Channel (enable, default location, daily cap), Messages (welcome, opt-out keywords, re-open template), Conversation lifecycle (auto-archive minutes), AI concierge (enable/disable + extra system-prompt instructions appended to the base prompt in lib/whatsapp/turn.ts, plus an away message sent when AI is off), and Auto-replies/scripts (keyword→canned-reply pairs matched in the webhook BEFORE the LLM). Business hours (Europe/Warsaw, per-day open/close + closed days, computed in lib/whatsapp/hours.ts) gate the bot in the webhook — outside hours the away message is sent instead of taking an order, while auto-replies still answer 24/7. Operators can also manually Pin a chat (never auto-archives, stays in the inbox) or Archive it now from the context panel; a new inbound message un-archives automatically. Switches save instantly; text fields save with the button. A Funnel button opens conversion analytics: real stage instrumentation (started → location → cart → fulfillment → slot → pay-link → paid) emitted from the bot pipeline (first-touch in the webhook, stage transitions diffed in lib/whatsapp/turn.ts, paid from the Stripe webhook) into an appendWaFunnelEvent log, aggregated cumulatively per phone (a later stage counts toward earlier ones, so drop-off is monotonic and a missed intermediate event never breaks the funnel) over 7d/30d/all via GET /api/admin/whatsapp/funnel. Abandoned-cart recovery (opt-in, Settings → Abandoned-cart recovery): when a customer builds a cart but doesn't pay, a record is upserted in the turn loop (persisted beyond the 90-min session) and cleared on paid (Stripe webhook) or escalation; the daily cron /api/admin/cron/whatsapp-abandoned-cart (registered in the dispatcher) sends the Meta re-open template once to carts idle ≥ delayHours and under 4 days old, marking each notified so customers are never spammed. Self-skips when disabled or no template is set. Broadcast campaigns (Broadcast button): send an approved Meta template to an opted-in customer segment — audience filters computed live from the customer rollup (all / active 60d / lapsed 90d+ / VIP ≥200 zł & ≥6 orders / new 14d), always excluding smsOptout + phoneless. POST /api/admin/whatsapp/broadcasts snapshots the audience into a campaign (capped 5000); the UI drives batched sends (25/tick) via /broadcasts/[id]/send with a live progress bar, and a daily /api/admin/cron/whatsapp-broadcast-drain backstop finishes any campaign left mid-send. Audit-logged on create. Scripted flows (Settings → Scripted flows): operator-authored deterministic sequences — a customer message containing the trigger word starts the flow (sends step 1) and each reply advances one step until the steps run out. Runs ahead of the LLM in lib/whatsapp/flows.ts (independent of the AI toggle), with per-session state on WaSession.activeFlow; replies are captured in the transcript. Great for feedback or info sequences without burning model calls.",
        },
      ],
    },
    {
      id: "ordering",
      title: "Customer ordering",
      items: [
        {
          name: "Stripe checkout",
          status: has("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") ? "live" : "needs-config",
          envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
          summary: "Hosted-checkout session creation with idempotency key. Webhook reconciles to order on success.",
        },
        {
          name: "QR in-restaurant ordering",
          status: "live",
          href: "/qr",
          summary:
            "Standalone table-ordering surface at /qr?location=<slug>&table=<n> (the qr.<domain> subdomain until DNS is wired). A seated guest scans the QR, browses the location's real menu (available, non-delivery-exclusive items), and pays. Checkout posts to /api/checkout with channel='qr' — createOrderFromCart runs in immediate dine-in mode: no time-slot booking, synthesises slot fields from now, and seats the order at the scanned table (matched by FloorTable.number, else the Floor Twin's best-fit pick). The order is a real dine-in Order (channel='qr', tableId set, partySize) that flows to KDS and the core POS QR queue. Pays through the enabled methods (Stripe session driven by /admin/payments) or demo mode. Verified end-to-end: a scan of table 12 creates a dine-in order seated at that table.",
        },
        {
          name: "QR ordering controls",
          status: "live",
          href: "/admin/qr-ordering",
          summary:
            "Operator control over the /qr table-ordering surface (qr-ordering-settings.json, GET/PUT /api/admin/qr-ordering, toggle = saved): a chain-wide master switch, per-location overrides (dark-launch / pause one restaurant), require-a-scanned-table-number, and show-prices. The /qr page reads isQrOrderingEnabled() + these options server-side per request, so a toggle gates ordering on the next scan — when off, guests see an 'order with a member of staff' message instead of the menu.",
        },
        {
          name: "POS QR-order queue (core)",
          status: "live",
          href: "/core/pos",
          summary:
            "The core POS sub-header carries a QR pill that surfaces incoming QR table orders (channel='qr') for the location — table number, guest, party size, line items, total and paid/unpaid status — polling /api/admin/pos/qr-orders every 8s. 'Mark paid' settles an order (POST … action=settle → updateOrder sets paidAt and fires a demo-mode pending order to the kitchen by flipping it to confirmed; audited pos.qr_settle). The dialog's 'Print table QR' tab generates a printable per-table QR (SVG from /api/admin/qr-code, encoding <origin>/qr?location=&table=). Keeps the single Order as the source of truth — no duplicate tab. Verified end-to-end: a QR order listed unpaid/pending settled to paid/confirmed.",
        },
        {
          name: "Notifications center (core)",
          status: "live",
          href: "/core/pos",
          summary:
            "A notifications bell in the core shell command bar (every surface) over the real notifications store. Polls /api/admin/notifications?count=true every 20s for the unread badge; opening the dropdown loads the list (new_order / low_stock / low_slots / slot_full / bundle_low_margin / dispute / order_status / daily_summary) with type-coloured dots, relative timestamps, and per-item + Mark-all-read (PUT /api/admin/notifications). Verified: unread count + the live 'New QR table order' notifications surface in the panel.",
        },
        {
          name: "Orders surface (core)",
          status: "live",
          href: "/core/orders",
          summary:
            "A dedicated core surface (5th nav tab) for every order at the location — live and paid history — so staff aren't limited to the POS's open tickets. Reads /api/admin/orders (all orders) + /api/admin/floor/tables (table numbers), polled every 15s. Scope tabs (Current / Paid / All), a channel filter (QR / Web / WhatsApp / POS), and search over id / guest / phone / table; a KPI strip (orders today / current / to pay / paid today zł); and a detail dialog with the full ticket + a Mark-paid action (POST /api/admin/floor/orders settle). Verified: 38 orders list with filter + search + settle.",
        },
        {
          name: "Payment methods manager",
          status: "live",
          href: "/admin/payments",
          summary:
            "Operator toggles which tender methods guests see at web checkout + QR ordering — Card (Visa/Mastercard), Apple Pay, Google Pay, BLIK, Przelewy24 (all settled through Stripe) and Bitcoin (off-Stripe pay-to-address). Persisted to payment-settings.json (GET/PUT /api/admin/payments, toggle = saved). The enabled set drives the Stripe session's payment_method_types (getEnabledStripeMethods — Apple/Google Pay fold into the card rail), and is exposed to the storefront/QR via /api/settings/public. Bitcoin shows the operator's receiving address and leaves the order unpaid until confirmed in POS.",
        },
        {
          name: "Customer identity (phone-based)",
          status: "live",
          summary: "Auto-enrolment on checkout via the sud-italia-customer cookie + /api/customer/identify. No password.",
        },
        {
          name: "Three ordering modes (takeout / delivery / dine-in)",
          status: "live",
          href: "/core/service/slots",
          summary:
            "Cart drawer offers Takeout, Delivery, and Dine-in. Dine-in is reserve-a-table-and-pre-choose-food: the customer sets a party size, picks a time slot (the booking time), and the cart is the food prepared for when they sit down. Party size persists on the order (Order.partySize) and surfaces on the order tracker, KDS ticket, and admin order detail. A mode only shows time slots the operator has opened for it — enable dine-in slots at /core/service/slots by ticking the Dine-in fulfillment type. Reports + the channel-mix pie split orders three ways.",
        },
        {
          name: "Customer order history",
          status: "live",
          href: "/api/orders/history",
          summary: "Phone-scoped lookup of past orders. Powers the reorder flow.",
        },
        {
          name: "Group orders / Family wallet",
          status: "live",
          href: "/rewards",
          summary: "Pool loyalty points across up to 6 members. Head invites; redemption caps per role.",
        },
        {
          name: "Cart presence (live → kitchen)",
          status:
            env.NEXT_PUBLIC_ENABLE_CART_PRESENCE === "false"
              ? "disabled"
              : has("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN")
                ? "live"
                : "needs-config",
          envVars: [
            "NEXT_PUBLIC_ENABLE_CART_PRESENCE",
            "UPSTASH_REDIS_REST_URL",
            "UPSTASH_REDIS_REST_TOKEN",
          ],
          summary: "Anonymous cart snapshots stream to KDS so the line sees demand forming. TTL'd in KV.",
        },
        {
          name: "Live menu availability",
          status: "live",
          href: "/api/menu/availability",
          summary: "Real-time 86 flips reach the menu page without reload via the useLiveMenuAvailability hook.",
        },
        {
          name: "Abandoned-cart recovery",
          status: "live",
          summary: "Cart state persists via the Zustand store; AbandonedCartBanner surfaces 'finish your order' on return.",
        },
        {
          name: "Embedded chatbot widget",
          status: "live",
          summary: "Customer-side FAQ widget on the location pages. Content is sourced from the Chatbot FAQ admin below.",
        },
        {
          name: "“Surprise Me” recommendation",
          status: "live",
          summary: "AI-picked dish on the location page based on order history + preferences.",
        },
        {
          name: "Seasonal items (per location)",
          status: "live",
          href: "/admin/settings",
          summary: "Time-limited menu items configured in loyalty settings; surfaced via /api/settings/public.",
        },
        {
          name: "Customer feedback collection",
          status: "live",
          href: "/admin/feedback",
          summary: "Post-order 1–5 rating + comment with sentiment analysis. Optional loyalty points for completion.",
        },
        {
          name: "Pulse micro-surveys (NPS)",
          status: "live",
          href: "/admin/surveys",
          summary:
            "NPS-style 1–5★ one-tap micro-surveys captured opportunistically across the storefront. A client trigger engine (src/store/survey.ts + SurveyTriggerEngine) fires on real browsing signals — after ordering (order-confirmation), prolonged browsing (~70s on a location page), exit intent (desktop), the rewards page, and returning visitors — and SurveyPrompt renders the elected star prompt (portalled, dismissible). Restraint is built in: at most one prompt per session, an 8h cross-session gap, and a per-survey cooldown. Answers POST to /api/surveys (rate-limited 5/min per IP + phone, parity with feedback) and persist to the dedicated indexed survey_responses Postgres table (dual-write, with a JSON fallback for local dev) — same pattern as feedback. Operators manage a 12-survey catalogue at /admin/surveys — flip any live (toggle = saved), read the Pulse score (NPS computed from 5 stars), rating distribution, per-trigger volume, and every detractor comment. Active surveys ship to the storefront via /api/settings/public; the whole feature is gated by the showNpsSurvey Layout toggle.",
        },
      ],
    },
    {
      id: "growth",
      title: "Growth & retention",
      items: [
        {
          name: "Loyalty points",
          status: "live",
          href: "/core/guest/loyalty",
          summary: "Order-based + manual adjustments. Tier upgrades trigger push + email. The roster, family wallets, and redemption log live in the Core Guest Engagement hub (/core/guest/loyalty); the programme config itself (tier ladder, rewards catalogue, referral mechanics) is edited at /admin/growth.",
        },
        {
          name: "Referral codes",
          status: "live",
          href: "/admin/growth",
          summary: "Per-customer codes embedded in receipts. Referrer-points + referee-PLN-off values + the active toggle all live on LoyaltySettings.referral — edit at /admin/growth → Referrals; shipped to customer surfaces (/rewards) via /api/settings/public as `loyalty.referral` (null when the operator disables the programme, which hides the Give/Get card entirely). No hardcoded fallback — disable = no surface.",
        },
        {
          name: "Upsell engine",
          status: "live",
          href: "/admin/upsell",
          summary: "Tiered bundle ladders (Lunch + Family Feast) — good-better-best upgrades surfaced in the cart drawer. Settings + gating rules at /admin/upsell.",
        },
        {
          name: "Cross-sell engine",
          status: "live",
          href: "/admin/crosssell",
          summary: "Cart-context complementary-item suggestions (espresso + dessert with pizza), combo deals, time-of-day banners, and the consolidated Menu badges editor (Hero / Pizzaiolo's Choice / Chef's Signature / Popular / Staff Pick / New) — every editorial chip surfaced on the admin menu list and customer cards is managed here. Settings at /admin/crosssell.",
        },
        {
          name: "Add-to-cart toast",
          status: "live",
          summary: "Inline 4s toast fires whenever an item is added on the location page: '<item> added. Customers usually add a/an <suggestion>.' Seed copy comes from the same getCartSuggestions() rules the cart drawer uses, so the recommendation matches what the customer sees on open. Portal-mounted, non-blocking. Audit §2.1 T+0.",
        },
        {
          name: "Complete-the-meal chips",
          status: "live",
          summary: "3-up tap-to-add grid above the cart subtotal. Margin-ranked: espresso first (83% GM × 60% attach), then tiramisu, then a non-coffee drink. Explicit × badge for removal — body of an added chip is non-interactive. Audit §2.1 + §2.4.",
        },
        {
          name: "Time-of-day banner",
          status: "live",
          href: "/admin/crosssell",
          summary: "Cart top banner that picks one of five hour-window variants (morning pre-order, lunch combo, afternoon espresso, dinner pairing, late espresso & dessert) based on local clock. Editable per location at /admin/crosssell → Time-of-day: variant, hour window, title, sub, badge, CTA, optional add-item id suffix, active toggle. Empty admin list = the five hardcoded DEFAULT_TIME_WINDOWS in upsell.ts. Audit §2.3.",
        },
        {
          name: "Per-segment delivery threshold",
          status: "live",
          summary: "Free-delivery bar shows a personalised threshold tuned to the customer's lifecycle: first-time 39 PLN, growing (2–4 orders) 49 PLN, regular (5+) 59 PLN, Gold/Platinum 35 PLN (audit §3 — raised from 0 because VIPs were getting free delivery on 6.90 zł bottles of water, breaking unit economics on a 9 zł courier run). The checkout fee charge uses the same threshold via computeDeliveryFee(_, _, thresholdOverride, feeOverride) and getCustomerSegment(), so the bar and the receipt agree. As of Phase 8b the flat-fee charged when a cart is below the threshold also comes from AppSettings.deliveryFee (was previously hardcoded 7 PLN regardless of /admin/settings); the cart drawer reads it off /api/settings/public.deliveryFee and server-side checkout pulls it from getSettings() — single source of truth at all three call sites.",
        },
        {
          name: "Delivery-exclusive SKUs + Pantry Pack bundle",
          status: "live",
          summary: "Three delivery-only SKUs per truck (audit §3 channel economics): Frozen Tiramisù Box (24/28 zł, ~600g serves 4), Peroni Nastro Azzurro 4-Pack (32/36 zł), Ottaviano EVOO 250ml (35/39 zł). Each carries deliveryOnly:true on MenuItem so the menu page filters them out for dine-in/takeout carts. Delivery-only Pantry Pack bundle composes pizza + frozen tiramisù + beer + olive oil at 15% blended discount — surfaces only when fulfillmentType=delivery. Drives high-AOV pantry pulls customers can't carry from a truck.",
        },
        {
          name: "Per-item packaging cost",
          status: "live",
          summary: "MenuItem.packagingCost field captures per-unit delivery packaging in grosze (pizza boxes 180, pasta trays 250, antipasti containers 150, panini wraps 80, drinks 60, desserts 100). totalPackagingCost(cart, fulfillmentType) sums across the order; the bundle low-margin alert + delivery profitability report use it so reported delivery margin reflects boxes + napkins + carrier bag, not naked plate cost. Reverses ~6–10 pp of margin drag previously hidden from the dashboard.",
        },
        {
          name: "KDS ticket complexity scoring",
          status: "live",
          summary: "computeTicketComplexity(cart) returns a weighted score (pizza 1.0 / pasta 0.8 / antipasti 0.6 / panini 0.5 / desserts 0.4 / drinks 0.15) summed across qty, plus distinct station count. score ≥ 6 marks the ticket as 'complex' — KDS expo screen surfaces a PRIORITY badge and the line can fire longest-prep items first. Family Feast tickets (typically 9–15 lines across 4 stations) automatically land top-of-screen during the 7pm rush.",
        },
        {
          name: "Master + variants menu (chain-wide list, per-location detail)",
          status: "live",
          href: "/admin/menu",
          summary:
            "Menu admin is chain-wide. The /admin/menu list renders one row per product (no per-location chips, no location switcher) — values that diverge across trucks surface as a compact range (e.g. 27,90–29,90 zł) plus a 'varies' badge so operators can scan at a glance which SKUs price unevenly. Clicking edit opens /admin/menu/[baseSlug], a dedicated detail page split into three stacked cards: (1) per-location pricing — inline price + cost inputs per truck, availability toggle, hide / remove / add buttons, plus 'Apply price to all' and 'Reset overrides' quick actions; (2) chain-wide product fields (name, description, category, tags, SKU, delivery-only, packaging cost); (3) modifier editor — group structure (label, min/max, option labels, KDS flag) propagates chain-wide while each option's priceDelta + costDelta are edited one truck at a time via a location lens at the top of the card. Each option row shows the active lens' price + cost plus an \"Across chain\" chip surfacing the spread when other trucks diverge (5,00–7,00 zł) and a \"→ all\" button that fans the active price out everywhere. The lens replaces an earlier side-by-side matrix that stopped scaling past ~5 locations — the lens form holds steady at 20+ trucks because the rendered surface stays at one column regardless of fleet size. Saves route per-variant: seed rows batch through PUT /api/admin/menu items map (modifierGroups round-trip per row); custom rows hit PATCH /api/admin/menu/custom; newly-added locations POST through /api/admin/menu/custom and inherit the canonical modifier structure with the first location's prices as the starting deltas. Scales cleanly to 20+ locations because the list view never enumerates them inline — the detail page is the only surface that does, and both per-location tables (base price + modifier pricing) are scrollable.",
        },
        {
          name: "Tartufata Reale top anchor SKU",
          status: "live",
          href: "/admin/menu",
          summary: "NEW menu item: Tartufata Reale at 79.90 / 89.90 PLN (audit §3 — the Pizza del Pizzaiolo at 49.90 wasn't tall enough to anchor the menu, only +37% above the most expensive standard. Tartufata is +120%, properly bending price perception). Truffle + burrata di Andria + prosciutto DOP + 24-month Parmigiano. Marked menuRole=\"anchor\" so it's excluded from bundle category-slot resolution (can't be folded into discounted bundles where it would either lose margin or distort customer perception of bundle value).",
        },
        {
          name: "Complete-your-meal four-slot panel",
          status: "live",
          href: "/admin/crosssell",
          summary: "Fixed four-slot horizontal slider above the cart subtotal (audit §3 product update). Slots in order: Coffee → Dessert → Side → Drink. Default SKUs: Espresso, Tiramisù, Garlic Bread, Limonata. Each slot is admin-configurable in /admin/crosssell → Cart pairings (preferredCoffee / preferredDessert / preferredGarlicBread / preferredDrink on LocationUpsellConfig). Chips stay visible after the customer adds — tapping again increments the same cart line via addItem's same-id qty bump, and an in-cart green ×N badge surfaces the running count. Replaces the previous 3-chip context-dependent suggestion engine (dynamic rules removed: Make-it-2, pizza-only garlic-bread, pasta-only antipasti, only-drinks-suggest-pizza, sub-40-default-Panna-Cotta). Operators retune the panel without code — change the configured SKU and the slot swaps to whatever they pick (Burrata as the Side, Bufala as the Coffee replacement, etc.).",
        },
        {
          name: "Garlic Bread side attach",
          status: "live",
          href: "/admin/menu",
          summary: "NEW menu item: Garlic Bread at 9.90 / 10.90 PLN, 78% GM (audit §3). Replaces panini in the pizza-attach cross-sell hierarchy — garlic bread has higher organic attach than panini and serves as the highest-margin lunch lead. Cross-sell rule 1.5 surfaces it on pizza-only carts before suggesting dessert. Pairs with the Pizza & Side combo (any pizza + garlic bread, 12% off).",
        },
        {
          name: "Pizza-led lunch ladder",
          status: "live",
          href: "/admin/upsell",
          summary: "Audit §3 — Neapolitan pizza brand previously had pasta-only lunch bundles. NEW parallel pizza ladder: Pizza Solo (Personal 8\" Margherita + water, 22.90 zł), Pizza Lunch (any pizza + drink + Panna Cotta, 39.90, default), Pizza Lunch+ (any pizza + drink + Tiramisù, 44.90, anchor). Customer cycles between pasta + pizza ladders via the period switcher in the bundle drawer.",
        },
        {
          name: "Pizza Family Pack (fixed-price)",
          status: "live",
          href: "/admin/upsell",
          summary: "NEW family-tier bundle (audit §3) — 3 Margheritas + 1L Limonata at flat 99 PLN. Set price, no maths. Dominates the dynamic family ladder for couple/quad orders where customers want the simplest possible bundle. Default-pushed so it's the first thing the family ladder surfaces. Per-item composition uses suffix slots so both trucks resolve.",
        },
        {
          name: "Late-night slice + party tiers",
          status: "live",
          href: "/admin/upsell",
          summary: "Audit §3 — late-night was a single tier (Late dinner, 22%). Expanded to a real ladder: Slice + drink at 16.90 zł (captures 1AM post-club demographic via the new Margherita slice SKU reheated in 60s), Late dinner (default 20%), Late Party (anchor 28%, 2 pizzas + 4 drinks + 2 desserts — group-of-4 capture). All gated 21:00–24:00 local. Pairs with the new Margherita Personale 8\" + Slice menu SKUs that didn't exist before.",
        },
        {
          name: "Espresso reprice + cost basis",
          status: "live",
          summary: "Audit §3 — single highest-leverage change in the system. Espresso re-priced from 7.90 → 9.90 zł (Kraków) and 8.90 → 10.90 zł (Warszawa) to align with speciality-café benchmarks (Tektura, Karma, etc. at 11–14 zł). 60% attach rate × +2 zł = ~PLN 25-30k/year/truck of pure margin previously declined. Highest-margin SKU at 85%+ GM. Default upsell chip + #1 cross-sell rule already pushes it on every pizza/pasta cart.",
        },
        {
          name: "Loyalty rewards reshape",
          status: "live",
          href: "/admin/growth",
          summary: "Audit §3 — removed the strictly-dominated 'PLN 10 Off' reward (100 points → 10 zł value vs Free Drink at 50 pts → up to 11.90 zł — customers spot the bad ratio and avoid it, dragging perceived loyalty value). New ladder: Free Drink 50pts, Free Garlic Bread 70pts, Free Dessert 120pts, Free Personal Pizza 180pts, Free Pizza 280pts, 25 PLN Off 280pts. No rung is strictly dominated by another (each unlocks a different category or threshold). Value-per-point declines as customers save up — that's intentional save-up incentive economics, with the higher rungs (Free Pizza, 25 zł Off) acting as aspirational targets while the 50-pt entry stays attractive for fast redeem.",
        },
        {
          name: "Contextual pairing graph",
          status: "live",
          summary: "Cart upsell chips re-rank by composite score combining margin × attach, hour-of-day bias (espresso 0.82 at 11:00, 0.31 at 19:00), per-customer attach history (`you added it 3 of last 4 visits`), and a small novelty decay so chips rotate. Pure scorePairing() in upsell.ts; cart drawer feeds context via /api/customer/attach-history. Audit §3.1.",
        },
        {
          name: "Per-customer ML upsell ranker",
          status: "live",
          href: "/admin/upsell",
          summary: "Logistic-regression cross-sell ranker trained on REAL orders (audit elite-qsr §1) — no hardcoded weights. src/lib/ml-upsell.ts builds a leakage-controlled training set (one example per anchor-order × attach-candidate; per-customer attach features use only prior orders), fits weights by gradient descent over 7 learned features (personal attach rate, has-ordered, global attach rate, category×hour attach, item margin, tenure, new-customer flag), and ranks candidates by expected contribution (P(attach) × margin). POST /api/admin/ml-upsell/train pulls getOrders for the window + getMenuWithOverrides per location and persists per-location models (ml-upsell-models.json); GET returns model status (trainedAt, sampleCount, positiveRate, logLoss). Cold-start locations (<200 examples) are skipped → rules ranker stays in use. Inference: the cart POSTs to /api/customer/upsell-rank, which deterministically phone-buckets the customer into the ML arm when their bucket falls under the location's mlUpsellRolloutPct (the same hash is reproducible from any order's phone, so ML-vs-rules arms can be compared retroactively without storing assignments) and returns the model-ranked candidate ids; the cart orders the .v8-cart-pairs rail by them, falling back to the rules getCartSuggestions for the control arm / cold-start / untrained locations so cross-sell can never break. Operated from /admin/upsell → Cross-sell intelligence (MLUpsellPanel): model status, Train now, the rollout-% slider, AND a live ML-vs-rules comparison — /api/admin/ml-upsell/compare recomputes each order's arm from its phone (shared inMlArm bucket, window clamped to the model's trainedAt so ML-arm orders genuinely saw the ML ranker) and runs attach rate (two-proportion) + AOV (Welch) through the significance engine, surfacing per-arm orders/attach/AOV, lift, p-value, and a decision (ML winning / worse / collecting / no diff.). Arms are reproducible from the deterministic hash, so this needs no per-order assignment log (assumes a stable rollout over the window). 17 unit tests cover separation, no-leakage construction, recovery of a synthetic per-hour preference, deterministic bucketing, and the arm comparison.",
        },
        {
          name: "Bundle architecture (Lunch / Family / Late-night)",
          status: "live",
          href: "/admin/upsell",
          summary: "Restructured May 2026 (revenue-audit-5jrVU). Four parallel ladders: (1) pasta-led lunch [Solo 27.90 → Lunch 38.90 → Lunch+ 44.90 → Big Lunch 68.90 decoy], (2) pizza-led lunch — NEW — [Pizza Solo 22.90 → Pizza Lunch 39.90 → Pizza Lunch+ 44.90, hits the hero product], (3) family [Pizza Family Pack fixed 99 zł — NEW — → Family 18% → Family Feast 22% anchor → Feast Deluxe 25% true decoy gated at 6 mains], (4) late-night [Slice + drink 16.90 entry — NEW — → Late dinner 20% default → Late Party 28% anchor — NEW]. Family minimum raised 2→3 (couples were being padded into bundles), Feast Deluxe discount lifted to true scale-economics offer that only dominates at 6+ mains. Hungry tier rebuilt as a true decoy (savings % below Lunch+ so dominance theory works). Anchor SKUs (Tartufata Reale 79.90/89.90, Pizza del Pizzaiolo 49.90/54.90) excluded from category-slot resolution so they can't be folded into discounted bundles. Channel-aware: delivery-only Pantry Pack bundle (frozen tiramisù + Peroni 4-pack + olive oil) surfaces only when fulfillmentType=delivery. Member-only tier visibility flag drives phone collection as conversion lever. Server caps charged amount at min(server-recomputed, client-snapshot). Combo banner suppressed when bundle ladder showable. Audit §3.",
        },
        {
          name: "Bundle experimentation (A/B) + significance ledger",
          status: "live",
          href: "/admin/upsell",
          summary: "Full A/B harness + significance ledger, manageable in /admin/upsell → Experiments tab. ExperimentEditor defines one per-location experiment with weighted variants + per-bundle discount overrides (single percent OR split mains/add-ons), a lifecycle (draft → running → stopped, with start/stop + startedAt/stoppedAt), a control variant, and a primary metric (contribution / AOV / conversion). Customer phone → SHA-256 bucket → stable variant assignment; assignment runs only while status is `running` (isExperimentLive). Server reproduces the variant at checkout. Each BundleEvent records the variant id; /api/admin/bundle-analytics rolls up per variant: conversion (applies ÷ funnel impressions), avg paid, avg contribution (finalPrice × marginRatio), and a significance verdict vs control — relative lift, p-value, and a decision (collect_more / winner / loser / no_difference) from the tested, pure src/lib/experiment-stats.ts engine (two-proportion z-test, Welch means, power-based required-n). BundleAnalyticsCard on Reports surfaces the verdict; the operator promotes a winner from the Experiments tab, which copies its overrides into the live bundles, stops the experiment, and records a result snapshot. Server resolver in src/lib/experiments-server.ts; client mirror via Web Crypto SHA-256 so client + server agree.",
        },
        {
          name: "Bundle scarcity + weekday gating",
          status: "live",
          href: "/admin/upsell",
          summary: "Every dynamic bundle row in /admin/upsell carries a 'Limited until' date input + a per-weekday chip selector (Mon–Sun). Past-dated bundles auto-deactivate; weekday-gated bundles only surface on matching local days so operators can run Friday Family Feast pushes / Wednesday Lunch+ defaults without code. Both fields validate server-side and round-trip through saves.",
        },
        {
          name: "Delivery address autocomplete",
          status: "live",
          envVars: ["ADDRESS_AUTOCOMPLETE_GOOGLE_KEY"],
          summary: "Server-proxied autocomplete on the delivery address field (/api/address/autocomplete, rate-limited, key server-side). Uses Google Places when ADDRESS_AUTOCOMPLETE_GOOGLE_KEY (or GOOGLE_MAPS_API_KEY) is set, else falls back to free OSM Nominatim biased to Poland + the truck's city — so it works with no key. Field stays free-text; a failed lookup never blocks checkout.",
        },
        {
          name: "Post-order upsell (confirmation page)",
          status: "live",
          href: "/order-confirmation",
          summary: "'Complete your meal' cross-sell on the order-confirmation page via /api/upsell/post-order — runs the same getCartSuggestions() engine as the cart, seeded with the just-placed order and filtered to additive items. Adding one drops it into the cart and offers a one-tap checkout for a quick follow-on order. Operator-gated by the showPostOrderUpsell layout toggle.",
        },
        {
          name: "Bundle conversion funnel telemetry",
          status: "live",
          href: "/admin/reports",
          summary: "Client beacons (navigator.sendBeacon) capture impression → composer_opened → composer_abandoned events as customers interact with the bundle ladder. Combined with the applied events written by createOrderFromCart, BundleAnalyticsCard shows the full funnel: how many customers see the ladder vs tap into the composer vs confirm vs abandon. Drives 'no-one-sees-it' vs 'no-one-likes-it' diagnosis. Endpoint: POST /api/customer/bundle-funnel; persistence in bundle-funnel.json.",
        },
        {
          name: "Bundle KPI dashboard (new vs repeat + cohort)",
          status: "live",
          href: "/admin/reports",
          summary: "BundleAnalyticsCard on Reports surfaces bundle orders, revenue, total savings given, anchor conversion %, decoy CTR, per-bundle effective discount + avg mains, A/B variant uplift, conversion funnel, AND a new-vs-repeat-customer cohort split (target ≥25% new-customer share among bundle orders proves acquisition role). Slot links persisted per BundleEvent for follow-up capacity analysis.",
        },
        {
          name: "Bundle value feedback (voice-of-customer)",
          status: "live",
          href: "/admin/reports",
          summary: "Post-receipt thumbs up/down on every bundle order — the one signal the bundle audit log can't capture (what the customer thought of the value). BundleFeedbackPrompt on /order-confirmation self-gates to bundle orders (GET /api/customer/bundle-feedback?orderId=), records an upsert-by-order rating (POST same route; bundle id/name/location resolved server-side from the BundleEvent so it can't be spoofed), persisted to bundle-feedback.json. BundleAnalyticsCard's 'By bundle' table shows the 👍/👎 split per bundle and amber-flags ≥20% thumbs-down on ≥5 ratings so a high-converting-but-disliked bundle (a profit centre burning brand equity) is caught before it surfaces as a one-star review.",
        },
        {
          name: "Refund × bundle correlation",
          status: "live",
          href: "/admin/reports",
          summary: "Joins Order.refund to bundle orders by id (audit elite-qsr §3) so the operator can see if a bundle refunds at a higher rate than à la carte — usually a sign it forces items the customer didn't want. /api/admin/bundle-analytics matches each BundleEvent's orderId against refunded orders in the window and rolls up refund count + rate + the most common reason (RefundReasonCode) per bundle, and refund rate per A/B variant. BundleAnalyticsCard's 'By bundle' table shows a Refunds column (count + %, top reason on hover) amber-flagged at ≥8% on ≥5 orders; the per-variant refund rate rides the A/B significance table. Builds on the existing refund capture (reasonCode enum + manager-approval comp cap). Refund cost is current-cost; distributor-attributed historical cost still needs the per-line cost snapshot.",
        },
        {
          name: "Bundle low-margin operator alert + save-time guardian",
          status: "live",
          href: "/admin/upsell",
          summary: "Two-stage margin protection sharing one BUNDLE_MARGIN_FLOOR (40%, in src/lib/bundles.ts). (1) Save-time guardian: pressing 'Save changes' in /admin/upsell pre-computes every active bundle's worst-case contribution margin across the dirty locations (worstBundleMargin in src/lib/bundle-margin.ts — same sampler as the editor's live preview, against each location's live menu) and blocks on a confirm listing each tier below the floor before persisting, so an underwater discount is caught at save, not one order later. (2) Post-order alert: every bundle order's margin is computed at write time (MenuItem.cost ÷ finalPriceGrosze); below the floor, addNotification posts a `bundle_low_margin` alert into the operator inbox with bundle name + exact margin % + order total. All three margin signals (guardian, post-order alert, editor preview tones) read the same floor so they can't disagree.",
        },
        {
          name: "Composer 'same as last time' (repeat-customer one-tap)",
          status: "live",
          href: "/admin/upsell",
          summary: "Bundle composer (Domino's Mix & Match) pre-fills picks from the customer's most-recent applied composition for the same bundle. Customer sees a ★ banner 'Same as your last X — confirm or tweak below' so a repeat order is one tap. Pipeline: BundleEvent.addOnComposition (persisted per order), GET /api/customer/last-bundle, BundleComposer mount fetch. Drops the perceived friction Domino's reports a ~7% AOV uplift from.",
        },
        {
          name: "Scheduled bundle (weekly usual)",
          status: has("STRIPE_SCHEDULE_WEBHOOK_SECRET") ? "live" : "needs-config",
          href: "/admin/scheduled-bundles",
          summary: "Pret-style 'make this my weekly usual' intent capture + manageable admin queue. Customer opts in via a 🗓️ checkbox under the cart pay-bar when a bundle is applied; POST /api/customer/schedule-bundle persists a ScheduledBundleIntent (bundle id, weekday, ready-time, cart snapshot, status). Operator manages the queue at /admin/scheduled-bundles — filter by status (pending / active / paused / cancelled), see customer phone + bundle + day-time, approve / pause / resume / cancel via PATCH /api/admin/scheduled-bundles/[id]. Sorted by weekday × ready time so it mirrors the day's fulfilment cadence. Phase-2 Stripe Subscription rebill on the chosen weekday is gated on STRIPE_SCHEDULE_WEBHOOK_SECRET; until configured, operators run the recurring fulfilment manually from the queue.",
          envVars: ["STRIPE_SCHEDULE_WEBHOOK_SECRET"],
        },
        {
          name: "Stripe coupon reuse (combo discounts)",
          status: "live",
          href: "/admin/crosssell",
          summary: "Combo-discount Stripe coupons used to spawn one new Coupon object per checkout, accumulating thousands of orphans in the Stripe account over time. Coupons now use stable ids `sud-<combo-slug>-<amount-grosze>` and the create call catches `resource_already_exists` to reuse the existing coupon. Same charged amount, dramatically fewer Stripe artefacts.",
        },
        {
          name: "Ottaviano Corporate",
          status: "live",
          href: "/admin/corporate",
          summary: "Bulk-ordering primitive for companies with 6+ employees (the brief's >5 employees rule, enforced at promotion time). Promote a FamilyWallet to a corporate account in /admin/corporate: public landing at /corporate/[slug], billing email for the head's monthly invoice, head bonus rate (default 20% of pool), minimum-employee gate (default 6), optional auto-pre-order day/time. Cart drawer surfaces an `Ordering with [company]` banner with the Ottaviano Corporate kicker when the active wallet is a corporate account; employee ordering bills to the company card while personal loyalty points stay individual. Head bonus is folded into the head's spendablePoints via resolveCustomerLoyalty() so it's immediately redeemable. POST /api/corporate/[slug]/join sends an SMS OTP; existing /rewards confirm flow promotes the employee to active. Audit §3.4.",
        },
        {
          name: "Corporate monthly invoices",
          status: has("MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM") && has("CRON_SECRET") ? "live" : "needs-config",
          envVars: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM", "CRON_SECRET"],
          href: "/admin/corporate",
          summary: "Daily dispatcher fires /api/admin/cron/corporate-invoices on the 1st of each month. For every corporate-configured wallet with a billing email, sums the previous month's per-employee orders and queues a `corporate.monthly_invoice` outbox event. The comms dispatcher emails an HTML breakdown to the billing contact via Mailgun (noop when unset, dedupe key = YYYY-MM so retries within the same month are no-ops). Manual trigger from /admin via owner-only POST. Audit §3.4 row 4.",
        },
        {
          name: "Corporate auto-pre-order reminder",
          status: has("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM") && has("CRON_SECRET") ? "live" : "needs-config",
          envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "CRON_SECRET"],
          href: "/admin/corporate",
          summary: "Daily dispatcher fires /api/admin/cron/corporate-preorder-reminder. For every corporate with autoPreorderDay/Time configured, when today matches the day AND we're within 3 hours of the scheduled time, SMS-nudges every active employee who hasn't placed an order today (`Ottaviano — Acme Wednesday 12:30 lunch. 4/8 teammates ordered. Pick your meal: …`). Dedupe key = ISO date + phone so retries skip already-queued reminders. SMS opt-out honoured. Audit §3.4 row 5.",
        },
        {
          name: "Premium delivery-unlocked card",
          status: "live",
          summary: "Once the threshold clears, the bar transforms into a celebratory card: gold→green medallion, Georgia-serif headline, pop-in + one-shot shimmer animation. Not a status flip, a moment. Audit §2.1 post-attach.",
        },
        {
          name: "Gold-tier perk banner",
          status: "live",
          summary: "Comp'd pesto bruschetta (price-0 cart line) offered to Gold/Platinum members in the cart drawer. Self-hides when no antipasto is available today. Tier-conditional upsell from audit §2.2 row 6.",
        },
        {
          name: "Combo deals",
          status: "live",
          href: "/admin/crosssell",
          summary: "Cart-total discounts capped to one combo's worth (cheapest unit per matched category). Default ladder rebuilt May 2026: Italian Classic Deal (Margherita + **Limonata** + Tiramisù, 10% — moved off espresso because 60% of carts add espresso anyway; the combo was paying a discount on items customers already buy organically), Pasta Combo (any pasta + drink, 10% — honours the lunch TodBanner promise and acts as the graceful fallback when a customer breaks the Lunch bundle by removing the dessert), Pizza & Side (any pizza + garlic bread, 12% — replaced the dead Lunch Special panini+drink combo at 8% which was 2 zł savings ignored by customers). Channel-aware: combos can be flagged dine-in or delivery exclusive. getActiveComboDeals picks the highest-savings complete combo first, then the highest-potential partial — order-independent. Combo discounts ride to Stripe as an amount_off coupon.",
        },
        {
          name: "Item modifiers — customer picker → KDS (half & half, crust, toppings)",
          status: "live",
          href: "/admin/menu",
          summary: "Per-item modifier groups, now wired end-to-end (audit §3 + §11.2 — \"freeform notes instead of modifiers; half-and-half all day\"). Each MenuItem carries `modifierGroups[]` (label, min/max selections, options with priceDelta + costDelta + KDS-flag). Margherita ships Crust (Standard / Sourdough +5 / Gluten-free +5), Premium toppings (Buffalo mozz +9, Extra cheese +6, Truffle oil +8, Prosciutto +12) and **Make it half & half** (Half Diavola / Quattro Formaggi / Ortolana) — chain-consistent across Kraków + Warszawa; Diavola adds Spice level. CUSTOMER PICKER: a menu card whose item has modifier groups routes its Add into the item-detail drawer (src/components/location/ItemDetailDrawer.tsx), which renders each group as radio (max 1) / checkbox (≤ max) chips, enforces required picks, pre-seeds the default crust, and live-quotes the price via effectiveUnitPrice(). Cart lines key on item id + chosen options (cartLineKey) so each variant stacks separately and the row shows the picks as chips. PROPAGATION: the checkout payload + api-schemas carry selectedModifiers; createOrder.ts re-validates every id against the live menu (forge-proof) and prices with the same helper; the Stripe line items now include the modifier delta (previously undercharged) and list the picks in the line description. KDS: the Core KDS ticket renders each line's modifiers as a row per modifier, with flagOnKds options escalated to a flagged style. Editor lives on /admin/menu (ModifierEditor); groups round-trip through the menu API per location. Operator inventory at /admin/upsell → Item modifiers. (POS terminal modifier selection is still a later pass — see POS note.)",
        },
        {
          name: "Delivery-only item flag + packaging cost editor",
          status: "live",
          href: "/admin/menu",
          summary: "Audit §3 channel economics — every menu item edit dialog now exposes (a) a 'Delivery-only item' toggle that hides the SKU from dine-in/takeout carts and (b) a 'Packaging cost' override input (PLN per unit) that beats the category default (pizza 1.80 / pasta 2.50 / antipasti 1.50 / panini 0.80 / drinks 0.60 / desserts 1.00). Used for pantry SKUs (frozen tiramisù, Peroni 4-pack, branded olive oil) that customers can't carry from a truck. MenuOverride.deliveryOnly + packagingCost round-trip through /api/admin/menu (validated by api-schemas.ts) and feed totalPackagingCost() so the bundle low-margin alert + delivery profitability report reflect real delivery economics.",
        },
        {
          name: "Per-segment delivery threshold settings panel",
          status: "live",
          href: "/admin/settings",
          summary: "Audit §3 — /admin/settings → General now carries four threshold inputs (first-time / growing / regular / VIP) that override the hard-coded SEGMENT_FREE_DELIVERY_THRESHOLD defaults. Empty input = use default (39 / 49 / 59 / 35 PLN). Saved overrides flow through getDeliveryThresholdForCustomer() on the server (checkout fee charge) AND through /api/settings/public into the cart drawer (live progress bar) — so retuning one segment instantly affects both the bar the customer sees and the receipt amount Stripe charges, with no code push.",
        },
        {
          name: "Menu engineering hierarchy",
          status: "live",
          href: "/admin/menu",
          summary:
            "Audit §4 shipped. Items carry a `menuRole` (hero | profit-driver | anchor | lto) that drives card hierarchy on the public menu: Margherita renders as a full-width hero with the cream-gradient frame, Quattro Formaggi / Linguine al Pesto / Espresso get the gold Pizzaiolo's Choice badge, and the new Pizza del Pizzaiolo (Kraków 47.90 PLN / Warszawa 52.90 PLN — truffle + buffalo mozzarella, monthly LTO) renders with the dark Chef's Signature treatment and the days-left countdown. The default menu sort is now Pizzaiolo's layout: hero → profit-driver → anchor → standards by popularity → alpha tie-break (compareMenuEngineering in src/lib/upsell.ts). All Kraków + Warszawa prices re-aligned to the §4.2 charm-pricing rules (pizza ends in 9, premium pasta in 5, espresso in 9, desserts in 0). Fully manager-editable from /admin/menu — the edit dialog exposes the role dropdown and the LTO toggle + 'available until' date, persisted via MenuOverride.{menuRole,isLimited,limitedUntil} with `null = clear back to seed`. Cross-location clone (Kraków ↔ Warszawa) propagates the role + LTO state too.",
        },
        {
          name: "Unified menu item editor",
          status: "live",
          href: "/admin/menu",
          summary:
            "Every product on /admin/menu exposes the same editable surface regardless of storage origin: name, item slug (renameable for custom rows), SKU (operator inventory code), category, price, food cost (locked when a recipe is attached), description, tags, availability, delivery-only flag, packaging cost override, and modifier groups. Seed-backed items route edits through the MenuOverride pipeline (category/tags/sku join the existing override fields with `null = clear back to seed` semantics); admin-created rows route through /api/admin/menu/custom with PATCH-based atomic renames. The legacy 'Custom' badge was retired. The edit dialog includes an 'Available at locations' multi-select: checking a new location clones the item there (location-prefixed id), unchecking removes it (hard-delete for custom rows, `hidden: true` override for seed rows — restorable via the 'Show hidden' toggle). Trash icon on every row triggers the same delete semantics; a soft-deleted seed row can be restored by the eye-icon action that surfaces when 'Show hidden' is on.",
        },
        {
          name: "Bulk menu delete (cross-location)",
          status: "live",
          href: "/admin/menu",
          summary:
            "Operators no longer have to delete the same menu item from each location manually. The AdminMenu bulk toolbar (visible when one or more rows are checked) exposes 'Delete here' (current location only) and 'Delete everywhere' (every active location). The trash icon on a single row that has cross-location twins now also prompts for current-vs-all scope. All three flow through POST /api/admin/menu/bulk with `action:\"delete\"` and `scope:\"current\"|\"all\"`: custom rows hard-delete via deleteCustomMenuItem(), seed rows soft-hide via setMenuOverridesBulk({hidden:true}) (restorable via 'Show hidden'). Cross-location twins are matched case-insensitively by item name. The endpoint authorizes every touched location upfront (rejects the whole batch on any 403) and audit-logs as `menu.bulk_delete` with the full row-by-row teardown plan.",
        },
        {
          name: "Bulk menu edit + multi-target clone (chain-wide)",
          status: "live",
          href: "/admin/menu",
          summary:
            "Three composable affordances for chain-wide menu maintenance. (1) **Bulk-edit dialog** — toolbar 'Edit selected' opens a dialog where each field (price, cost, available, category, tags, description, delivery-only, packaging cost) has an 'enable' checkbox; only enabled fields are pushed. Footer offers 'Apply to <current>' or 'Apply everywhere' (fan-out to every twin matched by name). (2) **Per-item 'Apply to all locations' toggle** — the row edit dialog adds a checkbox above the price input that propagates price / cost / description / category / tags / availability / packaging to every other location where the same item exists. Identity fields (name, slug, SKU, modifiers) stay per-row. (3) **Multi-target clone dialog** — replaces the per-location 'Clone → X' buttons with a single 'Clone to…' that lets operators pick any combination of target locations and fans out N parallel bulk clone_to calls, aggregating matched / unmatched / failed counts in one toast. All three flow through POST /api/admin/menu/bulk: new `action:\"edit\"` resolves twins server-side when scope=all, routes seed rows through setMenuOverridesBulk and custom rows through updateCustomMenuItem, authorizes every touched location upfront, and audit-logs as `menu.bulk_edit`.",
        },
        {
          name: "Customer rollups",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/customers",
          summary: "Lifetime spend, order count, first/last order, lapsed detection.",
        },
        {
          name: "Loyalty tier multipliers",
          status: "live",
          href: "/admin/growth",
          summary: "Bronze / Silver / Gold / Platinum ladder with operator-editable label (Famiglia Oro / Platino), threshold, points multiplier, and perks bullet list. Edited at /admin/growth → Tiers; persisted via updateLoyaltySettings() and shipped to customer surfaces (the /rewards page, cart tier banners, the earn preview) through /api/settings/public. Pure-compute helpers in src/lib/loyalty.ts take the ladder as a parameter so no hardcoded threshold remains anywhere — every value the operator can change is the only value the runtime sees.",
        },
        {
          name: "Achievements engine",
          status: "live",
          href: "/admin/customers",
          summary: "18 badges (First Bite, Pizza Lover, Speed Demon, …). Awarded automatically on order events.",
        },
        {
          name: "Challenges",
          status: "live",
          href: "/admin/growth",
          summary: "Time-limited goals (e.g. order 3× this week for 50 pts). Configured in growth settings.",
        },
        {
          name: "Live activity bar (social proof)",
          status: "live",
          href: "/admin/growth",
          summary: "Real, location-scoped social-proof strip on /locations/[slug] (under the hero). The operator picks which signals to show in Growth → Live activity widgets (location-filtered, ordered); the stat widgets (orders in the last hour, currently preparing, trending dish, avg prep) are computed from ACTUAL orders by store.getLiveActivity and served via the public /api/public/live-activity?location= endpoint (polled every 30s, simulated KDS tickets excluded). Each stat hides itself when its real value is 0/null, and content widgets (happy hour, restaurant location, free-text announcement) are operator-authored — so the bar never shows an invented or sad number. Replaces the deleted simulateLiveActivity fabrication.",
        },
        {
          name: "Speed Guarantee",
          status: "live",
          href: "/admin/settings",
          summary: "Promise ready-by time or a free dessert. Toggle + countdown on the menu page.",
        },
        {
          name: "Campaign triggers",
          status: "live",
          href: "/admin/growth",
          summary: "Event-driven SMS/email automations (welcome, lapsed, birthday). Outbox-backed.",
        },
        {
          name: "Chatbot FAQ admin",
          status: "live",
          href: "/admin/ai",
          summary: "CRUD Q/A pairs that power the customer-side chatbot widget. Keyword-triggered.",
        },
      ],
    },
    {
      id: "operations",
      title: "Operations",
      items: [
        {
          name: "POS — Tabs terminal (counter order entry)",
          status: "live",
          href: "/core/pos",
          summary:
            "Staff-facing point of sale at /core/pos — on the clean-room Core shell (one command bar + a centred bottom surface-switcher, flat dark-first theme; its own UI primitives, no admin/suite inheritance): a concurrent OPEN CHECKS tab rail, a category rail with capacity-true promise times, a text-forward menu grid and the persistent live coursing ticket. A rail of concurrent OPEN CHECKS (tabs) sits front and centre, each its own running total + status (open / parked / ready-to-pay) and channel colour (Takeout=blue, Delivery=amber, Dine-in=purple, grey until chosen); staff switch between them, open new ones (N), park, and send/charge each independently. Tabs are server-backed (PosTab in src/lib/store.ts → GET/POST/PUT/DELETE /api/admin/pos/tabs, per location) so they survive a refresh and are shared across tills — lines store menu-item ids + quantities only, never prices. Product grid is the truck's real menu (getMenuWithOverrides) with role badges / tags / category 'All' grouping; an in-column channel selector is required before send or charge (deliveryOnly SKUs only on Delivery). Dine-in tabs carry covers + a real floor table from /admin/floor (with cross-check table-conflict detection); delivery tabs capture an address. Combo deals (getActiveComboDeals, admin-configured in /admin/crosssell) auto-discount the live cart, an order-aware AI offers panel surfaces combo-completion + cross-sell (getCartSuggestions), and the Pace→POS steering feed (/api/admin/pace/steering) badges make-now / ease items + quotes capacity-true promise times when the line gets hot. 'Send to KDS' POSTs /api/admin/pos/orders {tabId}: the server rebuilds the order from the persisted tab + real menu + combo discount and calls createOrder (KDS ticket + stock decrement + Orders list), suppressNotifications + synthetic same-day 'walkin' slot; it's idempotent per tab (re-send re-syncs the same Order, no duplicate). Dine-in checks support COURSING (src/lib/pos-coursing.ts): each line carries a course (starter/main/dessert/drink, defaulted from its menu category), a 'Kitchen timing' toggle picks Coursed vs All-together (persisted as PosTab.coursed), and in coursed mode the ticket splits into per-course sections with a Fire button each + drag-to-recourse held lines between courses. Firing a course POSTs {tabId, courses:[course]} — the server accumulates it onto the server-owned PosTab.firedCourses and rebuilds the linked Order from the union of fired courses' lines, so each fire grows the kitchen ticket and held courses never hit the KDS. 'Charge' → tender (Cash / Card) PATCHes the same route to bill the WHOLE tab (fired or not), stamp the Order paid and close the tab. Fullscreen kiosk (portaled per CLAUDE.md rule #4). Staff+, per-location.",
          caveats:
            "Tender is a record-only step — Cash / Card stamps the Order paidAt; Stripe-terminal / cash-drawer integration is a later pass. Tabs default to 'Tab N' names (rename inline in the ticket header). Item modifiers (crust, extra toppings) aren't selectable from the POS yet — base items only. AI offers + steering are the existing heuristic / Theory-of-Constraints engines, not yet a trained model. Coursing fires into ONE growing Order per tab (held courses are added to the same KDS ticket as they fire, not a fresh ticket per course), so a course bumped 'ready' on the KDS can gain later-fired items — separate ticket-per-course is a future pass. The fire stamps Order.coursing {fired,held}; the KDS ticket shows a 'Coursed · X held' hint while courses are still held, but does not yet add a per-course header chip or group items by course name.",
        },
        {
          name: "Tables + reservations — the per-location floor data",
          status: "live",
          href: "/core/service/book",
          summary:
            "Per-location floor data, split across two Core surfaces: Tables (/core/service/tables) defines the physical tables (number, seats, zone, status, accessibility features) via /api/admin/floor/tables, and Book (/core/service/book) owns the day-by-day reservations (customer, party size, time + duration, assigned table, status) via /api/admin/floor/reservations, with double-booking conflict detection — two active bookings whose windows overlap on the same table return 409 (operator-overridable). The assigned table flows onto dine-in orders (Order.tableId) and the POS table picker. Conflict logic is pure + unit-tested (src/lib/floor.ts + floor.test.ts). Manager+, per-location.",
          caveats:
            "Tables + reservations persist via the JSON store (readJSON/writeJSON) like slots/suppliers — no dedicated Postgres table yet, fine at truck volumes. Reservations are independent of the time-Slots system (they don't reserve a checkout slot). No spatial floor-map / drag layout — tables are a list/grid.",
        },
        {
          name: "Floor Twin — live room digital twin",
          status: "live",
          href: "/core/service/book",
          summary:
            "Module 3 keystone (blueprint §4): turns the floor from a status board into a live economic simulation of the room. The Twin view on /admin/floor derives, per table, the realized turn-time, spend velocity (zł per occupied table-hour), live occupancy + a predicted free-in time (median turn − elapsed), and surfaces a predictive-seating recommender (type a party size → best-fit open tables first, then the soonest to free — computed live client-side). KPI strip: occupancy %, open tables, freeing ≤15m, median turn, floor spend/hour. Turn-time has two sources: MEASURED seat-occupancy (the §4.2 instrumentation — table status transitions are now logged on every save via saveTable → recordFloorEvent → floor-events.json, and seated→cleared pairs give true dwell incl. pre-order wait + bussing; a still-open seated run gives an exact live seat time) and, as a fallback when a table has no transition history, the dine-in order-timeline proxy (createdAt→paidAt). Measured rows are tagged. Phase 2 — the acts: predictive-seating moves (Seat / Clear a table straight from the Twin table or the recommender — POST /api/admin/floor-twin flips the status via saveTable, which logs the transition, closing the loop with the measured-dwell instrumentation) and bottleneck pre-emption (the Twin runs the live KDS pace engine, analyzeTruck, and shows a 'Kitchen filling up / overloaded — pace new seating' banner with the bottleneck station + utilisation when the line can't absorb more covers). Pure-compute engine src/lib/floor-twin.ts (buildFloorTwin + recommendSeating, 7 unit tests, dwell guardrails 5–360m); GET/POST /api/admin/floor-twin?location=, staff+.",
        },
        {
          name: "Tables — service notes & accessibility on the floor plan (core)",
          status: "live",
          href: "/core/service/tables",
          summary:
            "The Service → Tables plan (src/core/service/CoreTables.tsx) carries the two per-table facts every downstream surface reads: a Service note (persisted on FloorTable.notes — allergy / VIP / high-chair / split-bill, threaded through buildFloorTwin → TwinTableRow.notes and shown on the Book Floor-lens tiles) and Accessibility features (accessible / high-chair / step-free on FloorTable.features, matched by the seating engine against a party's needs). Both are edited in the table dialog and saved via POST /api/admin/floor/tables. Note: the old live-orders-on-tiles + '⌕ Find order' lookup + Mark-paid board was RETIRED from this surface — Tables is now management-only (zones · tables · seats); settling a check and seeing what a table owes live in Book's Floor lens and POS (the same /api/admin/floor/orders is still served for those). ",
        },
        {
          name: "Unified booking — slot + table in one step",
          status: "live",
          href: "/core/service",
          summary:
            "Lives on the merged Floor + Slots Core surface (/core/service, the clean-room Core shell, like POS & Guest): a booking console where the operator picks a dine-in slot (with live remaining capacity) and a table (lit up live for fit + conflict via the same findReservationConflicts the server enforces), with a Recommend button that auto-picks the best-fit table, then Book. The merged Floor + Slots flow: book a dine-in time slot AND assign a table in a single operation, conflict-checked on BOTH the slot's booking capacity (active reservations < maxOrders) and table double-booking (findReservationConflicts), with an operator override that forces past both. The reservation links the slot (Reservation.slotId — supplies date/time + capacity) and the table (the seat). Capacity model avoids double-counting: a reservation consumes the slot by count, never touching slot.currentOrders (which tracks online/POS orders). Customer dine-in checkout now AUTO-ASSIGNS the best-fit open table via the Floor Twin's pickOpenTable (and seats it, logging the transition) so booking a dine-in slot also gets the guest a table with no manual step — best-effort, never blocks the order. Pure validation (validateBooking) + pickOpenTable are unit-tested; orchestration in src/lib/booking.ts; POST /api/admin/booking?location= (manager+, 409 on overridable conflicts).",
        },
        {
          name: "Inventory + recipes + stock + distributor offerings",
          status: "live",
          href: "/admin/inventory",
          summary:
            "Per-ingredient stock, recipe BOMs, variance reports. Recipes are chain-wide — one Margherita formula shared across every truck, keyed by the dish's base slug (the part of the menu-item id after the location prefix, so `krk-pizza-margherita` and `waw-pizza-margherita` both resolve to `pizza-margherita`). Editing the formula in Kraków updates Warsaw automatically; only the listed price varies per location. Ingredients carry identity only (name / category / unit); cost + full nutrition (kcal + protein + carbs + sugar + fiber + fat) live on `ingredient_products` — one row per (ingredient, distributor) pair. Each ingredient points at one active offering via `activeProductId`; recipe cost + nutrition + customer kcal pill read through that pointer. Switching distributors = activating a different row — no retyping per-100g values. Lazy migrations on first read: legacy ingredient rows spawn a default `legacy:<supplier>` offering carrying their old cost + macros; legacy recipe rows keyed by location-prefixed menu-item id collapse to the base-slug shape (first-wins on dedupe). Audit §3 fix still wired: createOrder calls consumeRecipeForOrder() (lib/inventory-decrement.ts) — every paid line resolves the recipe via base-slug lookup and posts one `consume` stock movement per ingredient. Full refunds + cancellations restore symmetrically.",
          caveats:
            "Partial refunds don't carry line-level data so they don't restore — rare, and the operator can reconcile from the audit log. Recipe rows still need to exist for an item before its order decrements anything — operator is responsible for setting them up in /admin/recipes. Inventory consumption uses the active offering's `costPerUnit` for valuation — historical movement records keep the snapshot they were posted with.",
        },
        {
          name: "Suppliers + purchase orders",
          status: "live",
          href: "/admin/purchase-orders",
          summary:
            "Multi-line POs with status workflow + daily PAR-driven draft cron (audit §3 fix). /api/admin/cron/par-purchase-orders walks every location, estimates avg daily usage from the trailing 14 days of `consume` movements, computes lead-time-adjusted thresholds (reorder_point + usage × supplier.leadTimeDays, fallback 3 days), groups missing quantity by supplier, writes one draft PO per supplier per UTC day with id `par-{slug}-{supplierId}-{YYYYMMDD}`. Idempotent on re-run, doesn't overwrite drafts already sent. Operator opens the queue, reviews, taps Send.",
          caveats:
            "Drafts are only generated when an ingredient has a supplier set on the ingredient record. Operator still has to email the supplier (Send via the admin UI uses Mailgun if configured); no auto-EDI / supplier API integrations yet.",
        },
        {
          name: "Staff + schedule + time punches",
          status: "live",
          href: "/admin/schedule",
          summary: "Shifts, time clock, labour ratio.",
        },
        {
          name: "Cash sessions + drops",
          status: "live",
          href: "/admin/cash",
          summary: "Open/close drawer, drops, variance vs orders. History rows can be hidden (soft) or deleted (audit-logged).",
        },
        {
          name: "HACCP temperature log",
          status: "live",
          href: "/admin/haccp",
          summary: "Per-shift cold/hot-holding checks (audit §11.2 / §12.4 #5). Staff pick a holding point (fridge / freezer / hot-hold) and log a reading; the safe band + ok/flagged verdict derive from the sensor name in the client-safe src/lib/haccp module (shared with the server so the preview equals the saved verdict). Out-of-range readings raise a toast and append a `haccp.temp_flagged` audit entry for inspectors + insurers. GET/POST /api/admin/haccp, staff+, per-location; backed by the temp_logs Postgres table with a kv-store fallback for local dev.",
        },
        {
          name: "Waste log",
          status: "live",
          href: "/admin/waste",
          summary: "Reason-coded line log of food binned outside a sale — spoilage / prep error / dropped / over-production / customer return / expired / other (audit §11.2 / §12.4 #4). Item + quantity + unit + optional cost estimate roll up to a daily write-off total. Distinct from the inventory `waste` stock movement: this is the fast at-the-line capture. GET/POST /api/admin/waste, staff+, per-location, every entry audit-logged as `waste.log`.",
        },
        {
          name: "Shift handover",
          status: "live",
          href: "/admin/handover",
          summary: "End-of-shift sign-off (audit §11.2 / §12.4 #1 — the #1 control against shift-boundary theft + morale collapse). Records the drawer count reconciled against the chosen cash session for a real variance, temp-checks-logged / waste-logged / equipment-OK confirmations, a manager comment for the next shift, and the named outgoing (→ incoming) manager. GET/POST /api/admin/handover, manager+, per-location, audit-logged as `shift.handover`.",
        },
        {
          name: "Business costs ledger",
          status: "live",
          href: "/admin/business-costs",
          summary:
            "Operating expense register — payroll (pizzaiolo, chefs, waiting staff), rent, utilities, fuel, insurance, licenses, software, one-off purchases. Recurring amounts auto-normalised to grosze/month for like-for-like totals; KPI cards show monthly recurring, annualised, payroll subtotal, and one-off spend over the last 30 days. Per-location scoping (or chain-wide), category and payroll-role breakdowns, archive vs delete, next-due reminders.",
        },
        {
          name: "Finance calculator (sandbox P&L)",
          status: "live",
          href: "/admin/simulation",
          summary:
            "Sandbox monthly P&L bound to real-order actuals (orders/day, AOV, weighted COGS, delivery share, refund rate, median ticket time — all pulled from /api/admin/orders over a 90-day rolling window and applied with one click). Tune revenue inputs, labor mix (with volume-flex), fixed costs, the per-revenue constants (payment / refund / loyalty / CIT / D&A / interest), kitchen capacity (peak-hour throughput ceiling), and channel-split payment fees (cash / on-site card / Glovo / Wolt). Food cost + waste are derived from the dish recipes (menu-mix-weighted) and read-only on the five named scenarios — only the Custom scenario unlocks them for hand-typed what-ifs. The Scenarios picker (five archetypes + Custom) sits directly below Variable costs. A Premises card models the occupancy decision across three modes — Rent, Mortgage or Buy (cash) — (rent + deposit + service charge; or purchase price + down payment + mortgage rate/term; or an all-cash purchase — all with property tax + structural upkeep + building depreciation + appreciation on the owned modes): computePremises/applyPremises derive the rent line, mortgage interest, building depreciation, property costs and the upfront cash from it, so the choice flows all the way to payback + IRR. A ‘Premises ROI vs markets’ card then re-runs the full P&L for each of the three scenarios and scores its annualised return (IRR of the cash-flow stream incl. terminal building equity) over a configurable horizon against the S&P 500, Nasdaq-100 and a 5% bond — answering whether it's viable to run the unit or better to invest the capital (computePremisesInvestment). 9 behavior levers, 5 weather/calendar levers, per-month seasonality overrides. Institutional-grade KPI suite: EBITDA, EBITDAR, cash-on-cash return, occupancy ratio, refund-adjusted net sales, contribution per labor hour (QSR target ≥150 zł/h), promo-adjusted AOV, peak orders/hour, median ticket time, true contribution margin, kitchen-capacity utilisation. Two 2-D heatmaps, scenario comparison, ±20% sensitivity, sensitivity tornado across all key drivers, 12-month operational projection, and a 24-month investor view with 4-month opening ramp surfacing NPV @ 10/15/20%, IRR, and cumulative-cash break-even. Break-even chart shows the current operating point vs ceiling at a glance. Master toggle in Settings → General. Defaults are Warsaw 2026 (gross × 1.22 ZUS narzut, 5-year truck depreciation). Zero writes to the business-costs ledger.",
        },
        {
          name: "Simulation mode (whole-business pre-launch dry-run)",
          status: "live",
          href: "/admin/settings",
          summary:
            "Owner-only switch (Settings → Simulations) for rehearsing the full business before go-live. Flips the ENTIRE app — admin AND storefront — onto an isolated namespace (`sim:` prefix via src/lib/store.ts resolveKey + getDomainDb, which routes the normalized Postgres domains through their kv fallback — no migrations) so real data is physically untouched; a 2.5s-cached flag off the shared settings blob drives it. First enable seeds a REALISTIC, DEEP CORE picture: seedSimulation() (src/lib/sandbox/seed.ts) lays down ≈10 months of trading per location at a real daily rate (~18 orders/day, weekend-weighted) drawn across a weighted service-hour curve (lunch + dinner peaks, ~5,500 orders chain-wide) from a large guest base — ~1,800 customers, mostly one-timers with a loyal core — so Reports, Cohort/LTV-CAC (repeat-rate climbs with the window), SSSG, Dayparts (dinner-heaviest), Hourly throughput (19:00 peak) and Menu engineering all show genuine, sensible signal — alongside tables, slots, staff+schedule, cash reconciling to revenue, bookings, suppliers/POs, waste/HACCP and feedback/surveys. Today's service also draws stock down through the REAL recipe math (buildDraws → receive ~1.8× then consume), so on-hand reflects sales (gated on a recipe catalogue existing, same as live consumption). Every operational surface (POS/KDS/Orders/Service/Guest) is testable the instant you switch on. Orders land via bulkAppendOrders (one locked write per location, not createOrder's per-insert O(N) blob rewrite) so even the deep dataset seeds in seconds — well under the serverless budget on Neon; the seeder then fires KDS + rebuilds CRM rollups once (regulars + a capped set of frequent guests; the long tail still surfaces in order-derived CRM + cohort analytics). From there you keep pushing your own test orders, waste write-offs, costs and customers by hand to dry-run the whole flow. Edits persist across off→on (rows are kept so you can switch back on and continue); a 'Reset & re-seed' button wipes + re-seeds a clean dry-run, and a 'Wipe to empty' button clears the namespace for pure hand-entry. Shared/real keys (menu, recipes, ingredients, auth, locations, config) stay live. AI agents keep working: the interactive Ops/Boardroom agents read the sim namespace automatically (their tools route through the store), and the cron dispatcher (src/app/api/admin/cron/dispatch) runs the ANALYSIS/AI jobs (boardroom daily briefing, customer-segments rebuild, daily summary, labor-efficiency, inventory-variance, lapsed-detect, weather-staffing, par-PO drafts) so they learn from and report on the dry-run data for the operator to check — while every real-world job stays paused (outbox/SMS/email drain, WhatsApp sends, corporate reminders + invoices, retention-trim of real audit tables, DB backup; flagged `realWorld` in the dispatcher). Customer-facing sends + Stripe charges initiated by agents are independently suppressed by the comms/checkout `isTestModeActive()` guards. An indigo banner shows across admin + storefront so nobody mistakes the dry-run for live trading. Endpoints: POST /api/admin/simulation-mode {enabled} | {action:'reset'} | {action:'wipe'}. Distinct from the per-record `simulated` flag and the finance Calculator (/admin/simulation).",
          caveats:
            "Whole-business: while on, the live storefront serves your test data too — don't enable during real trading. First enable seeds a full CORE dry-run dataset (use 'Wipe to empty' if you'd rather hand-enter from scratch). Shared domains (menu/recipes/ingredients) are genuinely shared with real, so editing them here affects real. AI analysis jobs run on the sim data, so they DO consume the daily AI budget — keep an eye on Agent HQ spend during a long dry-run. Cross-instance the flag is eventually-consistent within ~2.5s of toggling. KDS bump-time P95 analytics read a DB-only ledger and stay empty here.",
        },
        {
          name: "Calculator actuals (real-order ground truth)",
          status: "live",
          href: "/admin/simulation#unit-economics",
          summary:
            "GET /api/admin/simulation/actuals?days=90 returns a rolling-window snapshot from the live orders table: orders/day, avg ticket, menu-mix-weighted COGS (Σqty×cost ÷ Σqty×price across every line item, modifiers honoured), plus that COGS split into weightedFoodCostPct (ingredient that reaches the plate) and weightedWastePct (each recipe line's wasteFactor trim/spill overhead) via calculateFoodCostBreakdown — the two sum back to weighted COGS so nothing double-counts, delivery vs takeout share, refund/cancellation rate. The Calculator's Food-cost-% + Waste-% levers derive from this split and stay read-only on the five named scenarios (editable only on Custom). Flagged as warning when scenario drifts > 15% from reality. seedSimulationFromHistory also pulls it, so /api/admin/simulation?seed=1 starts from reality instead of defaults.",
        },
        {
          name: "Calculator customer economics (cohort / LTV / CAC)",
          status: "live",
          href: "/admin/simulation#customer-economics",
          summary:
            "GET /api/admin/simulation/cohorts?days=180 groups real orders by phone (using the loyalty engine's checkout capture per CLAUDE.md rule #6) and returns repeat rate, orders per customer, GP per customer (item + modifier level), acquisition velocity, and the new-vs-returning revenue mix. The Calculator tab renders an 8-KPI strip with CAC (implied = marketing fixed cost ÷ new customers per month), LTV/CAC ratio against the institutional 3× gate, customer payback period, and the share of revenue from net-new vs prior-window customers (returning > new is the institutional green light).",
        },
        {
          name: "Calculator comp-sales (SSSG)",
          status: "live",
          href: "/admin/simulation#top-line-growth",
          summary:
            "GET /api/admin/simulation/sssg?days=30 compares trailing-window revenue to the prior trailing window of the same length and decomposes the move into revenue / order / ticket / customer growth so the operator sees what drove the change. The most-watched chain metric in restaurants.",
        },
        {
          name: "Calculator institutional KPIs (EBITDA / CCC / channel CM1)",
          status: "live",
          href: "/admin/simulation#unit-economics",
          summary:
            "EBITDA / EBITDAR / cash-on-cash / occupancy ratio / contribution-per-labor-hour / promo-adjusted AOV / refund-adjusted net sales / True CM1 per order — all computed client-side from the scenario + actuals. Plus per-channel CM1 panel showing cash / on-site card / Glovo / Wolt contribution per order side-by-side (red < 20%, value-destructive); attachment-efficiency panel ranking each enabled attach lever by absolute monthly profit lift; unit-economics breakdown panel reproducing the institutional audit's per-order build-up (Revenue → -COGS → -Packaging → -Waste → -Refund → -Loyalty → -Fees → -Marketing CAC = True CM1 → -Labor → -Fixed = True CM2); margin-traps callout flagging delivery-only marketplace casualties, spoilage-risk items, and prep-heavy false-high-revenue plates. The IC-grade surface that turns the calculator from a basic operator tool into an FP&A dashboard.",
        },
        {
          name: "Calculator menu engineering matrix",
          status: "live",
          href: "/admin/simulation#menu-strategy",
          summary:
            "GET /api/admin/simulation/menu-engineering?days=90 computes per-item unitsSold + GP/unit (modifier deltas folded in) across real orders and groups items into the Kasavana-Smith quadrants (star / plowhorse / puzzle / dog), splitting at the median velocity and median GP. The Calculator tab renders a 2×2 grid with per-quadrant verdict ('Reprice up or re-engineer', 'Delete unless strategic') and the top 6 items per quadrant.",
        },
        {
          name: "Calculator sensitivity tornado",
          status: "live",
          href: "/admin/simulation#sensitivity",
          summary:
            "Computed client-side on every render. Flexes each key driver independently around the current scenario (orders ±10%, ticket ±10%, food cost ±5pp, labor ±10%, fixed ±10%, payment fee ±0.5pp, waste/refund ±1pp, CIT 9%↔19%, Glovo commission ±3pp), measures the net-profit swing, and sorts bars descending. Renders as horizontal bars centred on the current value with red downside / green upside. The IC-grade 'where would I look first?' answer.",
        },
        {
          name: "Calculator daypart + hourly throughput",
          status: "live",
          href: "/admin/simulation#operations",
          summary:
            "GET /api/admin/simulation/dayparts?days=90 (lunch 11-15, dinner 17-22, late-night 22-04, off-peak) and /api/admin/simulation/hourly?days=30 (24 rows). The Calculator tab renders a daypart table with GP-rate colour coding plus a 24-bar throughput chart overlaid with the kitchenCapacity ceiling (red over capacity, amber within 15%). Together they expose menu-mix and peak-hour blow-out risk the daily-aggregated view hides.",
        },
        {
          name: "Calculator fleet model (multi-unit / franchise)",
          status: "live",
          href: "/admin/simulation#fleet",
          summary:
            "Multi-unit P&L module on the Calculator tab. Set Unit count ≥ 2 to activate. Models HQ overhead absorption, supply discount at scale (default −10% COGS at 5 units), commissary savings (default −4% at 4 units), franchise royalty (default 6%) + marketing fund (default 2%), DMA cannibalisation (default 15% revenue drag per overlapping prior unit, compounded), and build-out learning curve (default 5%/unit decline to a 55% floor). Renders fleet revenue / EBITDA / EBITDA-per-unit / HQ absorption / fleet build-out KPIs plus a per-unit table breaking down revenue, COGS, labor, royalty, mkt fund, EBITDA, setup cost. The franchise/scale conversation a CFO would actually approve a multi-unit rollout on.",
        },
        {
          name: "Calculator operational bottlenecks",
          status: "live",
          href: "/admin/simulation#operations",
          summary:
            "Three panels answering the audit's operator-eye questions. Oven curve: Neapolitan physics (pizzas/cycle × cycle seconds × efficiency) vs observed peak hour from real orders; status banner from headroom → blown out at 85% saturation. Prep flow & queue model: modeled ticket time from per-attach prep seconds (pasta 240s, coffee 30s), peak-hour queue formation when ordersPerDay × peakShare exceeds realistic oven capacity, wait minutes, and a red callout sizing the monthly orders + contribution lost to conversion drop (5%/min past 5 min, capped 60%). Shift plan: maps the uniform labor mix onto prep / lunch / dinner / late-night / close with per-daypart coverage ratio (green < 20%, red > 35%). Menu-engineering panel surfaces hero / profit-driver / anchor tags from the menu definition.",
        },
        {
          name: "Calculator AI enhancements",
          status: has("ANTHROPIC_API_KEY") ? "live" : "needs-config",
          href: "/admin/simulation",
          envVars: ["ANTHROPIC_API_KEY"],
          summary:
            "Below the sensitivity row on /admin/simulation, a Claude-powered card analyses the current scenario (revenue inputs + assumptions + weather + computed KPIs) and returns 4–6 specific enhancements with category (revenue/cost/risk/operations), severity, problem (citing real numbers), recommendation, and an estimated monthly grosze impact. Manual trigger (button click) to bound API spend. Degrades gracefully to a needs-config banner when the API key is missing — the rest of the calculator stays fully functional without AI.",
        },
        {
          name: "Slots",
          status: "live",
          href: "/core/service/slots",
          summary: "Atomic increment (no overselling). Auto-close past slots via cron.",
        },
        {
          name: "Demand Exchange — per-slot yield",
          status: "live",
          href: "/core/service/slots",
          summary:
            "Module 2 (blueprint §3): reframes the booking grid from a static currentOrders/maxOrders counter into yield-managed seat-minute inventory. The Demand view on /core/service/slots forecasts covers per slot from real same-weekday order history, compares against the kitchen's DEMONSTRATED ceiling (busiest realized covers/hour over the last 90 days, not a theoretical max), folds in logged rejected-demand, and prescribes the yield action per slot: raise capacity (demand > advertised), trim/promote (over-provisioned), protect kitchen (demand > throughput ceiling), or hold. It also instruments the signal the static counter throws away: every checkout that hits a full slot logs a demand signal (createOrder → recordDemandSignal → demand-signals.json), so fill-rate becomes a real demand curve (demand > supply). Phase 2 — the act, two yield levers: for demand the kitchen can take, one-click 'Apply' resizes capacity (never below what's already booked); for kitchen-capped (protect) slots, where volume can't go up, it sets a MINIMUM SPEND sized from the slot's realized AOV (raise price, not volume). 'Apply all' is the autonomy lever — re-derives the board server-side and applies capacity + min-spend to every changed slot, audit-logged as slots.resize. The minimum is real end-to-end: TimeSlot.minSpendGrosze (additive min_spend_grosze column) is exposed on the public /api/slots (the SlotPicker shows 'min N zł') and ENFORCED server-side at checkout (createOrder returns below_min_spend if the food subtotal is under it). Pure-compute engine src/lib/demand-exchange.ts (9 unit tests); GET/POST /api/admin/demand-exchange?location=&date=, manager+.",
        },
        {
          name: "Refunds + comp controls (Stripe)",
          status: has("STRIPE_SECRET_KEY") ? "live" : "needs-config",
          href: "/admin/orders",
          envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
          summary:
            "Full + partial refunds from the order detail, manager/owner-only, with an 8-code reason dropdown (customer_request, wrong_item, quality_issue, late_or_no_show, missing_item, duplicate_charge, manager_comp, other); manager_comp skips Stripe. Authorization caps (audit §11.2) stop one person comping the whole shift: a per-refund ceiling and a per-actor-per-location daily comp cap, both configurable in Settings → General (default 200 / 500 PLN), owners always bypass. Enforced server-side in /api/admin/orders/[id]/refund BEFORE Stripe is touched, previewed live in the refund dialog via /api/admin/refund-policy, every refund audit-logged + push-notified to other admins. Logic in src/lib/refund-guard.ts (unit-tested).",
        },
        {
          name: "Delivery profitability report",
          status: "live",
          href: "/api/admin/reports/delivery",
          summary: "Per-order margin = price − (food cost + driver pay + Stripe fee).",
        },
        {
          name: "Orders management + live SSE",
          status: "live",
          href: "/admin/orders",
          summary: "Kanban + table view. SSE stream pushes status updates without polling.",
        },
        {
          name: "Order recall",
          status: "live",
          href: "/admin/orders",
          summary: "Pull a ticket already on the line. Cancels KDS + auto-refunds via Stripe.",
        },
        {
          name: "Receipt printer (ESC/POS)",
          status: has("RECEIPT_PRINTER_HOST") ? "live" : "needs-config",
          href: "/core/orders",
          envVars: ["RECEIPT_PRINTER_HOST", "RECEIPT_PRINTER_PORT"],
          summary:
            "Thermal receipt printing (audit §11.2 / §12.4 #7). 'Print receipt' on the Orders detail dialog (/core/orders) POSTs /api/admin/orders/[id]/print-receipt, which builds an 80mm ESC/POS payload (src/lib/receipt/escpos.ts — header, per-line items with resolved modifiers + notes, modifier-inclusive prices, total, partial cut; unit-tested) and streams it over a raw TCP socket to RECEIPT_PRINTER_HOST:RECEIPT_PRINTER_PORT (default 9100). With no host set it runs as a SIMULATOR — returns the exact byte count + a plain-text preview and the UI falls back to a browser print, so a receipt comes out with or without hardware. Go-live for a truck-local printer: run a print-bridge on the truck or expose the printer via a reverse tunnel, then set RECEIPT_PRINTER_HOST — see docs/design-system/core/modules/receipt-printer.md. Every print is audit-logged as receipt.print.",
        },
        {
          name: "Courier / driver dispatch",
          status: "live",
          href: "/admin/orders",
          summary: "Driver assignment, dynamic delivery fee, statuses assigned → picked up → delivered.",
        },
        {
          name: "Customer notes",
          status: "live",
          href: "/admin/customers",
          summary: "Internal-only notes attached to a customer (VIP, repeat complainer, dietary preferences).",
        },
        {
          name: "Stock movements ledger",
          status: "live",
          href: "/admin/inventory",
          summary: "Received / wasted / adjusted inventory transactions. Feeds variance + reorder cron.",
        },
        {
          name: "Item popularity tracking",
          status: "live",
          href: "/admin/menu",
          summary: "Surfaces 'Most popular' and 'Trending' badges from rolling order counts.",
        },
        {
          name: "Labor ratio",
          status: "live",
          href: "/admin/schedule",
          summary: "Live revenue-to-labour-cost metric from shifts + time punches.",
        },
        {
          name: "Sales per labour hour (SPLH)",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/api/admin/labor-efficiency",
          envVars: ["DATABASE_URL"],
          summary:
            "Daily cron computes yesterday's revenue ÷ paired-punch hours per location. Surfaced on the dashboard with target band 90–140 zł/hr. Bottom-of-range alerts staff-up; top alerts service-quality risk.",
        },
        {
          name: "Schedule-vs-sales gap",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          envVars: ["DATABASE_URL"],
          summary:
            "Compares today's scheduled hours against the demand-forecast-implied hours-needed (~3 covers/hr/staffer). Surfaces actionable gaps ≥ 2 hours on the dashboard. Uses Claude forecast when ANTHROPIC_API_KEY is set, last-week baseline otherwise.",
        },
      ],
    },
    {
      id: "reports",
      title: "Reporting & exports",
      items: [
        {
          name: "JPK_V7M (Polish tax export)",
          status: "live",
          href: "/api/admin/reports/jpk?format=summary",
          summary: "VAT XML for the Polish tax authority. Summary preview before the accountant downloads. VAT rate is resolved per location via resolveLocationCompliance(...).vatRateBps (default 800 = 8 % on prepared food, ustawa o VAT zał. 10 poz. 3) — operator-editable from /admin/regulatory-compliance → EU panel, so a truck on a different rate doesn't need a deploy. Aggregate exports apply each row's own location rate.",
        },
        {
          name: "Tips report",
          status: "live",
          href: "/api/admin/reports/tips",
          summary: "Tip totals + tip rate by order. Filters by date range and location.",
        },
        {
          name: "Cohort retention + CLTV",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/reports/cohort",
          envVars: ["DATABASE_URL"],
          summary:
            "Per-cohort retention matrix (% of cohort reordering N months later) + mean CLTV at 30 / 60 / 90 / 180 / 365 day horizons. Computed live from the orders table; cached 60s per location filter.",
        },
        {
          name: "LTV / CAC",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/reports/ltv-cac",
          envVars: ["DATABASE_URL"],
          summary:
            "Acquisition economics: margin-adjusted lifetime value (from cohort CLTV × blended order-line gross margin) over CAC (marketing-category rows of the Business-costs ledger ÷ new customers/month). Shows LTV:CAC ratio, CAC payback months, and a blended cohort-retention curve. CAC is null until marketing spend is logged in /admin/business-costs — no fabricated numbers.",
        },
        {
          name: "Customer segments (RFM)",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/reports/cohort",
          envVars: ["DATABASE_URL"],
          summary:
            "Weekly rebuild deterministically buckets every paying customer into new / occasional / regular / champion / vip / lapsed using recency-frequency-monetary scores. Drives the data moat: personalized upsell, lapse detection.",
        },
        {
          name: "Referral give-get loop",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/api/referrals",
          envVars: ["DATABASE_URL"],
          summary:
            "End-to-end: stable per-phone code, /r/CODE landing drops a 30-day cookie, the cart drawer reads it (or the customer types a friend's code) and shows the 10 PLN referee discount, checkout applies it and records the redemption intent, first paid order qualifies it, and the outbox dispatcher credits 100 points to the referrer + SMSes them the win. createOrderFromCart is the authority — it re-validates owner + self-referral + new-customer eligibility (same first-order gate as the webhook) so a forged or reused code applies no discount; the cart only shows an estimate via the non-recording GET /api/referrals?code= validation. On Stripe, the referee discount folds into the single session coupon alongside any combo discount. Acquisition cost capped at the 10 PLN referee discount.",
        },
      ],
    },
    {
      id: "tenant",
      title: "Franchise & HQ",
      items: [
        {
          name: "Brands + franchisees",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          summary: "Tenant model with location_assignments + per-franchisee royalty + marketing fund bps.",
        },
        {
          name: "Franchisee portal",
          status: "live",
          href: "/franchisee",
          summary: "Restricted to role:franchisee. 7-day rolling revenue + latest royalty statement.",
        },
        {
          name: "HQ multi-location rollup",
          status: "live",
          href: "/api/admin/hq/rollup",
          summary: "Owner only. Per-location revenue / orders / AOV + compliance heatmap.",
        },
        {
          name: "Menu lockdown",
          status: "live",
          summary: "Corporate-only items + franchiseePriceMaxDeltaBps cap.",
        },
        {
          name: "Royalty cron (weekly)",
          status: "live",
          summary: "Mondays via the daily dispatcher. Idempotent on (franchisee_id, period_end).",
        },
        {
          name: "Multi-location admin config",
          status: "live",
          href: "/admin/locations",
          summary: "Active/inactive toggle, hours, capacity, local overrides per location. Distinct from HQ rollup.",
        },
        {
          name: "Expansion planning",
          status: "live",
          href: "/admin/expansion",
          summary: "Rollout checklist (legal, site, supply, people, ops, marketing) for new locations.",
        },
      ],
    },
    {
      id: "compliance",
      title: "Compliance",
      items: [
        {
          name: "Compliance calendar",
          status: "live",
          href: "/admin/compliance",
          summary: "Permits / certs with expiry alerts on the HQ rollup.",
        },
        {
          name: "SOC 2 controls register",
          status: "live",
          href: "/admin/soc2",
          summary:
            "Owner-only readiness board mapping the platform's live runtime posture to SOC 2 Trust Services Criteria (CC6.x access, CC7.x monitoring, CC8.1 change mgmt, A1.2 availability, C1.1 secrets). Each control's status (met/partial/gap) + evidence + remediation is introspected from real config (env), the admin-user table, and the audit log via buildSoc2Register — not a static checklist. Readiness, not certification.",
        },
        {
          name: "HACCP temperature logs",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          summary: "Auto-flag readings outside the sensor range.",
        },
        {
          name: "Allergen incident log",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          summary: "Severity-classified entries with resolution workflow.",
        },
        {
          name: "Audit log retention",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/audit-log",
          summary: "No trim — inspectors can pull a year+. Indexed by entity, actor, location.",
        },
      ],
    },
    {
      id: "privacy",
      title: "Privacy & data rights",
      items: [
        {
          name: "GDPR data export",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          envVars: ["DATABASE_URL"],
          href: "/admin/customers",
          summary: "Per-customer dump of orders, points, feedback, notes. Triggered from the customer detail page.",
        },
        {
          name: "GDPR data deletion",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          envVars: ["DATABASE_URL"],
          href: "/admin/customers",
          summary: "Anonymises the customer + records the request in the audit log for reidentification trails.",
        },
        {
          name: "Customer self-serve account deletion + export (Ottaviano app)",
          status: "live",
          href: "/api/v1/openapi.json",
          summary:
            "The native customer app lets a signed-in guest delete their own account and export their own data from the More tab — Apple App Store Guideline 5.1.1(v) (in-app account deletion is mandatory for any app with sign-in) + GDPR Art. 15/17. DELETE /api/v1/customer/account (token subject = phone, so a guest can only erase their OWN record; requires confirm:true) reuses the same deleteCustomerData the operator GDPR tool runs (orders/feedback identity-redacted so JPK totals stay intact, notes + loyalty row removed, deterministic tombstone), then revokes every refresh token for the phone (revokeApiRefreshTokensForUser) so the account is signed out of all devices, and audit-logs account.delete.self. GET /api/v1/customer/account/export returns the guest's own DSAR blob (orders/notes/feedback/loyalty), audited account.export.self. Verified live: delete needs a customer token (401) + confirm:true (422), revokes the session (post-delete refresh → 401), and export is own-data-only.",
        },
      ],
    },
    {
      id: "field",
      title: "Field ops (PWA)",
      items: [
        {
          name: "Service worker + offline shell",
          status: "live",
          href: "/offline",
          summary:
            "Network-first HTML navigations (fresh on every load, cached as fallback) + stale-while-revalidate for menu/public-settings + on-demand static asset caching. When a navigation fails with nothing cached, the SW serves a branded /offline page so an installed app never shows the browser's raw error screen (precached; adapts light/dark for both the customer and operator shells). StandaloneClass tags <html data-display-mode=standalone> on home-screen launch so the installed PWA drops browser rubber-band overscroll and the install button self-hides — native-feel polish for both Ottaviano and OttavianoKDS. SW VERSION bump triggers reinstall → old-cache purge on already-installed clients.",
        },
        {
          name: "IndexedDB outbox + bg sync",
          status: "live",
          summary: "Failed mutating fetches queued; replayed on online or sync event.",
        },
        {
          name: "Live event location",
          status: has("UPSTASH_REDIS_REST_URL") ? "live" : "needs-config",
          envVars: ["UPSTASH_REDIS_REST_URL"],
          summary: "Operator PWA POSTs an off-site event's live location every 30s while event=live. 90s TTL — no track history kept.",
        },
        {
          name: "Public nearby-event endpoint",
          status: "live",
          href: "/api/public/events/live",
          summary: "Returns live events + distance + nearby (500m geofence) when lat/lng provided.",
        },
        {
          name: "Weather-aware staffing tips",
          status: "live",
          summary: "Open-Meteo 24h forecast → staff_up / staff_down. Cron at 06:00 UTC.",
        },
      ],
    },
    {
      id: "aggregator",
      title: "Aggregators",
      items: [
        {
          name: "Marketplace integrations manager",
          status: "live",
          href: "/admin/integrations",
          summary:
            "Operator-managed connection registry for delivery marketplaces (Uber Eats, Wolt, Glovo, Pyszne.pl, Bolt Food, Grab). Per-provider enable / connect / disconnect, store id, public order link, commission % (feeds the Calculator's channel economics) and auto-accept — persisted to integration-settings.json (GET/PUT /api/admin/integrations, toggle = saved). Enabled connections that carry a public order link surface as the storefront footer's 'also order on …' strip via /api/settings/public. Connection management only; live order ingestion still needs each marketplace's partner API (the Wolt+Glovo webhook scaffold below).",
        },
        {
          name: "Wolt + Glovo webhook intake (scaffold)",
          status: "needs-config",
          envVars: [
            "ENABLE_AGGREGATORS",
            "WOLT_API_KEY",
            "WOLT_WEBHOOK_SECRET",
            "GLOVO_API_KEY",
            "GLOVO_WEBHOOK_SECRET",
          ],
          summary:
            "Webhook route + HMAC signature verification + idempotency wiring are real. The provider classes (WoltProvider, GlovoProvider) throw 'not implemented' for syncMenu / ingestOrder / updateStatus — there is no live merchant integration today.",
          caveats:
            "Earlier revisions shipped Wolt + Glovo mock providers that returned true from verifyWebhookSignature() and just logged every event. That was a forged-webhook foot-gun — removed 2026-05-21 (audit §10.3). Until WOLT_API_KEY + GLOVO_API_KEY + secrets land and the three method bodies are implemented, the webhook returns 503 with a clear message. Treat this as a placeholder, not a live aggregator integration.",
        },
        {
          name: "Unified KDS source tagging",
          status: "live",
          summary:
            "KDS rendering + reports already key off payload.source so when the aggregator implementation lands, orders flow into the same KDS as direct, tagged via specialInstructions — no UI changes needed.",
        },
      ],
    },
    {
      id: "cron",
      title: "Scheduled jobs",
      items: [
        {
          name: "Daily dispatcher (Hobby-friendly)",
          status: has("CRON_SECRET") ? "live" : "needs-config",
          envVars: ["CRON_SECRET"],
          summary: "Single Vercel cron at 04:00 UTC fans out to all sibling jobs. Switch to per-job schedules on Pro.",
        },
        {
          name: "Outbox drain",
          status: "live",
          summary: "Daily on Hobby. Drains outbox_events through the comms dispatcher.",
        },
        {
          name: "Slots auto-close",
          status: "live",
          summary: "Daily on Hobby. Moves past-time slots to archived.",
        },
        {
          name: "Daily summary",
          status: "live",
          summary: "Per-location revenue / orders / AOV → audit + (when comms live) owner email.",
        },
        {
          name: "Boardroom daily briefing",
          status: gatewayConfigured() ? "live" : "needs-config",
          envVars: ["ANTHROPIC_API_KEY"],
          href: "/admin/boardroom",
          summary:
            "Daily via the dispatcher. /api/admin/cron/boardroom-briefing convenes the AI C-suite on the chain-wide live numbers and persists the meeting (transcript + decisions) to the Boardroom → Meetings tab. Self-skips when ANTHROPIC_API_KEY is unset; budget-gated.",
        },
        {
          name: "Customers lapsed detect",
          status: "live",
          summary: "Tags customers as lapsed after >90 days inactivity.",
        },
        {
          name: "Inventory variance (weekly)",
          status: "live",
          summary: "Sundays. Recomputes per-location variance vs expected from recipes.",
        },
        {
          name: "PAR-driven draft POs (daily)",
          status: "live",
          summary:
            "Daily via the dispatcher. /api/admin/cron/par-purchase-orders walks every location and writes draft POs grouped by supplier for ingredients below the lead-time-adjusted reorder threshold. Operator reviews + sends from /admin/purchase-orders. Audit §3 row 2.",
        },
        {
          name: "Loyalty expire points (monthly)",
          status: "live",
          summary: "1st of month. Scaffold — TTL config wiring lands in Phase 4 follow-up.",
        },
        {
          name: "Royalty weekly",
          status: "live",
          summary: "Mondays. Per-franchisee revenue × royalty_rate + marketing_fund.",
        },
        {
          name: "Weather staffing",
          status: "live",
          summary: "Daily 06:00 UTC. Open-Meteo forecast per location.",
        },
        {
          name: "Corporate monthly invoices",
          status: "live",
          summary: "1st of month via daily dispatcher. Sums previous month's orders per corporate account, queues a `corporate.monthly_invoice` outbox event with VAT-compliant breakdown → comms dispatcher → Mailgun. Dedupe key = YYYY-MM. Audit §3.4.",
        },
        {
          name: "Corporate auto-pre-order reminder",
          status: "live",
          summary: "Daily. Checks every corporate's autoPreorderDay/Time; when today matches AND we're within 3h of scheduled, SMS-nudges members who haven't ordered today. Audit §3.4.",
        },
      ],
    },
  ];

  return (
    <div className="v2-page">
      <PageHero
        title="Platform capabilities"
        subtitle="Every feature shipped across Phases 0-5, grouped by domain. Status reflects current env config — flip a needs-config entry to live by setting the listed env vars and redeploying."
      />

      <div className="grid gap-4 md:gap-6">
        {groups.map((group) => (
          <section key={group.id} className="v2-card p-4 md:p-5">
            <h2 className="admin-text text-base font-semibold mb-3">{group.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((item) => (
                <CapabilityCard key={item.name} item={item} base={base} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

interface SetupStep {
  /** The instruction. */
  text: string;
  /** Optional command / value to copy, rendered as a code block. */
  code?: string;
}

interface SetupGuide {
  /** One-line outcome the steps achieve. */
  goal: string;
  steps: SetupStep[];
  /** Where the operator applies the resulting value (e.g. Vercel env). */
  appliesAt?: string;
  /** In-repo runbook with the full detail. */
  doc?: string;
}

interface Capability {
  name: string;
  status: "live" | "needs-config" | "disabled";
  summary: string;
  href?: string;
  envVars?: string[];
  /** Operator-honesty caveat (audit §3). Surfaces an amber callout
   *  under the summary. Use when the feature is "live" but has a real
   *  limitation an inspector would otherwise catch in 2 hours of
   *  diligence (heuristic instead of ML, manual fallback path, etc.). */
  caveats?: string;
  /** Optional step-by-step operator setup, shown as an expandable guide
   *  under the card. Most useful on needs-config items — turns "Set: FOO"
   *  into an actual how-to (copyable commands + where to paste them). */
  setup?: SetupGuide;
}

interface CapabilityGroup {
  id: string;
  title: string;
  items: Capability[];
}

function CapabilityCard({ item, base }: { item: Capability; base: AdminBase }) {
  // Re-root the canonical href onto the viewer's prefix (no-op for the owner,
  // and for /api/*, /terminal + external links — withAdminBase only touches the
  // /admin page namespace).
  const href = item.href ? withAdminBase(base, item.href) : undefined;
  const toneClass =
    item.status === "live"
      ? "border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[var(--success-soft)]"
      : item.status === "needs-config"
        ? "border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[var(--warning-soft)]"
        : "border-[var(--border)] bg-[var(--surface-2)]";
  const dotClass =
    item.status === "live"
      ? "bg-[var(--success)]"
      : item.status === "needs-config"
        ? "bg-[var(--warning)]"
        : "bg-[var(--surface-3)]";
  const label =
    item.status === "live"
      ? "live"
      : item.status === "needs-config"
        ? "needs config"
        : "disabled";

  const content = (
    <div className={`rounded-lg border p-3 h-full ${toneClass}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="admin-text font-medium text-sm">{item.name}</span>
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide admin-text-secondary">
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
          {label}
        </span>
      </div>
      <p className="admin-text-secondary text-xs leading-relaxed">{item.summary}</p>
      {item.caveats && (
        <p className="mt-2 rounded border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[var(--warning-soft)] px-2 py-1.5 text-[11px] text-[var(--warning)] leading-relaxed">
          <span className="font-semibold uppercase tracking-wide">Caveat:</span>{" "}
          {item.caveats}
        </p>
      )}
      {item.envVars && item.envVars.length > 0 && item.status !== "live" && (
        <p className="mt-2 text-[10px] admin-text-secondary">
          Set:{" "}
          <code className="font-mono text-[var(--warning)]">
            {item.envVars.join(", ")}
          </code>
        </p>
      )}
      {href && (
        <p className="mt-2 text-[11px]">
          <span className="text-[var(--info)] underline">{href}</span>
        </p>
      )}
    </div>
  );

  const setup = item.setup && (
    <details className="mt-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--info)]">
        Setup guide — {item.setup.goal}
      </summary>
      <ol className="mt-2 ml-4 list-decimal space-y-1.5">
        {item.setup.steps.map((step, i) => (
          <li key={i} className="admin-text-secondary text-xs leading-relaxed">
            <span>{step.text}</span>
            {step.code && (
              <pre className="mt-1 overflow-x-auto rounded-md bg-black/30 p-2 text-[11px]">
                <code className="font-mono admin-text">{step.code}</code>
              </pre>
            )}
          </li>
        ))}
      </ol>
      {item.setup.appliesAt && (
        <p className="admin-text-secondary text-[11px] mt-2">
          Apply at: <span className="admin-text">{item.setup.appliesAt}</span>
        </p>
      )}
      {item.setup.doc && (
        <p className="admin-text-secondary text-[11px] mt-1">
          Full runbook: <code className="font-mono text-[var(--info)]">{item.setup.doc}</code>
        </p>
      )}
    </details>
  );

  // Setup lives OUTSIDE the wrapping <Link> — a <details> is interactive
  // content and can't legally nest inside an anchor (and the toggle must not
  // navigate the card).
  return (
    <div className="flex flex-col gap-1.5 h-full">
      {href ? (
        <Link href={href} className="block hover:opacity-90 transition-opacity">
          {content}
        </Link>
      ) : (
        content
      )}
      {setup}
    </div>
  );
}
