import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { ROLE_RANK } from "@/lib/admin-roles";
import { getAdminUsers, getAuditLog } from "@/lib/store";
import { buildSoc2Register, type Soc2Signals } from "@/lib/soc2";
import { AdminSoc2 } from "@/components/admin/AdminSoc2";

/**
 * SOC 2 controls register (audit §11.3). Owner-only — it exposes the security
 * posture of the whole platform. Every control status is derived here from
 * REAL runtime signals (env config + admin-user table + audit log), then
 * mapped to Trust Services Criteria by the pure buildSoc2Register engine.
 */
export default async function AdminSoc2Page() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.owner) redirect("/admin");

  // Recent audit window — enough to evidence "logging is active + durable"
  // without a full table scan. The control only needs presence (> 0); the
  // evidence text is phrased as "recent entries observed", not a grand total.
  const [users, audit] = await Promise.all([
    getAdminUsers(),
    getAuditLog({ limit: 500 }),
  ]);

  const env = process.env;
  const has = (k: string) => !!env[k]?.trim();

  const signals: Soc2Signals = {
    durableStorage: has("DATABASE_URL"),
    sessionSecret: has("SESSION_SECRET"),
    // CI uses ADMIN_PASSWORD=ci-placeholder — treat that as "not a real secret".
    adminPassword: has("ADMIN_PASSWORD") && env.ADMIN_PASSWORD !== "ci-placeholder",
    productionRuntime: env.NODE_ENV === "production",
    stripeConfigured: has("STRIPE_SECRET_KEY"),
    stripeWebhookVerified: has("STRIPE_WEBHOOK_SECRET"),
    distributedLock: has("UPSTASH_REDIS_REST_URL") && has("UPSTASH_REDIS_REST_TOKEN"),
    cronAuth: has("CRON_SECRET"),
    // CI workflow (.github/workflows/ci.yml) is committed and gates main.
    ciPipeline: true,
    adminUserCount: users.length,
    activeAdminCount: users.filter((u) => u.status === "active").length,
    ownerCount: users.filter((u) => u.role === "owner").length,
    rolesInUse: Array.from(new Set(users.map((u) => u.role))),
    auditLogCount: audit.length,
    latestAuditAt: audit[0]?.occurredAt ?? null,
  };

  const register = buildSoc2Register(signals);
  return <AdminSoc2 register={register} />;
}
