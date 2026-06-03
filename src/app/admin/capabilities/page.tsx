import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { adminBaseForRole, withAdminBase, type AdminBase } from "@/lib/admin-base";
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
          summary: "5/min/IP login, 10/min/IP checkout, 5/min/phone feedback, plus a blanket per-user limit on EVERY admin API route (default 300/min/user, override ADMIN_RATE_LIMIT_PER_MIN) enforced inside withAdmin. Fail-open on Redis error.",
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
          summary: "Every write tagged with actor + entity. Full retention, no trim.",
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
          summary: "A manager's home after sign-in (managers no longer land on the owner's company-wide /admin HQ, which is now owner-gated server-side). /manager is a standalone admin-themed surface (its own layout loads the Admin theme like /franchisee) showing today's revenue, orders, covers and who's on shift — every figure derived live from real orders (getOrders) + shifts (getShifts/getStaff), filtered to the manager's location scope (the same */comma-list claim the session enforces). Owners can preview it; staff/kitchen are redirected to their own surface. It is a home, not a cage: quick links jump into the operational pages (Orders, KDS, Schedule, Inventory, POS, Team) a manager's granular permissions already grant. Those back-office pages are served under the manager's own URL prefix — /manager/* (a franchisee gets /franchisee/*, the owner keeps /admin/*) — via Next.js rewrites onto the single /admin/* page set, so the path reads as their space, not 'admin'; the whole shell (sidebar, command palette, breadcrumbs, intra-page links) re-roots onto that prefix and a stray /admin/* URL converges back to it (src/lib/admin-base.ts). Landing is mapped once in src/lib/staff-roles.ts → landingPathForRole.",
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
          summary: "Per-user, action-level permission grants (71 capability keys across orders, menu, finance, growth, system). Only an owner can grant — user-management writes are owner-only. Each non-owner account inherits its role's default preset or carries a fully-custom grant edited in the user dialog. Enforced end-to-end: the sidebar + a page guard hide forbidden surfaces, withAdmin rejects ungranted /api/admin/* calls, and high-value handlers (refunds, cash, GDPR export, loyalty adjustments, purchase orders, settings) re-check the specific capability at the call site. Owners are always full-access; accounts left on 'role default' keep legacy role-rank behaviour. Catalog + maps: src/lib/permissions.ts.",
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
      id: "core-systems",
      title: "Core systems (Guest Engagement)",
      items: [
        {
          name: "Guest Engagement hub",
          status: "live",
          href: "/core/guest",
          summary:
            "One surface for the relationship layer (/core/guest) with four views — Inbox (live WhatsApp conversations + order context + funnel), Guests (the CRM customer book), Loyalty (the member roster + family wallets + redemption log) and Concierge (the AI capability layer + EU-14 allergen matrix). CRM, Loyalty, Concierge and WhatsApp are no longer separate sidebar entries; the old /admin/crm, /admin/loyalty, /admin/concierge and /admin/whatsapp routes redirect into the matching view, and every view shares the canonical customer record, identity-merge rules and loyalty-points ledger.",
        },
        {
          name: "CRM — Regulars customer book",
          status: "live",
          href: "/core/guest?view=guests",
          summary:
            "System of record for every customer who leaves data — members and contacts alike. Searchable book split into Agentic (WhatsApp) vs staff-channel customers, with lifecycle / data-facet / channel / period filters, a derived relationship-health gauge (RFM + reliability), AI next-best-action, invite-to-loyalty, manual points, consent toggles (toggle = saved), email collection and notes. A 'Send today' prompt surfaces today's birthdays + first-order anniversaries (GET /api/admin/campaigns/triggers). Each profile carries a GDPR panel — Export (DSAR, Art. 15, GET /api/admin/gdpr/export) and Erase (Art. 17, owner-only, POST /api/admin/gdpr/delete). Wired to live orders + loyalty members + point adjustments via /api/admin/crm.",
          caveats:
            "Relationship-health score and next-best-action are heuristics computed from RFM + reliability, not an ML churn model. No-shows are derived from cancelled orders.",
        },
        {
          name: "Loyalty — roster, wallets & redemptions",
          status: "live",
          href: "/core/guest?view=loyalty",
          summary:
            "The fourth Guest-hub view (/core/guest?view=loyalty), rebuilt onto the Core suite theme. Members tab: every loyalty member with tier badge (bronze/silver/gold/platinum), point balance, order count, lifetime spend and last-order date, with name/phone search + tier-filter chips + sortable columns, and a per-member manual point adjustment (signed amount + reason → POST /api/admin/members/points). Family wallets tab: each shared pool (up to 6 phones) with member status, dissolvable by an operator (DELETE /api/admin/wallets). Redemptions tab: the burn log (who redeemed what reward, solo or wallet). Reads /api/admin/members, /api/admin/wallets and /api/admin/wallet-redemptions; shares the one points ledger with the rest of the Guest hub. The programme config itself (tier ladder, rewards catalogue, referral mechanics) is edited at /admin/growth.",
        },
        {
          name: "Customer Intelligence — per-guest behavioural graph",
          status: "live",
          href: "/core/guest?view=loyalty",
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
          href: "/core/guest?view=loyalty",
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
          href: "/core/guest?view=concierge",
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
            "Number keys 1–9 (and 0 = 10) advance the Nth ticket in the leftmost active column — wired to AdminKDS keydown listener. No modifier required; ignored while an input/textarea is focused so admin search still works. Pairs with a USB number pad to remove ~3s of mouse hunt per bump at rush.",
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
            "The decision module + API are wired to real data and now drive the live /core/pos Tabs terminal: the POS fetches GET /api/admin/pace/steering for the active truck and badges make-now / ease items, quotes per-category promise times on the category chips + active check, and shows the bottleneck strip + delivery-intake cap, all behind the header 'Steer' toggle (on by default). The objective is margin-per-bottleneck-second (textbook Theory of Constraints) and is not yet demand-weighted, so it eases a high-volume low-margin hero (e.g. Margherita) before a premium slow item — correct for yield-per-constraint, but a production version should weight by sales velocity. Promise times assume one server per station (same limitation as the Pace engine).",
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
          href: "/core/kds",
          summary:
            "Demo / training tool with no separate page: flip kdsSimulatorEnabled in /admin/settings (owner-only toggle) and the Kitchen Display shows a 'Sandbox — not real orders' badge beside the page title and manual Add 1 / Add 5 / Purge all controls in its top toolbar (desktop + mobile). There is NO auto-spawn or auto-advance — the operator adds a controlled batch of tickets, then works each one through the board with the normal Start prep / Mark ready / Bump buttons, so the demo is fully under their control rather than a random trickle. Every ticket is unmistakably marked — a purple dashed frame + 'SIMULATION — not a real order' tag per ticket, plus the sandbox badge beside the page title. Orders are built ONLY from the truck's real menu via getMenuWithOverrides() (no made-up products) through createSimulatedOrder(), which fires the same order-created SSE event a real checkout does so the board lights up live (the board also calls refresh() after each Add/Purge for instant feedback). Every order carries simulated:true, so getOrders() filters them out of EVERY non-KDS read by default: the dashboard, Orders list, /kitchen station + expo screens, the floor-ops + fleet roll-ups (promise-accuracy / throughput sparkline) and every report / CRM / analytics stay clean, and sims never trigger stock decrement, customer rollups or outbox SMS/email. Only the Kitchen Display boards opt in (?includeSimulated=1) — the floor board AND the owner Atlas fleet board, on both desktop and mobile. Advancing a sim on the board is routed through updateOrderStatus, which short-circuits all side effects for simulated:true. Targets the truck in the top-bar location selector; the endpoint self-caps active sims (40) and bounds reads to the last 24h. Turning the toggle off purges every simulated ticket.",
          caveats:
            "Off by default — flip it on at /admin/settings (owner). Add (spawn) API rejected when the toggle is off (purge always allowed for cleanup); the endpoint is kitchen+ so the controls work for whoever is at the pass. Add 5 is the per-tap max (count clamped 1–5); keep tapping to build a bigger rush up to the 40-active cap. Sims drive the orders-based board but do NOT fire per-station kds_tickets rows (that table has no cascade on order delete, so firing them would orphan rows on purge), so bump-time P95 stays '—' during a pure-sim demo.",
        },
        {
          name: "WhatsApp chat simulator",
          status: "live",
          href: "/core/guest?view=inbox",
          summary:
            "Demo / training tool with no separate page (mirrors the KDS order simulator): flip whatsappSimulatorEnabled in /admin/settings (owner-only toggle) and the WhatsApp console shows a 'Sandbox' tag plus manual Add 1 / Add 5 / Purge controls on the stats/filter strip. There is NO auto-spawn — the operator adds a controlled batch, then reads/replies to each chat with the normal thread composer. Each spawn (POST /api/admin/whatsapp-simulator, action: spawn, count clamped 1–5) builds a synthetic-but-real conversation ONLY from a real truck menu via getMenuWithOverrides() (no made-up products), at a random funnel stage (browsing / cart / fulfillment+slot / awaiting payment), and writes it through saveSimulatedWaConversation() — a real WaSession (simulated:true) + a real transcript — so the console renders it exactly like a live chat. Sandbox chats use a reserved +48999XXXXXX phone range, carry a '(sim)' customer name and a purple 'sim' badge in the list + 'sandbox' badge in the thread head, and never send a real WhatsApp message (the simulator writes straight to the store, bypassing the Meta provider). Spawned phones are tracked in a whatsapp-sim-phones.json registry so Purge (action: purge) clears every sandbox session + transcript in one shot. Spread across active trucks for variety unless scoped to one location.",
          caveats:
            "Off by default — flip it on at /admin/settings (owner). Spawn API rejected when the toggle is off (purge always allowed for cleanup); the endpoint is manager+ so the controls work for whoever is at the console. Registry self-caps at 30 active sandbox conversations — purge before adding more. Sandbox sessions are real store rows, so while live they DO appear in the WhatsApp channel metrics strip (active sessions / awaiting-pay counts) — that's intended for the demo; they create no real Order, so the orders/conversion/revenue metrics stay clean. Turning the toggle off purges every sandbox conversation.",
        },
        {
          name: "Role-aware KDS — owner / manager / chef lenses",
          status: "live",
          href: "/core/kds",
          summary:
            "One live-order KDS engine, three lenses by role. OWNER lands on the Atlas Fleet command board — on desktop AND mobile (the dark fleet-command surface reflows to a single-column responsive layout on a phone, with the Fleet ↔ Floor toggle reflowing the same board to the phone): both trucks side by side on a dark fleet-command surface, each with a live health ring/score, a stat row (active / at-risk / late / ready / on-shift + a throughput sparkline), the per-truck Pace layer (covers/hr, revenue/hr, a bottleneck capacity meter, and per-station pace gauges), and a tone-sorted ticket stack with depleting SLA rings, the violet predicted-miss tier, allergen alerts and notes. A fleet command bar aggregates active / at-risk / late / ready / throughput / covers / revenue and a cross-truck promise-accuracy benchmark (per-truck bars vs target, leader-vs-lagger gap, throughput-weighted fleet mean). Header carries Refresh, a live clock, and Fullscreen (native Fullscreen API + a portaled overlay that escapes the admin shell per CLAUDE.md rule #4). Tickets advance inline (Start prep / Mark ready / Bump) through PUT /api/admin/orders; clicking a truck header drills into its floor board (sets location + switches lens). GET /api/admin/kds/fleet, owner-only, opts into simulated tickets (?includeSimulated=1, each marked with a dashed frame + 'SIMULATION' tag) so a sandbox rush lights up the board for demos, 1s live tick + 6s data refresh. MANAGER / FRANCHISEE (and an owner drilled into a truck) get the floor board plus a floor-control header: live open / late / due-soon / oldest / average-age from the active orders the board streams, with throughput (done last hour) + on-shift staff (open time-punches) + live 86 management (restore chips + '86 an item' picker) from GET /api/admin/kds/floor-ops. CHEF (kitchen / staff) get a line strip: live queue depth (tickets in queue + oldest age), and one-tap 86 of an item they've run out of (candidates are the items actually on the active tickets) + restore, via the kitchen-permitted GET/POST /api/admin/kds/eighty-six (audit-logged as menu.item_86). Every surface — the Atlas fleet board, the floor board (desktop + mobile, which keeps its New / In prep / Ready lanes) and the fullscreen kiosk — renders ONE shared KdsTicketCard (ring timer, predicted-ready line, violet at-risk tier, allergen alert, station-grouped items) built by buildKdsTicket and toned by the same analyzeTruck predictive engine, so the cards are byte-for-byte identical across the whole KDS. Both the floor board and the Atlas fleet board opt into simulated tickets (?includeSimulated=1) so the order simulator can stream a marked SIMULATION rush onto them; the floor-ops / fleet roll-ups (promise-accuracy + throughput sparkline, from the kds_tickets ledger) and every report stay real-only. Bump-time P95 reads getKdsStationAnalytics (real kds_tickets only).",
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
          href: "/core/guest?view=inbox",
          summary:
            "LLM-driven WhatsApp Business ordering: customer messages the number, Claude walks them through menu → cart → slot → Stripe Checkout link in chat. Signature-verified Meta webhook at /api/whatsapp/webhook. The /admin/whatsapp operator console is a KDS/POS-style command surface (3-pane inbox: live conversation list · chat thread with operator reply + re-open template · context panel showing cart/order/funnel), with a fullscreen kiosk mode. The Inbox/Live/Awaiting-pay/Archived filters drive an operator-side auto-archive: a chat with no new message for `autoArchiveMinutes` (default 5) drops to Archived — console-only, so the customer's 90-min bot session/cart is untouched and a new message restores it to the inbox. The Settings overlay (WhatsAppSettingsDialog) is the advanced config hub, all wired end-to-end via WaSettings: Channel (enable, default location, daily cap), Messages (welcome, opt-out keywords, re-open template), Conversation lifecycle (auto-archive minutes), AI concierge (enable/disable + extra system-prompt instructions appended to the base prompt in lib/whatsapp/turn.ts, plus an away message sent when AI is off), and Auto-replies/scripts (keyword→canned-reply pairs matched in the webhook BEFORE the LLM). Business hours (Europe/Warsaw, per-day open/close + closed days, computed in lib/whatsapp/hours.ts) gate the bot in the webhook — outside hours the away message is sent instead of taking an order, while auto-replies still answer 24/7. Operators can also manually Pin a chat (never auto-archives, stays in the inbox) or Archive it now from the context panel; a new inbound message un-archives automatically. Switches save instantly; text fields save with the button. A Funnel button opens conversion analytics: real stage instrumentation (started → location → cart → fulfillment → slot → pay-link → paid) emitted from the bot pipeline (first-touch in the webhook, stage transitions diffed in lib/whatsapp/turn.ts, paid from the Stripe webhook) into an appendWaFunnelEvent log, aggregated cumulatively per phone (a later stage counts toward earlier ones, so drop-off is monotonic and a missed intermediate event never breaks the funnel) over 7d/30d/all via GET /api/admin/whatsapp/funnel. Simulated chats bypass the live pipeline, so they never pollute the funnel. Abandoned-cart recovery (opt-in, Settings → Abandoned-cart recovery): when a customer builds a cart but doesn't pay, a record is upserted in the turn loop (persisted beyond the 90-min session) and cleared on paid (Stripe webhook) or escalation; the daily cron /api/admin/cron/whatsapp-abandoned-cart (registered in the dispatcher) sends the Meta re-open template once to carts idle ≥ delayHours and under 4 days old, marking each notified so customers are never spammed. Self-skips when disabled or no template is set. Broadcast campaigns (Broadcast button): send an approved Meta template to an opted-in customer segment — audience filters computed live from the customer rollup (all / active 60d / lapsed 90d+ / VIP ≥200 zł & ≥6 orders / new 14d), always excluding smsOptout + phoneless. POST /api/admin/whatsapp/broadcasts snapshots the audience into a campaign (capped 5000); the UI drives batched sends (25/tick) via /broadcasts/[id]/send with a live progress bar, and a daily /api/admin/cron/whatsapp-broadcast-drain backstop finishes any campaign left mid-send. Audit-logged on create. Scripted flows (Settings → Scripted flows): operator-authored deterministic sequences — a customer message containing the trigger word starts the flow (sends step 1) and each reply advances one step until the steps run out. Runs ahead of the LLM in lib/whatsapp/flows.ts (independent of the AI toggle), with per-session state on WaSession.activeFlow; replies are captured in the transcript. Great for feedback or info sequences without burning model calls.",
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
          href: "/core/service?view=slots",
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
      ],
    },
    {
      id: "growth",
      title: "Growth & retention",
      items: [
        {
          name: "Loyalty points",
          status: "live",
          href: "/core/guest?view=loyalty",
          summary: "Order-based + manual adjustments. Tier upgrades trigger push + email. The roster, family wallets, and redemption log live in the Core Guest Engagement hub (/core/guest?view=loyalty — /admin/loyalty redirects there); the programme config itself (tier ladder, rewards catalogue, referral mechanics) is edited at /admin/growth.",
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
          href: "/admin/growth",
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
          name: "Bundle low-margin operator alert + save-time guardian",
          status: "live",
          href: "/admin/upsell",
          summary: "Two-stage margin protection sharing one BUNDLE_MARGIN_FLOOR (40%, in src/lib/bundles.ts). (1) Save-time guardian: pressing 'Save changes' in /admin/upsell pre-computes every active bundle's worst-case contribution margin across the dirty locations (worstBundleMargin in src/lib/bundle-margin.ts — same sampler as the editor's live preview, against each location's live menu) and blocks on a confirm listing each tier below the floor before persisting, so an underwater discount is caught at save, not one order later. (2) Post-order alert: every bundle order's margin is computed at write time (MenuItem.cost ÷ finalPriceGrosze); below the floor, addNotification posts a `bundle_low_margin` alert into the operator inbox with bundle name + exact margin % + order total. All three margin signals (guardian, post-order alert, editor preview tones) read the same floor so they can't disagree.",
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
          name: "Item modifiers — customer picker → KDS (half & half, crust, toppings)",
          status: "live",
          href: "/admin/menu",
          summary: "Per-item modifier groups, now wired end-to-end (audit §3 + §11.2 — \"freeform notes instead of modifiers; half-and-half all day\"). Each MenuItem carries `modifierGroups[]` (label, min/max selections, options with priceDelta + costDelta + KDS-flag). Margherita ships Crust (Standard / Sourdough +5 / Gluten-free +5), Premium toppings (Buffalo mozz +9, Extra cheese +6, Truffle oil +8, Prosciutto +12) and **Make it half & half** (Half Diavola / Quattro Formaggi / Ortolana) — chain-consistent across Kraków + Warszawa; Diavola adds Spice level. CUSTOMER PICKER: a menu card whose item has modifier groups routes its Add into the item-detail drawer (src/components/location/ItemDetailDrawer.tsx), which renders each group as radio (max 1) / checkbox (≤ max) chips, enforces required picks, pre-seeds the default crust, and live-quotes the price via effectiveUnitPrice(). Cart lines key on item id + chosen options (cartLineKey) so each variant stacks separately and the row shows the picks as chips. PROPAGATION: the checkout payload + api-schemas carry selectedModifiers; createOrder.ts re-validates every id against the live menu (forge-proof) and prices with the same helper; the Stripe line items now include the modifier delta (previously undercharged) and list the picks in the line description. KDS: KdsTicketCard renders each line's modifiers in Fraunces italic amber, flagOnKds options escalated to upright uppercase late-red. Editor lives on /admin/menu (ModifierEditor); groups round-trip through the menu API per location. Operator inventory at /admin/upsell → Item modifiers. (POS terminal modifier selection is still a later pass — see POS note.)",
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
          summary: "Per-location live-activity strip. As of Step 9 the V8 menu chrome folds the strip inline inside the `.v8-menu-card` wrapper as the `.v8-live-act` row (italic Cormorant `X orders in the last hour · Trending: <item>` with a pulsing basil pip). Data from simulateLiveActivity, refreshes every 30s. The admin write surface in Growth → Live widgets supports more widget types (orders/hour, currently preparing, trending, prep time, happy hour, truck location, free text); the V8 inline strip currently surfaces the two highest-signal of those (orders + trending). Cap of 7 active widgets per location stays enforced at the admin layer.",
        },
        {
          name: "Live ticker (V8 nav strip)",
          status: "live",
          href: "/admin/settings",
          summary: "V8 espresso-gradient strip directly under the top nav on every storefront route. Renders chain-wide orders-in-last-hour, currently-preparing, trending item, and avg prep time from the same simulateLiveActivity helper /locations/[slug] uses. Toggle in Settings → Layout → 'Live activity ticker'.",
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
            "Staff-facing point of sale at /core/pos — rebuilt on the Core suite theme/shell (public/mockups/core-suite/pos.html): the SI sidebar + topbar (channel + location segmented controls), a concurrent OPEN CHECKS tab rail, an 86px category rail with capacity-true promise times, a text-forward menu grid and the persistent live coursing ticket. A rail of concurrent OPEN CHECKS (tabs) sits front and centre, each its own running total + status (open / parked / ready-to-pay) and channel colour (Takeout=blue, Delivery=amber, Dine-in=purple, grey until chosen); staff switch between them, open new ones (N), park, and send/charge each independently. Tabs are server-backed (PosTab in src/lib/store.ts → GET/POST/PUT/DELETE /api/admin/pos/tabs, per location) so they survive a refresh and are shared across tills — lines store menu-item ids + quantities only, never prices. Product grid is the truck's real menu (getMenuWithOverrides) with role badges / tags / category 'All' grouping; an in-column channel selector is required before send or charge (deliveryOnly SKUs only on Delivery). Dine-in tabs carry covers + a real floor table from /admin/floor (with cross-check table-conflict detection); delivery tabs capture an address. Combo deals (getActiveComboDeals, admin-configured in /admin/crosssell) auto-discount the live cart, an order-aware AI offers panel surfaces combo-completion + cross-sell (getCartSuggestions), and the Pace→POS steering feed (/api/admin/pace/steering) badges make-now / ease items + quotes capacity-true promise times when the line gets hot. 'Send to KDS' POSTs /api/admin/pos/orders {tabId}: the server rebuilds the order from the persisted tab + real menu + combo discount and calls createOrder (KDS ticket + stock decrement + Orders list), suppressNotifications + synthetic same-day 'walkin' slot; it's idempotent per tab (re-send re-syncs the same Order, no duplicate). Dine-in checks support COURSING (src/lib/pos-coursing.ts): each line carries a course (starter/main/dessert/drink, defaulted from its menu category), a 'Kitchen timing' toggle picks Coursed vs All-together (persisted as PosTab.coursed), and in coursed mode the ticket splits into per-course sections with a Fire button each + drag-to-recourse held lines between courses. Firing a course POSTs {tabId, courses:[course]} — the server accumulates it onto the server-owned PosTab.firedCourses and rebuilds the linked Order from the union of fired courses' lines, so each fire grows the kitchen ticket and held courses never hit the KDS. 'Charge' → tender (Cash / Card) PATCHes the same route to bill the WHOLE tab (fired or not), stamp the Order paid and close the tab. Fullscreen kiosk (portaled per CLAUDE.md rule #4). Staff+, per-location.",
          caveats:
            "Tender is a record-only step — Cash / Card stamps the Order paidAt; Stripe-terminal / cash-drawer integration is a later pass. Tabs default to 'Tab N' names (rename inline in the ticket header). Item modifiers (crust, extra toppings) aren't selectable from the POS yet — base items only. AI offers + steering are the existing heuristic / Theory-of-Constraints engines, not yet a trained model. Coursing fires into ONE growing Order per tab (held courses are added to the same KDS ticket as they fire, not a fresh ticket per course), so a course bumped 'ready' on the KDS can gain later-fired items — separate ticket-per-course is a future pass. The fire stamps Order.coursing {fired,held}; the KDS ticket shows a 'Coursed · X held' hint while courses are still held, but does not yet add a per-course header chip or group items by course name.",
        },
        {
          name: "Floor — tables + reservations",
          status: "live",
          href: "/core/service?view=floor",
          summary:
            "Per-location floor management at /admin/floor. Tables tab: define physical tables (number, seats, zone, status available/seated/reserved/out-of-service) via /api/admin/floor/tables. Reservations tab: day-by-day bookings (customer, party size, time + duration, assigned table, status) via /api/admin/floor/reservations, with double-booking conflict detection — two active bookings whose windows overlap on the same table return 409 (operator-overridable). The assigned table flows onto dine-in orders (Order.tableId) and the POS table picker. Conflict logic is pure + unit-tested (src/lib/floor.ts + floor.test.ts). Manager+, per-location.",
          caveats:
            "Tables + reservations persist via the JSON store (readJSON/writeJSON) like slots/suppliers — no dedicated Postgres table yet, fine at truck volumes. Reservations are independent of the time-Slots system (they don't reserve a checkout slot). No spatial floor-map / drag layout — tables are a list/grid.",
        },
        {
          name: "Floor Twin — live room digital twin",
          status: "live",
          href: "/core/service?view=floor",
          summary:
            "Module 3 keystone (blueprint §4): turns the floor from a status board into a live economic simulation of the room. The Twin view on /admin/floor derives, per table, the realized turn-time, spend velocity (zł per occupied table-hour), live occupancy + a predicted free-in time (median turn − elapsed), and surfaces a predictive-seating recommender (type a party size → best-fit open tables first, then the soonest to free — computed live client-side). KPI strip: occupancy %, open tables, freeing ≤15m, median turn, floor spend/hour. Turn-time has two sources: MEASURED seat-occupancy (the §4.2 instrumentation — table status transitions are now logged on every save via saveTable → recordFloorEvent → floor-events.json, and seated→cleared pairs give true dwell incl. pre-order wait + bussing; a still-open seated run gives an exact live seat time) and, as a fallback when a table has no transition history, the dine-in order-timeline proxy (createdAt→paidAt). Measured rows are tagged. Phase 2 — the acts: predictive-seating moves (Seat / Clear a table straight from the Twin table or the recommender — POST /api/admin/floor-twin flips the status via saveTable, which logs the transition, closing the loop with the measured-dwell instrumentation) and bottleneck pre-emption (the Twin runs the live KDS pace engine, analyzeTruck, and shows a 'Kitchen filling up / overloaded — pace new seating' banner with the bottleneck station + utilisation when the line can't absorb more covers). Pure-compute engine src/lib/floor-twin.ts (buildFloorTwin + recommendSeating, 7 unit tests, dwell guardrails 5–360m); GET/POST /api/admin/floor-twin?location=, staff+.",
        },
        {
          name: "Unified booking — slot + table in one step",
          status: "live",
          href: "/core/service",
          summary:
            "Lives on the new merged Floor + Slots Core surface (/core/service, CoreShell / .core-suite, like POS & Guest): a booking console where the operator picks a dine-in slot (with live remaining capacity) and a table (lit up live for fit + conflict via the same findReservationConflicts the server enforces), with a Recommend button that auto-picks the best-fit table, then Book. The merged Floor + Slots flow: book a dine-in time slot AND assign a table in a single operation, conflict-checked on BOTH the slot's booking capacity (active reservations < maxOrders) and table double-booking (findReservationConflicts), with an operator override that forces past both. The reservation links the slot (Reservation.slotId — supplies date/time + capacity) and the table (the seat). Capacity model avoids double-counting: a reservation consumes the slot by count, never touching slot.currentOrders (which tracks online/POS orders). Customer dine-in checkout now AUTO-ASSIGNS the best-fit open table via the Floor Twin's pickOpenTable (and seats it, logging the transition) so booking a dine-in slot also gets the guest a table with no manual step — best-effort, never blocks the order. Pure validation (validateBooking) + pickOpenTable are unit-tested; orchestration in src/lib/booking.ts; POST /api/admin/booking?location= (manager+, 409 on overridable conflicts).",
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
            "Sandbox monthly P&L bound to real-order actuals (orders/day, AOV, weighted COGS, delivery share, refund rate, median ticket time — all pulled from /api/admin/orders over a 90-day rolling window and applied with one click). Tune revenue inputs, labor mix (with volume-flex), fixed costs, waste / refund / loyalty / CIT / D&A / interest, kitchen capacity (peak-hour throughput ceiling), and channel-split payment fees (cash / on-site card / Glovo / Wolt). 9 behavior levers, 5 weather/calendar levers, per-month seasonality overrides. Institutional-grade KPI suite: EBITDA, EBITDAR, cash-on-cash return, occupancy ratio, refund-adjusted net sales, contribution per labor hour (QSR target ≥150 zł/h), promo-adjusted AOV, peak orders/hour, median ticket time, true contribution margin, kitchen-capacity utilisation. Two 2-D heatmaps, scenario comparison, ±20% sensitivity, sensitivity tornado across all key drivers, 12-month operational projection, and a 24-month investor view with 4-month opening ramp surfacing NPV @ 10/15/20%, IRR, and cumulative-cash break-even. Break-even chart shows the current operating point vs ceiling at a glance. Master toggle in Settings → General. Defaults are Warsaw 2026 (gross × 1.22 ZUS narzut, 5-year truck depreciation). Zero writes to the business-costs ledger.",
        },
        {
          name: "Cohort & CLTV what-if sandbox",
          status: "live",
          href: "/admin/reports/cohort",
          summary:
            "A what-if sandbox embedded at the bottom of the Cohort & CLTV report (CohortSandbox.tsx). Seeds the real cohort numbers (repeat rate, orders/customer, cohort-size-weighted 365-day CLTV, blended retention curve) and projects them forward under three levers — repeat-rate uplift (pp), AOV growth (%), new customers/month. CLTV = orders/customer × value/order; the repeat lever holds 'extra orders per repeater' constant and re-derives orders/customer; the retention curve is scaled by the repeat-rate ratio (capped 100%). KPIs vs baseline. When there are no paid orders yet it runs on a worked Sud Italia example (badged 'Example data') so it's never empty. Read-only on live data. Off by default; toggle in Settings → General (Simulator card).",
        },
        {
          name: "LTV / CAC what-if sandbox",
          status: "live",
          href: "/admin/reports/ltv-cac",
          summary:
            "A what-if sandbox embedded at the bottom of the LTV/CAC report (LtvCacSandbox.tsx). Seeds the real margin-LTV, blended margin and CAC, then flexes CAC (absolute zł), retention/frequency (%), AOV (%), gross-margin (pp) and new customers/month. Revenue-LTV is recovered as LTV ÷ margin, scaled, then re-margined; ratio = LTV ÷ CAC; payback = 12 × CAC ÷ LTV. KPIs tone against the 3× gate plus profit/customer and monthly cohort profit. Falls back to a worked example when there's no acquisition data. Off by default; toggle in Settings → General (Simulator card).",
        },
        {
          name: "Menu-engineering what-if sandbox",
          status: "live",
          href: "/admin/menu-engineering",
          summary:
            "A what-if sandbox embedded at the bottom of the Menu engineering matrix (MenuEngineeringSandbox.tsx). Seeds per-item units / revenue / cost / quadrant (30/60/90/180-day window) and re-prices a target group with a demand response of (1+Δprice)^(−elasticity), promotes puzzle velocity, or removes dogs. Recovers per-unit price/cost from real revenue÷units, recomputes contribution = projected revenue − cost across the menu. KPIs + a 'biggest movers' table. Falls back to a worked 10-dish Sud Italia menu when nothing has sold. Off by default; toggle in Settings → General (Simulator card).",
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
          href: "/core/service?view=slots",
          summary: "Atomic increment (no overselling). Auto-close past slots via cron.",
        },
        {
          name: "Demand Exchange — per-slot yield",
          status: "live",
          href: "/core/service?view=slots",
          summary:
            "Module 2 (blueprint §3): reframes the booking grid from a static currentOrders/maxOrders counter into yield-managed seat-minute inventory. The Demand view on /admin/slots forecasts covers per slot from real same-weekday order history, compares against the kitchen's DEMONSTRATED ceiling (busiest realized covers/hour over the last 90 days, not a theoretical max), folds in logged rejected-demand, and prescribes the yield action per slot: raise capacity (demand > advertised), trim/promote (over-provisioned), protect kitchen (demand > throughput ceiling), or hold. It also instruments the signal the static counter throws away: every checkout that hits a full slot logs a demand signal (createOrder → recordDemandSignal → demand-signals.json), so fill-rate becomes a real demand curve (demand > supply). Phase 2 — the act, two yield levers: for demand the kitchen can take, one-click 'Apply' resizes capacity (never below what's already booked); for kitchen-capped (protect) slots, where volume can't go up, it sets a MINIMUM SPEND sized from the slot's realized AOV (raise price, not volume). 'Apply all' is the autonomy lever — re-derives the board server-side and applies capacity + min-spend to every changed slot, audit-logged as slots.resize. The minimum is real end-to-end: TimeSlot.minSpendGrosze (additive min_spend_grosze column) is exposed on the public /api/slots (the SlotPicker shows 'min N zł') and ENFORCED server-side at checkout (createOrder returns below_min_spend if the food subtotal is under it). Pure-compute engine src/lib/demand-exchange.ts (9 unit tests); GET/POST /api/admin/demand-exchange?location=&date=, manager+.",
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
          href: "/admin/orders",
          envVars: ["RECEIPT_PRINTER_HOST", "RECEIPT_PRINTER_PORT"],
          summary:
            "Thermal receipt printing (audit §11.2 / §12.4 #7). 'Print receipt' on any order detail POSTs /api/admin/orders/[id]/print-receipt, which builds an 80mm ESC/POS payload (src/lib/receipt/escpos.ts — header, per-line items with resolved modifiers + notes, modifier-inclusive prices, total, partial cut; unit-tested) and streams it over a raw TCP socket to RECEIPT_PRINTER_HOST:RECEIPT_PRINTER_PORT (default 9100). With no host set it runs as a SIMULATOR — returns the exact byte count + a plain-text preview and the UI falls back to a browser print, so a receipt comes out with or without hardware. Go-live for a truck-local printer: run a print-bridge on the truck or expose the printer via a reverse tunnel, then set RECEIPT_PRINTER_HOST — see docs/design-system/core/modules/receipt-printer.md. Every print is audit-logged as receipt.print.",
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
