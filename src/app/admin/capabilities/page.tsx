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
          name: "Truck ops admin",
          status: "live",
          href: "/admin/truck",
          summary: "Maintenance log + route planner. Pairs with the public live-truck endpoint.",
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
          summary: "Longest-prep first; siblings auto-staggered. Red+audible at <0s to promise.",
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
          name: "Allergen surfacing on tickets",
          status: "live",
          summary: "menu_items.allergens chips on KDS tickets. Edit in /admin/menu.",
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
          name: "Insights dashboard (heuristic)",
          status: "live",
          href: "/admin/ai",
          summary: "Forecasts, anomalies, reorder suggestions. Statistical — not Claude-backed yet.",
        },
        {
          name: "Demand forecasting",
          status: "live",
          href: "/admin/ai",
          summary: "7-day expected orders per location with weather impact + confidence band.",
        },
        {
          name: "Dynamic pricing suggestions",
          status: "live",
          href: "/admin/ai",
          summary: "Margin-based price-change recommendations with revenue-impact estimate.",
        },
        {
          name: "Anomaly detection",
          status: "live",
          href: "/admin/ai",
          summary: "Flags unusual sales patterns and quality outliers from historic baselines.",
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
          envVars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
          summary: "Run `npx web-push generate-vapid-keys` and set both keys. SW + subscribe endpoint already shipped.",
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
            "LLM-driven WhatsApp Business ordering: customer messages the number, Claude walks them through menu → cart → slot → Stripe Checkout link in chat. Signature-verified Meta webhook at /api/whatsapp/webhook. Toggle + opt-out controls live at /admin/whatsapp.",
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
          summary: "Cart-context complementary-item suggestions (espresso + dessert with pizza), combo deals, time-of-day banners, and menu badges. Settings at /admin/crosssell.",
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
          summary: "Free-delivery bar shows a personalised threshold tuned to the customer's lifecycle: first-time 39 PLN, growing (2–4 orders) 49 PLN, regular (5+) 59 PLN, Gold/Platinum 0 PLN. The checkout fee charge uses the same threshold via computeDeliveryFee(_,_, override) and getCustomerSegment(), so the bar and the receipt agree. Audit §2.5 + §3.3.",
        },
        {
          name: "Contextual pairing graph",
          status: "live",
          summary: "Cart upsell chips re-rank by composite score combining margin × attach, hour-of-day bias (espresso 0.82 at 11:00, 0.31 at 19:00), per-customer attach history (`you added it 3 of last 4 visits`), and a small novelty decay so chips rotate. Pure scorePairing() in upsell.ts; cart drawer feeds context via /api/customer/attach-history. Audit §3.1.",
        },
        {
          name: "Bundle architecture (Lunch / Family Feast)",
          status: "live",
          href: "/admin/upsell",
          summary: "Decoy + anchor + default-pushed combos surfaced in the cart drawer above the per-item chips. Lunch ladder is hour-gated (default 11:00–14:00); Family Feast ladder is quantity-gated (default ≥5 pizza+pasta items, with a one-line nudge when within 2 of the threshold). Tapping a tier locks the cart subtotal to the bundle's priceGrosze; checkout sends one Stripe line at the bundle price with the composition itemized in the description. Both the bundle ladder (tiers, prices, slot composition, default/anchor/decoy flags) and the availability rules are fully CRUD-editable in /admin/upsell → Bundle ladders / Bundle rules. DEFAULT_BUNDLES + DEFAULT_BUNDLE_RULES in src/lib/bundles.ts fall back when no admin override is saved. Audit §3.2.",
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
          href: "/admin/menu",
          summary: "Discount applied to cart total, not display-only.",
        },
        {
          name: "Menu engineering hierarchy",
          status: "live",
          href: "/admin/menu",
          summary:
            "Audit §4 shipped. Items carry a `menuRole` (hero | profit-driver | anchor | lto) that drives card hierarchy on the public menu: Margherita renders as a full-width hero with the cream-gradient frame, Quattro Formaggi / Linguine al Pesto / Espresso get the gold Pizzaiolo's Choice badge, and the new Pizza del Pizzaiolo (Kraków 47.90 PLN / Warszawa 52.90 PLN — truffle + buffalo mozzarella, monthly LTO) renders with the dark Chef's Signature treatment and the days-left countdown. The default menu sort is now Pizzaiolo's layout: hero → profit-driver → anchor → standards by popularity → alpha tie-break (compareMenuEngineering in src/lib/upsell.ts). All Kraków + Warszawa prices re-aligned to the §4.2 charm-pricing rules (pizza ends in 9, premium pasta in 5, espresso in 9, desserts in 0).",
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
          name: "Inventory + recipes + stock",
          status: "live",
          href: "/admin/inventory",
          summary: "Per-ingredient stock, recipe BOMs, variance reports.",
        },
        {
          name: "Suppliers + purchase orders",
          status: "live",
          href: "/admin/purchase-orders",
          summary: "Multi-line POs with status workflow.",
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
          name: "Wolt + Glovo webhook intake",
          status: env.ENABLE_AGGREGATORS === "true"
            ? has("WOLT_WEBHOOK_SECRET") || has("GLOVO_WEBHOOK_SECRET")
              ? "live"
              : "needs-config"
            : "disabled",
          envVars: [
            "ENABLE_AGGREGATORS",
            "WOLT_API_KEY",
            "WOLT_WEBHOOK_SECRET",
            "GLOVO_API_KEY",
            "GLOVO_WEBHOOK_SECRET",
          ],
          summary: "HMAC-verified webhooks. Mock providers run when credentials are absent.",
        },
        {
          name: "Unified KDS source tagging",
          status: "live",
          summary: "Aggregator orders flow into the same KDS as direct, tagged via specialInstructions.",
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
}

interface CapabilityGroup {
  id: string;
  title: string;
  items: Capability[];
}

function CapabilityCard({ item }: { item: Capability }) {
  const toneClass =
    item.status === "live"
      ? "border-emerald-400/30 bg-emerald-500/5"
      : item.status === "needs-config"
        ? "border-amber-400/30 bg-amber-500/5"
        : "border-white/10 bg-white/5";
  const dotClass =
    item.status === "live"
      ? "bg-emerald-400"
      : item.status === "needs-config"
        ? "bg-amber-400"
        : "bg-gray-500";
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
      {item.envVars && item.envVars.length > 0 && item.status !== "live" && (
        <p className="mt-2 text-[10px] admin-text-secondary">
          Set:{" "}
          <code className="font-mono text-amber-200">
            {item.envVars.join(", ")}
          </code>
        </p>
      )}
      {item.href && (
        <p className="mt-2 text-[11px]">
          <span className="text-blue-300 underline">{item.href}</span>
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
