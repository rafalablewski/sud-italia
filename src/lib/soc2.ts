// SOC 2 controls register — audit §11.3 "walk me through the SOC 2 controls —
// we don't have any."
//
// This doesn't make us SOC 2 certified (that's an auditor + a Type II
// observation window). What it does is the honest engineering half: map the
// platform's ACTUAL runtime posture to the relevant Trust Services Criteria
// and show, per control, what evidence exists and what's still a gap. Every
// status is derived from a real signal (env config, admin-user table, audit
// log) gathered server-side — never a static "✓ compliant" checkbox.
//
// buildSoc2Register is pure over the gathered signals so it's unit-testable.

export interface Soc2Signals {
  /** DATABASE_URL set → durable Postgres (managed backups) vs filesystem fallback. */
  durableStorage: boolean;
  /** SESSION_SECRET set → sessions are HMAC-signed. */
  sessionSecret: boolean;
  /** ADMIN_PASSWORD set to a real (non-placeholder) value. */
  adminPassword: boolean;
  /** NODE_ENV === production → secure cookies + TLS at the platform edge. */
  productionRuntime: boolean;
  /** STRIPE_SECRET_KEY set → payments tokenized by Stripe (no PAN stored). */
  stripeConfigured: boolean;
  /** STRIPE_WEBHOOK_SECRET set → inbound payment webhooks signature-verified. */
  stripeWebhookVerified: boolean;
  /** Upstash creds set → distributed lock for safe concurrent writes. */
  distributedLock: boolean;
  /** CRON_SECRET set → scheduled jobs authenticated. */
  cronAuth: boolean;
  /** CI pipeline (typecheck + lint + test + build) gates the default branch. */
  ciPipeline: boolean;
  adminUserCount: number;
  activeAdminCount: number;
  ownerCount: number;
  /** Distinct roles assigned across admin users (separation of duties). */
  rolesInUse: string[];
  auditLogCount: number;
  latestAuditAt: string | null;
}

export type Soc2Status = "met" | "partial" | "gap";
export type Soc2Category =
  | "Security"
  | "Availability"
  | "Confidentiality"
  | "Processing Integrity";

export interface Soc2Control {
  /** Trust Services Criteria reference, e.g. "CC6.1". */
  id: string;
  criterion: string;
  category: Soc2Category;
  status: Soc2Status;
  /** What we actually observed in the running system. */
  evidence: string;
  /** What to do to move a partial/gap to met. */
  remediation?: string;
}

export interface Soc2Register {
  generatedAt: string;
  controls: Soc2Control[];
  summary: {
    met: number;
    partial: number;
    gap: number;
    total: number;
    /** met = 1, partial = 0.5, gap = 0 → % of controls evidenced. */
    scorePct: number;
  };
}

function pick(
  met: boolean,
  partial: boolean,
): Soc2Status {
  if (met) return "met";
  if (partial) return "partial";
  return "gap";
}

