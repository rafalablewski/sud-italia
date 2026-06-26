import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getAuditLog } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/audit-log` — the privileged-action trail, mirroring web
 * `/admin/audit-log`. Manager+. Capped to the recent window; before/after diffs
 * are omitted (they're unbounded) — the app shows who/what/when.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const entries = (await getAuditLog({ limit: 200 })).map((e) => ({
      id: e.id,
      actor: e.actor,
      action: e.action,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      occurredAt: e.occurredAt,
    }));
    return apiOk(entries, { count: entries.length });
  } catch (err) {
    logger.error("v1 admin audit-log failed", { layer: "api.v1.admin.audit" }, err as Error);
    return apiError("internal", "Could not load the audit log");
  }
}
