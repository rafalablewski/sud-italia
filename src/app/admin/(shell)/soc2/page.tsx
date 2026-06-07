import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { ROLE_RANK } from "@/lib/admin-roles";
import { getAdminUsers, getAuditLog } from "@/lib/store";
import { buildSoc2Register, type Soc2Signals } from "@/lib/soc2";
import { Soc2V3 } from "@/admin-v3/Soc2V3";

// SOC 2 register — owner-only. Every control status is derived from REAL
// runtime signals (env + admin-user table + audit log) by the same pure
// buildSoc2Register engine the v2 page uses.
export default async function AdminV3Soc2Page() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.owner) redirect("/admin");

  const [users, audit] = await Promise.all([getAdminUsers(), getAuditLog({ limit: 500 })]);
  const env = process.env;
  const has = (k: string) => !!env[k]?.trim();

  const signals: Soc2Signals = {
    durableStorage: has("DATABASE_URL"),
    sessionSecret: has("SESSION_SECRET"),
    adminPassword: has("ADMIN_PASSWORD") && env.ADMIN_PASSWORD !== "ci-placeholder",
    productionRuntime: env.NODE_ENV === "production",
    stripeConfigured: has("STRIPE_SECRET_KEY"),
    stripeWebhookVerified: has("STRIPE_WEBHOOK_SECRET"),
    distributedLock: has("UPSTASH_REDIS_REST_URL") && has("UPSTASH_REDIS_REST_TOKEN"),
    cronAuth: has("CRON_SECRET"),
    ciPipeline: true,
    adminUserCount: users.length,
    activeAdminCount: users.filter((u) => u.status === "active").length,
    ownerCount: users.filter((u) => u.role === "owner").length,
    rolesInUse: Array.from(new Set(users.map((u) => u.role))),
    auditLogCount: audit.length,
    latestAuditAt: audit[0]?.occurredAt ?? null,
  };

  return <Soc2V3 register={buildSoc2Register(signals)} />;
}