export function buildSoc2Register(
  s: Soc2Signals,
  now: Date = new Date(),
): Soc2Register {
  const controls: Soc2Control[] = [];

  // CC6.1 — Logical access: authentication.
  controls.push({
    id: "CC6.1",
    criterion: "Logical access — authentication",
    category: "Security",
    status: pick(s.sessionSecret && s.adminPassword, s.adminPassword),
    evidence: `Admin sessions are HMAC-signed cookies (24h TTL). SESSION_SECRET ${s.sessionSecret ? "set" : "NOT set"}; admin password ${s.adminPassword ? "configured" : "default/placeholder"}.`,
    remediation:
      s.sessionSecret && s.adminPassword
        ? undefined
        : "Set SESSION_SECRET and a strong ADMIN_PASSWORD in the deployment env.",
  });

  // CC6.2 — User provisioning / registration.
  controls.push({
    id: "CC6.2",
    criterion: "User provisioning & de-provisioning",
    category: "Security",
    status: pick(s.adminUserCount > 0, false),
    evidence: `${s.adminUserCount} admin user(s) on record, ${s.activeAdminCount} active. Provisioning + status (active/disabled) managed at /admin/users with every change written to the audit log.`,
    remediation:
      s.adminUserCount > 0
        ? undefined
        : "Create named admin users at /admin/users so access is per-person, not a shared secret.",
  });

  // CC6.3 — Role-based access / least privilege.
  const separationOfDuties = s.rolesInUse.length >= 2;
  const tooManyOwners = s.adminUserCount > 0 && s.ownerCount === s.adminUserCount && s.adminUserCount > 1;
  controls.push({
    id: "CC6.3",
    criterion: "Role-based access & least privilege",
    category: "Security",
    status: pick(separationOfDuties && !tooManyOwners, s.adminUserCount > 0),
    evidence: `RBAC enforced via role ranks (owner > manager > franchisee > staff > kitchen) on every admin route. Roles in use: ${s.rolesInUse.join(", ") || "none"}. Owners: ${s.ownerCount}.`,
    remediation: tooManyOwners
      ? "Every admin user is an owner — assign least-privilege roles (manager/staff/kitchen) so access matches job function."
      : separationOfDuties
        ? undefined
        : "Assign at least two distinct roles to establish separation of duties.",
  });

  // CC6.6 — Encryption in transit / boundary protection.
  controls.push({
    id: "CC6.6",
    criterion: "Encryption in transit",
    category: "Security",
    status: pick(s.productionRuntime, true),
    evidence: s.productionRuntime
      ? "Production runtime: TLS terminated at the platform edge; session cookies set Secure + httpOnly + SameSite=Lax."
      : "Non-production runtime detected — Secure-cookie enforcement only fully applies in production.",
    remediation: s.productionRuntime
      ? undefined
      : "Confirmed automatically once deployed with NODE_ENV=production.",
  });

  // CC6.7 — Restrict transmission/storage of sensitive (cardholder) data.
  controls.push({
    id: "CC6.7",
    criterion: "Payment data — tokenization & webhook integrity",
    category: "Confidentiality",
    status: pick(s.stripeConfigured && s.stripeWebhookVerified, s.stripeConfigured),
    evidence: `Card data is never stored — payments tokenized by Stripe. Stripe ${s.stripeConfigured ? "configured" : "NOT configured"}; inbound webhooks ${s.stripeWebhookVerified ? "signature-verified (STRIPE_WEBHOOK_SECRET set)" : "NOT signature-verified"}.`,
    remediation:
      s.stripeConfigured && s.stripeWebhookVerified
        ? undefined
        : !s.stripeConfigured
          ? "Configure STRIPE_SECRET_KEY so payments are tokenized off-platform."
          : "Set STRIPE_WEBHOOK_SECRET so payment webhooks are signature-verified against forgery.",
  });

  // CC7.2 — System monitoring (audit logging).
  controls.push({
    id: "CC7.2",
    criterion: "Monitoring — audit logging",
    category: "Security",
    status: pick(s.auditLogCount > 0 && s.durableStorage, s.auditLogCount > 0),
    evidence: `Append-only audit log captures actor + action + before/after on every mutation. ${s.auditLogCount} recent entr${s.auditLogCount === 1 ? "y" : "ies"} observed${s.latestAuditAt ? `, latest ${new Date(s.latestAuditAt).toISOString().slice(0, 10)}` : ""}. Backing store: ${s.durableStorage ? "Postgres (durable, unbounded retention)" : "filesystem fallback (last 1000)"}.`,
    remediation:
      s.auditLogCount > 0 && s.durableStorage
        ? undefined
        : !s.durableStorage
          ? "Set DATABASE_URL so audit history is durable + unbounded, not the 1000-entry filesystem fallback."
          : "No audit entries yet — they accrue automatically as admins act.",
  });

  // CC8.1 — Change management.
  controls.push({
    id: "CC8.1",
    criterion: "Change management",
    category: "Processing Integrity",
    status: pick(s.ciPipeline, false),
    evidence: s.ciPipeline
      ? "CI pipeline (.github/workflows/ci.yml) runs typecheck + lint + unit tests + build on every PR and push to main; concurrency-cancelled per ref."
      : "No CI pipeline detected gating the default branch.",
    remediation: s.ciPipeline
      ? undefined
      : "Add a CI workflow that runs typecheck, lint, tests, and build before merge.",
  });

  // A1.2 — Availability: durable storage + backups + safe concurrency.
  controls.push({
    id: "A1.2",
    criterion: "Availability — durable storage & backups",
    category: "Availability",
    status: pick(s.durableStorage && s.distributedLock, s.durableStorage),
    evidence: `Primary store: ${s.durableStorage ? "managed Postgres (point-in-time backups)" : "filesystem fallback — local dev only"}. Concurrent-write safety: ${s.distributedLock ? "distributed lock (Upstash) active" : "in-process lock only"}.`,
    remediation:
      s.durableStorage && s.distributedLock
        ? undefined
        : !s.durableStorage
          ? "Set DATABASE_URL for durable, backed-up storage in production."
          : "Set UPSTASH_REDIS_REST_URL/_TOKEN so writes are serialized across serverless instances.",
  });

  // CC7.1 — Scheduled job authentication (config/operations integrity).
  controls.push({
    id: "CC7.1",
    criterion: "Scheduled job authentication",
    category: "Processing Integrity",
    status: pick(s.cronAuth, false),
    evidence: s.cronAuth
      ? "Cron endpoints require CRON_SECRET, so scheduled jobs (segment rebuilds, dispatchers) can't be triggered by anonymous callers."
      : "CRON_SECRET not set — scheduled-job endpoints are not authenticated.",
    remediation: s.cronAuth ? undefined : "Set CRON_SECRET and configure it on the scheduler.",
  });

  // C1.1 — Confidentiality: secrets management.
  const coreSecrets = s.sessionSecret && s.adminPassword && s.stripeConfigured;
  controls.push({
    id: "C1.1",
    criterion: "Confidentiality — secrets management",
    category: "Confidentiality",
    status: pick(coreSecrets, s.sessionSecret || s.adminPassword),
    evidence: `Secrets are injected via deployment env vars, never committed. Core secrets present: SESSION_SECRET ${s.sessionSecret ? "✓" : "✗"}, ADMIN_PASSWORD ${s.adminPassword ? "✓" : "✗"}, STRIPE_SECRET_KEY ${s.stripeConfigured ? "✓" : "✗"}.`,
    remediation: coreSecrets ? undefined : "Populate the missing secrets in the deployment environment.",
  });

  const met = controls.filter((c) => c.status === "met").length;
  const partial = controls.filter((c) => c.status === "partial").length;
  const gap = controls.filter((c) => c.status === "gap").length;
  const total = controls.length;
  const scorePct = total > 0 ? Math.round(((met + partial * 0.5) / total) * 100) : 0;

  return {
    generatedAt: now.toISOString(),
    controls,
    summary: { met, partial, gap, total, scorePct },
  };
}
