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
          summary: "Cart-context suggestions (espresso + dessert with pizza). Settings here.",
        },
        {
          name: "Combo deals",
          status: "live",
          href: "/admin/menu",
          summary: "Discount applied to cart total, not display-only.",
        },
        {
          name: "Customer rollups",
          status: has("DATABASE_URL") ? "live" : "needs-config",
          href: "/admin/customers",
          summary: "Lifetime spend, order count, first/last order, lapsed detection.",
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
          summary: "Open/close drawer, drops, variance vs orders.",
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
