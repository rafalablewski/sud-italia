import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/admin-auth";
import { gatewayConfigured } from "@/lib/ai/gateway";

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
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  const env = process.env;
  const has = (...keys: string[]): boolean => keys.every((k) => !!env[k]?.trim());

  const groups: CapabilityGroup[] = [
    {
      id: "core",
      title: "Core platform",
      items: [
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
          name: "Rate limiting",
          status: "live",
          summary: "5/min/IP login, 10/min/IP checkout, 5/min/phone feedback. Fail-open on Redis error.",
        },
        {
          name: "Security headers (CSP, HSTS, XFO)",
          status: "live",
          summary: "Set in next.config.ts. Audit via curl -I.",
        },
        {
          name: "Per-route role + location enforcement",
          status: "live",
          summary: "withAdmin middleware blocks cross-tenant reads. ~80 admin routes wrapped.",
        },
        {
          name: "Health endpoint",
          status: "live",
          href: "/api/admin/health",
          summary: "DB + Redis latency, lock contention, business KPIs, AI usage.",
        },
        {
          name: "Audit log",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/audit-log",
          summary: "Every write tagged with actor + entity. Full retention, no trim.",
        },
        {
          name: "Users & RBAC management",
          status: "live",
          href: "/admin/users",
          summary: "Owner-only CRUD on admin accounts. Roles: staff, kitchen, manager, owner, franchisee.",
        },
        {
          name: "Admin settings hub",
          status: "live",
          href: "/admin/settings",
          summary: "Loyalty, growth, AI, seasonal items and feature toggles. Persists via withLock on save.",
        },
        {
          name: "Multi-currency display (PLN / USD / SGD / EUR)",
          status: "live",
          href: "/admin/currency",
          summary:
            "Customer header switcher exposes USD, SGD, EUR alongside the source-of-truth PLN. Operator sets exchange rates + enabled list + default at /admin/currency; rates flow to /api/settings/public so the customer site hydrates the formatter on mount. formatPrice() in src/lib/utils.ts routes through src/lib/currency.ts and converts grosze→target at display time. Charges still settle in PLN via the Stripe account — non-PLN selections are a reference display, with an explicit footer note in the switcher. Admin pages never mount the customer CurrencyProvider so they continue to render PLN.",
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
          name: "Mobile admin shell",
          status: "live",
          href: "/admin",
          summary:
            "Bottom-nav + topbar + FAB + bottom-sheet mobile chrome activates automatically below 900px (tablet band 720–900 inherits the same chrome). Same APIs as desktop. Mobile-native views for: Dashboard, Orders (+ refund + comp + bulk select), KDS (with offline queue), Inventory (with barcode scan), Customers (+ detail), Schedule, Reports, Cohort, Loyalty, Cash, Feedback, Settings, AI Insights, WhatsApp, Audit log, Compliance, Users, Suppliers, POs, Menu, Recipes, Slots, Locations, Truck, Expansion. Config surfaces (growth/upsell/crosssell/scheduled-bundles/corporate) intentionally stay desktop-only — see docs/mobile/*.md.",
        },
        {
          name: "Mobile admin push notifications",
          status: has("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY") ? "live" : "needs-config",
          envVars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
          summary:
            "Full pipeline live: client opt-in in More drawer → /api/admin/push/subscribe → admin_push_subscriptions table → pushToAdmins() server helper. Fan-out from addNotification (new order / slot pressure / slot full / low stock / bundle low margin), cash close with |variance| ≥ 50 zł, and refund processed (excluding the actor). Dead-endpoint pruning on 404/410.",
        },
        {
          name: "Mobile operator-action telemetry",
          status: "live",
          href: "/api/admin/telemetry",
          summary:
            "useActionTiming + /api/admin/telemetry capture span timings via navigator.sendBeacon. Wired on kds.bump, orders.refund, orders.comp. Backs the audit's ≤ 12s refund / ≤ 1.5s bump targets.",
        },
        {
          name: "Truck ops admin",
          status: "live",
          href: "/admin/truck",
          summary: "Maintenance log + route planner. Pairs with the public live-truck endpoint.",
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
      id: "kds",
      title: "Kitchen Display (KDS v2)",
      items: [
        {
          name: "Station routing",
          status: "live",
          href: "/admin/kds",
          summary: "Per-station tickets (pizza / fryer / cold prep / drinks / expo).",
        },
        {
          name: "Fullscreen kitchen display + stage switcher",
          status: "live",
          href: "/admin/kds",
          summary:
            "The floor board doubles as a wall-mountable kitchen-display appliance. A Fullscreen button takes it edge-to-edge (native Fullscreen API + a portaled overlay that escapes the admin shell per CLAUDE.md rule #4) and repaints into a dedicated always-dark, high-contrast 'kitchen OS' theme — oversized type, color-coded lanes, live wall-clock — regardless of the admin light/dark toggle, so it reads across a hot, bright kitchen. A stage switcher (All lanes · New · In prep · Ready, each with a live count) focuses one stage into a dense full-width grid or shows the three-column board. The component stays mounted across the portal, so the SSE stream, bump-bar hotkeys, sound and SLA timers keep running; Esc or the browser control exits fullscreen and drops kiosk. Decorative stat cards, the manager ops header and chef strip collapse in kiosk to maximize ticket space.",
          caveats:
            "Native fullscreen is best-effort — if the browser denies it (sandboxed iframe, kiosk policy) the immersive dark layout still applies and Esc / the Exit button leave it. Kiosk is the desktop/tablet floor board; phones keep the dedicated mobile KDS, and the owner Fleet roll-up is not a kiosk surface.",
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
            "Number keys 1–9 (and 0 = 10) advance the Nth ticket in the leftmost active column — wired to AdminKDS keydown listener. No modifier required; ignored while an input/textarea is focused so admin search still works. Pairs with a USB number pad to remove ~3s of mouse hunt per bump at rush.",
        },
        {
          name: "Mobile KDS layout",
          status: "live",
          summary: "Vertical card list under 640px. Same data, glove-friendly buttons.",
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
          href: "/admin/kds",
          summary:
            "src/lib/kds-prediction.ts models every active ticket as a single-server FIFO queue per menu-category station, using real per-item prepTimeMinutes (the same basis as the promise SLA) plus the live queue depth the KDS already streams. It predicts each ticket's actual ready time and flags it AT RISK (the violet tier) when the model says the promise will be missed BEFORE the ticket is actually late. The Pace layer derives per-station capacity (units the station clears within the 15-min window at its real per-unit prep), current load (items on in-progress tickets) and forecast (queued/new tickets = incoming load); the bottleneck = max utilisation drives the truck's capacity meter. Health score = 100 − 18/late − 9/at-risk − 2·(target − promise-accuracy). Promise-accuracy + the throughput sparkline come from the kds_tickets ledger (getKdsServiceHistory: finished tickets vs promised_ready_at). Pure functions, no fabricated numbers — degrades to live-queue-only when no DB history exists. Surfaced on the owner Atlas fleet board via GET /api/admin/kds/fleet.",
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
            "The decision module + API are wired to real data and now drive the live /admin/pos Tabs terminal: the POS fetches GET /api/admin/pace/steering for the active truck and badges make-now / ease items, quotes per-category promise times on the category chips + active check, and shows the bottleneck strip + delivery-intake cap, all behind the header 'Steer' toggle (on by default). The objective is margin-per-bottleneck-second (textbook Theory of Constraints) and is not yet demand-weighted, so it eases a high-volume low-margin hero (e.g. Margherita) before a premium slow item — correct for yield-per-constraint, but a production version should weight by sales velocity. Promise times assume one server per station (same limitation as the Pace engine).",
        },
        {
          name: "Allergen surfacing + admin edit",
          status: "live",
          href: "/admin/recipes",
          summary: "EU 1169/2011 + FDA Big-9 allergens (gluten, dairy, eggs, fish, shellfish, nuts, peanuts, soy, celery, mustard, sesame, sulfites, lupin, molluscs) on each menu item. Editable from the recipe editor at /admin/recipes — tap a chip in the Dietary disclosures section to toggle. Persists through MenuOverride.allergens (seed items) or CustomMenuItem.allergens (admin-created items); `null` clears the override and the customer falls back to the kodawari seed; `[]` declares 'no major allergens' explicitly. Render surfaces: customer item-detail drawer, kitchen expo board (/kitchen/[slug]/expo). Not yet rendered on the per-station AdminKDS ticket or on the menu-card CompliancePills row — both planned. The merge in getMenuWithOverrides() backfills item.allergens from src/data/kodawari.ts when no override is set, so the data path is unified for downstream consumers.",
        },
        {
          name: "KDS order simulator",
          status: "live",
          href: "/admin/kds",
          summary:
            "Demo / training tool with no separate page: flip kdsSimulatorEnabled in /admin/settings (owner-only toggle) and the Kitchen Display shows a 'Sandbox — not real orders' badge beside the page title and manual Add 1 / Add 5 / Purge all controls in its top toolbar (desktop + mobile). There is NO auto-spawn or auto-advance — the operator adds a controlled batch of tickets, then works each one through the board with the normal Start prep / Mark ready / Bump buttons, so the demo is fully under their control rather than a random trickle. Every ticket is unmistakably marked — a purple dashed frame + 'SIMULATION — not a real order' tag per ticket, plus the sandbox badge beside the page title. Orders are built ONLY from the truck's real menu via getMenuWithOverrides() (no made-up products) through createSimulatedOrder(), which fires the same order-created SSE event a real checkout does so the board lights up live (the board also calls refresh() after each Add/Purge for instant feedback). Every order carries simulated:true, so getOrders() filters them out of EVERY non-KDS read by default: the dashboard, Orders list, /kitchen station + expo screens, the floor-ops + fleet roll-ups (promise-accuracy / throughput sparkline) and every report / CRM / analytics stay clean, and sims never trigger stock decrement, customer rollups or outbox SMS/email. Only the Kitchen Display boards opt in (?includeSimulated=1) — the floor board AND the owner Atlas fleet board, on both desktop and mobile. Advancing a sim on the board is routed through updateOrderStatus, which short-circuits all side effects for simulated:true. Targets the truck in the top-bar location selector; the endpoint self-caps active sims (40) and bounds reads to the last 24h. Turning the toggle off purges every simulated ticket.",
          caveats:
            "Off by default — flip it on at /admin/settings (owner). Add (spawn) API rejected when the toggle is off (purge always allowed for cleanup); the endpoint is kitchen+ so the controls work for whoever is at the pass. Add 5 is the per-tap max (count clamped 1–5); keep tapping to build a bigger rush up to the 40-active cap. Sims drive the orders-based board but do NOT fire per-station kds_tickets rows (that table has no cascade on order delete, so firing them would orphan rows on purge), so bump-time P95 stays '—' during a pure-sim demo.",
        },
        {
          name: "WhatsApp chat simulator",
          status: "live",
          href: "/admin/whatsapp",
          summary:
            "Demo / training tool with no separate page (mirrors the KDS order simulator): flip whatsappSimulatorEnabled in /admin/settings (owner-only toggle) and the WhatsApp console shows a 'Sandbox' tag plus manual Add 1 / Add 5 / Purge controls on the stats/filter strip. There is NO auto-spawn — the operator adds a controlled batch, then reads/replies to each chat with the normal thread composer. Each spawn (POST /api/admin/whatsapp-simulator, action: spawn, count clamped 1–5) builds a synthetic-but-real conversation ONLY from a real truck menu via getMenuWithOverrides() (no made-up products), at a random funnel stage (browsing / cart / fulfillment+slot / awaiting payment), and writes it through saveSimulatedWaConversation() — a real WaSession (simulated:true) + a real transcript — so the console renders it exactly like a live chat. Sandbox chats use a reserved +48999XXXXXX phone range, carry a '(sim)' customer name and a purple 'sim' badge in the list + 'sandbox' badge in the thread head, and never send a real WhatsApp message (the simulator writes straight to the store, bypassing the Meta provider). Spawned phones are tracked in a whatsapp-sim-phones.json registry so Purge (action: purge) clears every sandbox session + transcript in one shot. Spread across active trucks for variety unless scoped to one location.",
          caveats:
            "Off by default — flip it on at /admin/settings (owner). Spawn API rejected when the toggle is off (purge always allowed for cleanup); the endpoint is manager+ so the controls work for whoever is at the console. Registry self-caps at 30 active sandbox conversations — purge before adding more. Sandbox sessions are real store rows, so while live they DO appear in the WhatsApp channel metrics strip (active sessions / awaiting-pay counts) — that's intended for the demo; they create no real Order, so the orders/conversion/revenue metrics stay clean. Turning the toggle off purges every sandbox conversation.",
        },
        {
          name: "Role-aware KDS — owner / manager / chef lenses",
          status: "live",
          href: "/admin/kds",
          summary:
            "One live-order KDS engine, three lenses by role. OWNER lands on the Atlas Fleet command board — on desktop AND mobile (the dark fleet-command surface reflows to a single-column responsive layout on a phone, with the Fleet ↔ Floor toggle dropping to the dedicated mobile KDS): both trucks side by side on a dark fleet-command surface, each with a live health ring/score, a stat row (active / at-risk / late / ready / on-shift + a throughput sparkline), the per-truck Pace layer (covers/hr, revenue/hr, a bottleneck capacity meter, and per-station pace gauges), and a tone-sorted ticket stack with depleting SLA rings, the violet predicted-miss tier, allergen alerts and notes. A fleet command bar aggregates active / at-risk / late / ready / throughput / covers / revenue and a cross-truck promise-accuracy benchmark (per-truck bars vs target, leader-vs-lagger gap, throughput-weighted fleet mean). Header carries a station filter, an All / New / In progress / Ready / Expo lines switcher (live fleet counts), Refresh, a live clock, and Fullscreen (native Fullscreen API + a portaled overlay that escapes the admin shell per CLAUDE.md rule #4). Tickets advance inline (Start prep / Mark ready / Bump) through PUT /api/admin/orders; clicking a truck header drills into its floor board (sets location + switches lens). A Fleet ↔ Floor toggle persists the choice. GET /api/admin/kds/fleet, owner-only, opts into simulated tickets (?includeSimulated=1, each marked with a dashed frame + 'SIMULATION' tag) so a sandbox rush lights up the board for demos, 1s live tick + 6s data refresh. MANAGER / FRANCHISEE (and an owner drilled into a truck) get the floor board plus a floor-control header: live open / late / due-soon / oldest / average-age from the active orders the board streams, with throughput (done last hour) + on-shift staff (open time-punches) + live 86 management (restore chips + '86 an item' picker) from GET /api/admin/kds/floor-ops. CHEF (kitchen / staff) get a line strip: their station persists across reloads, focused-station queue depth (tickets in queue + oldest age), and one-tap 86 of an item they've run out of (candidates are the items actually on the active tickets) + restore, via the kitchen-permitted GET/POST /api/admin/kds/eighty-six (audit-logged as menu.item_86). Every surface — the Atlas fleet board, the floor board (desktop + mobile, which keeps its New / In prep / Ready lanes) and the fullscreen kiosk — renders ONE shared KdsTicketCard (ring timer, predicted-ready line, violet at-risk tier, allergen alert, station-grouped items) built by buildKdsTicket and toned by the same analyzeTruck predictive engine, so the cards are byte-for-byte identical across the whole KDS. Both the floor board and the Atlas fleet board opt into simulated tickets (?includeSimulated=1) so the order simulator can stream a marked SIMULATION rush onto them; the floor-ops / fleet roll-ups (promise-accuracy + throughput sparkline, from the kds_tickets ledger) and every report stay real-only. Bump-time P95 reads getKdsStationAnalytics (real kds_tickets only).",
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
          name: "Ops Agent (Claude)",
          status: gatewayConfigured() ? "live" : "needs-config",
          envVars: ["ANTHROPIC_API_KEY"],
          href: "/admin/ai/agent",
          summary: "Conversational agent with read + write tools. Mutating actions require operator approval.",
        },
        {
          name: "Tool registry + audit",
          status: "live",
          summary: "8 tools: query_orders, query_customers, refund_order, mark_item_86, send_sms, etc. Every call audit-logged as actor='claude:<userId>'.",
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
            "End-to-end wired (audit §3 fix). web-push installed, sendNotification path calls the real push service. Order-confirmation page mounts <PushOptInButton/> — surfaces only when VAPID configured + browser supports push, and silently hides for already-subscribed devices. Outbox dispatcher fans `order.ready` events to every saved subscription per phone, prunes 404/410 endpoints. SW already shipped at /public/sw.js with push + notificationclick handlers.",
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
          href: "/admin/whatsapp",
          summary:
            "LLM-driven WhatsApp Business ordering: customer messages the number, Claude walks them through menu → cart → slot → Stripe Checkout link in chat. Signature-verified Meta webhook at /api/whatsapp/webhook. The /admin/whatsapp operator console is a KDS/POS-style command surface (3-pane inbox: live conversation list · chat thread with operator reply + re-open template · context panel showing cart/order/funnel), with a fullscreen kiosk mode. The Inbox/Live/Awaiting-pay/Archived filters drive an operator-side auto-archive: a chat with no new message for `autoArchiveMinutes` (default 5) drops to Archived — console-only, so the customer's 90-min bot session/cart is untouched and a new message restores it to the inbox. The Settings overlay (WhatsAppSettingsDialog) is the advanced config hub, all wired end-to-end via WaSettings: Channel (enable, default location, daily cap), Messages (welcome, opt-out keywords, re-open template), Conversation lifecycle (auto-archive minutes), AI concierge (enable/disable + extra system-prompt instructions appended to the base prompt in lib/whatsapp/turn.ts, plus an away message sent when AI is off), and Auto-replies/scripts (keyword→canned-reply pairs matched in the webhook BEFORE the LLM). Business hours (Europe/Warsaw, per-day open/close + closed days, computed in lib/whatsapp/hours.ts) gate the bot in the webhook — outside hours the away message is sent instead of taking an order, while auto-replies still answer 24/7. Operators can also manually Pin a chat (never auto-archives, stays in the inbox) or Archive it now from the context panel; a new inbound message un-archives automatically. Switches save instantly; text fields save with the button.",
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
          name: "Customer identity (phone-based)",
          status: "live",
          summary: "Auto-enrolment on checkout via the sud-italia-customer cookie + /api/customer/identify. No password.",
        },
        {
          name: "Three ordering modes (takeout / delivery / dine-in)",
          status: "live",
          href: "/admin/slots",
          summary:
            "Cart drawer offers Takeout, Delivery, and Dine-in. Dine-in is reserve-a-table-and-pre-choose-food: the customer sets a party size, picks a time slot (the booking time), and the cart is the food prepared for when they sit down. Party size persists on the order (Order.partySize) and surfaces on the order tracker, KDS ticket, and admin order detail. A mode only shows time slots the operator has opened for it — enable dine-in slots at /admin/slots by ticking the Dine-in fulfillment type. Reports + the channel-mix pie split orders three ways.",
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
          summary: "AbandonedCartWrapper persists the cart; banner surfaces 'finish your order' on return.",
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
      ],
    },
    {
      id: "growth",
      title: "Growth & retention",
      items: [
        {
          name: "Loyalty points",
          status: "live",
          href: "/admin/loyalty",
          summary: "Order-based + manual adjustments. Tier upgrades trigger push + email.",
        },
        {
          name: "Referral codes",
          status: "live",
          href: "/admin/growth",
          summary: "Per-customer codes embedded in receipts.",
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
          summary: "Free-delivery bar shows a personalised threshold tuned to the customer's lifecycle: first-time 39 PLN, growing (2–4 orders) 49 PLN, regular (5+) 59 PLN, Gold/Platinum 35 PLN (audit §3 — raised from 0 because VIPs were getting free delivery on 6.90 zł bottles of water, breaking unit economics on a 9 zł courier run). The checkout fee charge uses the same threshold via computeDeliveryFee(_,_, override) and getCustomerSegment(), so the bar and the receipt agree.",
        },
        {
          name: "Delivery-exclusive SKUs + Pantry Pack bundle",
          status: "live",
          summary: "Three delivery-only SKUs per truck (audit §3 channel economics): Frozen Tiramisù Box (24/28 zł, ~600g serves 4), Peroni Nastro Azzurro 4-Pack (32/36 zł), Sud Italia EVOO 250ml (35/39 zł). Each carries deliveryOnly:true on MenuItem so the menu page filters them out for dine-in/takeout carts. Delivery-only Pantry Pack bundle composes pizza + frozen tiramisù + beer + olive oil at 15% blended discount — surfaces only when fulfillmentType=delivery. Drives high-AOV pantry pulls customers can't carry from a truck.",
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
          href: "/admin/loyalty",
          summary: "Audit §3 — removed the strictly-dominated 'PLN 10 Off' reward (100 points → 10 zł value vs Free Drink at 50 pts → up to 11.90 zł — customers spot the bad ratio and avoid it, dragging perceived loyalty value). New ladder: Free Drink 50pts, Free Garlic Bread 70pts, Free Dessert 120pts, Free Personal Pizza 180pts, Free Pizza 280pts, 25 PLN Off 280pts. No rung is strictly dominated by another (each unlocks a different category or threshold). Value-per-point declines as customers save up — that's intentional save-up incentive economics, with the higher rungs (Free Pizza, 25 zł Off) acting as aspirational targets while the 50-pt entry stays attractive for fast redeem.",
        },
        {
          name: "Contextual pairing graph",
          status: "live",
          summary: "Cart upsell chips re-rank by composite score combining margin × attach, hour-of-day bias (espresso 0.82 at 11:00, 0.31 at 19:00), per-customer attach history (`you added it 3 of last 4 visits`), and a small novelty decay so chips rotate. Pure scorePairing() in upsell.ts; cart drawer feeds context via /api/customer/attach-history. Audit §3.1.",
        },
        {
          name: "Bundle architecture (Lunch / Family / Late-night)",
          status: "live",
          href: "/admin/upsell",
          summary: "Restructured May 2026 (revenue-audit-5jrVU). Four parallel ladders: (1) pasta-led lunch [Solo 27.90 → Lunch 38.90 → Lunch+ 44.90 → Big Lunch 68.90 decoy], (2) pizza-led lunch — NEW — [Pizza Solo 22.90 → Pizza Lunch 39.90 → Pizza Lunch+ 44.90, hits the hero product], (3) family [Pizza Family Pack fixed 99 zł — NEW — → Family 18% → Family Feast 22% anchor → Feast Deluxe 25% true decoy gated at 6 mains], (4) late-night [Slice + drink 16.90 entry — NEW — → Late dinner 20% default → Late Party 28% anchor — NEW]. Family minimum raised 2→3 (couples were being padded into bundles), Feast Deluxe discount lifted to true scale-economics offer that only dominates at 6+ mains. Hungry tier rebuilt as a true decoy (savings % below Lunch+ so dominance theory works). Anchor SKUs (Tartufata Reale 79.90/89.90, Pizza del Pizzaiolo 49.90/54.90) excluded from category-slot resolution so they can't be folded into discounted bundles. Channel-aware: delivery-only Pantry Pack bundle (frozen tiramisù + Peroni 4-pack + olive oil) surfaces only when fulfillmentType=delivery. Member-only tier visibility flag drives phone collection as conversion lever. Server caps charged amount at min(server-recomputed, client-snapshot). Combo banner suppressed when bundle ladder showable. Audit §3.",
        },
        {
          name: "Bundle experimentation (A/B)",
          status: "live",
          href: "/admin/upsell",
          summary: "Full A/B harness manageable in /admin/upsell → Experiments tab. ExperimentEditor lets the operator define one per-location experiment with weighted variants and per-bundle discount overrides (single percent OR split mains/add-ons). Customer phone → SHA-256 bucket → stable variant assignment so a customer always sees the same offer across visits and the server can reproduce the variant at checkout. Each BundleEvent records the variant id; /api/admin/bundle-analytics rolls up avg paid + avg saved per variant for direct AOV / contribution-profit comparison on the Reports page. Server resolver in src/lib/experiments.ts; client mirror via Web Crypto SHA-256 so client + server agree.",
        },
        {
          name: "Bundle scarcity + weekday gating",
          status: "live",
          href: "/admin/upsell",
          summary: "Every dynamic bundle row in /admin/upsell carries a 'Limited until' date input + a per-weekday chip selector (Mon–Sun). Past-dated bundles auto-deactivate; weekday-gated bundles only surface on matching local days so operators can run Friday Family Feast pushes / Wednesday Lunch+ defaults without code. Both fields validate server-side and round-trip through saves.",
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
          name: "Bundle low-margin operator alert",
          status: "live",
          href: "/admin",
          summary: "Every bundle order's contribution margin is computed at write time using MenuItem.cost (food cost) ÷ finalPriceGrosze. When margin drops below 40%, addNotification posts a `bundle_low_margin` alert into the operator notification inbox with bundle name + exact margin % + order total so the operator can re-tune discount % in /admin/upsell before the next order lands. Threshold matches the amber/red line on the live BundleMarginPreview in the bundle editor.",
        },
        {
          name: "Composer 'same as last time' (repeat-customer one-tap)",
          status: "live",
          href: "/admin/upsell",
          summary: "Bundle composer (Domino's Mix & Match) pre-fills picks from the customer's most-recent applied composition for the same bundle. Customer sees a ★ banner 'Same as your last X — confirm or tweak below' so a repeat order is one tap. Pipeline: BundleEvent.addOnComposition (persisted per order), GET /api/customer/last-bundle, BundleComposerSheet useEffect on open. Drops the perceived friction Domino's reports a ~7% AOV uplift from.",
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
          name: "Sud Italia Corporate",
          status: "live",
          href: "/admin/corporate",
          summary: "Bulk-ordering primitive for companies with 6+ employees (the brief's >5 employees rule, enforced at promotion time). Promote a FamilyWallet to a corporate account in /admin/corporate: public landing at /corporate/[slug], billing email for the head's monthly invoice, head bonus rate (default 20% of pool), minimum-employee gate (default 6), optional auto-pre-order day/time. Cart drawer surfaces an `Ordering with [company]` banner with the Sud Italia Corporate kicker when the active wallet is a corporate account; employee ordering bills to the company card while personal loyalty points stay individual. Head bonus is folded into the head's spendablePoints via resolveCustomerLoyalty() so it's immediately redeemable. POST /api/corporate/[slug]/join sends an SMS OTP; existing /rewards confirm flow promotes the employee to active. Audit §3.4.",
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
          summary: "Daily dispatcher fires /api/admin/cron/corporate-preorder-reminder. For every corporate with autoPreorderDay/Time configured, when today matches the day AND we're within 3 hours of the scheduled time, SMS-nudges every active employee who hasn't placed an order today (`Sud Italia — Acme Wednesday 12:30 lunch. 4/8 teammates ordered. Pick your meal: …`). Dedupe key = ISO date + phone so retries skip already-queued reminders. SMS opt-out honoured. Audit §3.4 row 5.",
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
          name: "Item modifiers (pizza crust + premium toppings)",
          status: "live",
          href: "/admin/menu",
          summary: "Per-item modifier groups (audit §3 — the previously-missing #1 revenue capability). Each MenuItem can carry `modifierGroups[]` — each group has a label, min/max selections, and an option list with priceDelta (added to line price) and costDelta (subtracted from gross margin). Margherita ships with Crust group (Standard / Sourdough +5 / Gluten-free +5) and Premium toppings (Buffalo mozz +9, Extra cheese +6, Truffle oil +8, Prosciutto +12). Diavola ships with Spice level + Premium toppings. **Editor lives on /admin/menu** — open any item, the ModifierEditor at the bottom of the dialog manages groups, options, min/max picks, priceDelta, costDelta, KDS-highlight flag. MenuOverride.modifierGroups round-trips through the menu API (validated by api-schemas.ts) so groups persist per-location. Cart math (src/store/cart.ts:getTotal) uses effectiveUnitPrice() which sums modifier priceDelta × qty. Server checkout (createOrder.ts) re-validates every selection against the current menu and reuses the same helper so charged total matches displayed total. Operator at-a-glance inventory at /admin/upsell → Item modifiers shows every modifier group per truck with GM% callout.",
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
          href: "/admin/loyalty",
          summary: "Bronze / Silver / Gold / Platinum tiers with 1×–3× points multipliers and perks.",
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
          summary: "Customer-site strip of dynamic widgets (orders/hour, currently preparing, trending, prep time, happy hour, truck location, free text). CRUD in Growth → Live widgets, per-location targeting, cap of 7 active.",
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
          href: "/admin/pos",
          summary:
            "Staff-facing point of sale at /admin/pos — the dark 'Tabs' terminal ported from public/mockups/pos/06-tabs.html, reusing the KDS Atlas visual language so POS + KDS read as one system. A rail of concurrent OPEN CHECKS (tabs) sits front and centre, each its own running total + status (open / parked / ready-to-pay) and channel colour (Takeout=blue, Delivery=amber, Dine-in=purple, grey until chosen); staff switch between them, open new ones (N), park, and send/charge each independently. Tabs are server-backed (PosTab in src/lib/store.ts → GET/POST/PUT/DELETE /api/admin/pos/tabs, per location) so they survive a refresh and are shared across tills — lines store menu-item ids + quantities only, never prices. Product grid is the truck's real menu (getMenuWithOverrides) with role badges / tags / category 'All' grouping; an in-column channel selector is required before send or charge (deliveryOnly SKUs only on Delivery). Dine-in tabs carry covers + a real floor table from /admin/floor (with cross-check table-conflict detection); delivery tabs capture an address. Combo deals (getActiveComboDeals, admin-configured in /admin/crosssell) auto-discount the live cart, an order-aware AI offers panel surfaces combo-completion + cross-sell (getCartSuggestions), and the Pace→POS steering feed (/api/admin/pace/steering) badges make-now / ease items + quotes capacity-true promise times when the line gets hot. 'Send to KDS' POSTs /api/admin/pos/orders {tabId}: the server rebuilds the order from the persisted tab + real menu + combo discount and calls createOrder (KDS ticket + stock decrement + Orders list), suppressNotifications + synthetic same-day 'walkin' slot; it's idempotent per tab (re-send re-syncs the same Order, no duplicate). 'Charge' → tender (Cash / Card) PATCHes the same route to stamp the Order paid and close the tab. Fullscreen kiosk (portaled per CLAUDE.md rule #4). Staff+, per-location.",
          caveats:
            "Tender is a record-only step — Cash / Card stamps the Order paidAt; Stripe-terminal / cash-drawer integration is a later pass. Tabs default to 'Tab N' names (rename inline in the ticket header). Item modifiers (crust, extra toppings) aren't selectable from the POS yet — base items only. AI offers + steering are the existing heuristic / Theory-of-Constraints engines, not yet a trained model.",
        },
        {
          name: "Floor — tables + reservations",
          status: "live",
          href: "/admin/floor",
          summary:
            "Per-location floor management at /admin/floor. Tables tab: define physical tables (number, seats, zone, status available/seated/reserved/out-of-service) via /api/admin/floor/tables. Reservations tab: day-by-day bookings (customer, party size, time + duration, assigned table, status) via /api/admin/floor/reservations, with double-booking conflict detection — two active bookings whose windows overlap on the same table return 409 (operator-overridable). The assigned table flows onto dine-in orders (Order.tableId) and the POS table picker. Conflict logic is pure + unit-tested (src/lib/floor.ts + floor.test.ts). Manager+, per-location.",
          caveats:
            "Tables + reservations persist via the JSON store (readJSON/writeJSON) like slots/suppliers — no dedicated Postgres table yet, fine at truck volumes. Reservations are independent of the time-Slots system (they don't reserve a checkout slot). No spatial floor-map / drag layout — tables are a list/grid.",
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
            "Sandbox monthly P&L bound to real-order actuals (orders/day, AOV, weighted COGS, delivery share, refund rate, median ticket time — all pulled from /api/admin/orders over a 90-day rolling window and applied with one click). Tune revenue inputs, labor mix (with volume-flex), fixed costs, waste / refund / loyalty / CIT / D&A / interest, kitchen capacity (peak-hour throughput ceiling), and channel-split payment fees (cash / on-site card / Glovo / Wolt). 9 behavior levers, 5 weather/calendar levers, per-month seasonality overrides. Institutional-grade KPI suite: EBITDA, EBITDAR, cash-on-cash return, occupancy ratio, refund-adjusted net sales, contribution per labor hour (QSR target ≥150 zł/h), promo-adjusted AOV, peak orders/hour, median ticket time, true contribution margin, kitchen-capacity utilisation. Two 2-D heatmaps, scenario comparison, ±20% sensitivity, sensitivity tornado across all key drivers, 12-month operational projection, and a 24-month investor view with 4-month opening ramp surfacing NPV @ 10/15/20%, IRR, and cumulative-cash break-even. Break-even chart shows the current operating point vs ceiling at a glance. Master toggle in Settings → General. Defaults are Warsaw 2026 (gross × 1.22 ZUS narzut, 5-year truck depreciation). Zero writes to the business-costs ledger.",
        },
        {
          name: "Calculator actuals (real-order ground truth)",
          status: "live",
          href: "/admin/simulation#unit-economics",
          summary:
            "GET /api/admin/simulation/actuals?days=90 returns a rolling-window snapshot from the live orders table: orders/day, avg ticket, menu-mix-weighted COGS (Σqty×cost ÷ Σqty×price across every line item, modifiers honoured), delivery vs takeout share, refund/cancellation rate. The Calculator tab renders this as a strip above the inputs with variance vs the operator's typed values; flagged as warning when scenario drifts > 15% from reality. One-click 'Apply actuals' button writes the snapshot back to the scenario. seedSimulationFromHistory also pulls it, so /api/admin/simulation?seed=1 starts from reality instead of defaults.",
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
          href: "/admin/slots",
          summary: "Atomic increment (no overselling). Auto-close past slots via cron.",
        },
        {
          name: "Refunds (Stripe)",
          status: has("STRIPE_SECRET_KEY") ? "live" : "needs-config",
          envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
          summary: "Full + partial. manager_comp reason skips Stripe.",
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
          summary: "VAT XML for the Polish tax authority. Summary preview before the accountant downloads.",
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
            "Stable per-phone code, /r/CODE landing drops a 30-day cookie, first paid order qualifies the redemption, outbox dispatcher credits 100 points to the referrer + SMSes them the win. Acquisition cost capped at the 10 PLN referee discount.",
          caveats:
            "Cart drawer still needs to read the `sud-italia-referral` cookie and apply the 10 PLN discount + post to /api/referrals at checkout. Backend is fully wired; the cart UI hook is the remaining work.",
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
      ],
    },
    {
      id: "field",
      title: "Field ops (PWA)",
      items: [
        {
          name: "Service worker + offline shell",
          status: "live",
          summary: "Cache-first shell, stale-while-revalidate for menu/settings.",
        },
        {
          name: "IndexedDB outbox + bg sync",
          status: "live",
          summary: "Failed mutating fetches queued; replayed on online or sync event.",
        },
        {
          name: "Live truck location",
          status: has("UPSTASH_REDIS_REST_URL") ? "live" : "needs-config",
          envVars: ["UPSTASH_REDIS_REST_URL"],
          summary: "Operator PWA POSTs every 30s while event=live. 90s TTL — no track history kept.",
        },
        {
          name: "Public nearby-truck endpoint",
          status: "live",
          href: "/api/public/truck-events/live",
          summary: "Returns live trucks + distance + nearby (500m geofence) when lat/lng provided.",
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
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Platform capabilities</h1>
          <p className="v2-page-subtitle">
            Every feature shipped across Phases 0-5, grouped by domain. Status reflects current env config — flip a needs-config entry to live by setting the listed env vars and redeploying.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:gap-6">
        {groups.map((group) => (
          <section key={group.id} className="glass-card p-4 md:p-5">
            <h2 className="admin-text text-base font-semibold mb-3">{group.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map((item) => (
                <CapabilityCard key={item.name} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
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
}

interface CapabilityGroup {
  id: string;
  title: string;
  items: Capability[];
}

function CapabilityCard({ item }: { item: Capability }) {
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
      {item.href && (
        <p className="mt-2 text-[11px]">
          <span className="text-[var(--info)] underline">{item.href}</span>
        </p>
      )}
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }
  return content;
}
