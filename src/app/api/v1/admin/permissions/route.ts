import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { AdminRole } from "@/lib/admin-roles";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ROLES: AdminRole[] = ["owner", "franchisee", "manager", "staff", "kitchen"];

/**
 * `GET /api/v1/admin/permissions` — the role × permission-group matrix, mirroring
 * web `/admin/permissions`. Owner only. For each group we report how many of its
 * permissions each role's default grant includes.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;
  try {
    const groups = PERMISSION_GROUPS.map((g) => {
      const keys = g.permissions.map((p) => p.key);
      const grants = ROLES.map((role) => {
        const set = new Set(ROLE_DEFAULT_PERMISSIONS[role]);
        return { role, granted: keys.filter((k) => set.has(k)).length };
      });
      return { id: g.id, label: g.label, total: keys.length, grants };
    });
    return apiOk({ roles: ROLES, groups }, { count: groups.length });
  } catch (err) {
    logger.error("v1 admin permissions failed", { layer: "api.v1.admin.permissions" }, err as Error);
    return apiError("internal", "Could not load the permission matrix");
  }
}
