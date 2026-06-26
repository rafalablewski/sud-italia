import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getAdminUsers } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/users` — staff accounts & roles, mirroring web `/admin/users`.
 * Owner only. Sensitive auth material (passwordHash, pinHash, totpSecret,
 * webauthnCredentials, challenges) is NEVER serialized — only the safe profile.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;
  try {
    const users = (await getAdminUsers()).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email ?? null,
      role: u.role,
      status: u.status,
      locationSlug: u.locationSlug ?? null,
      locationSlugs: u.locationSlugs ?? null,
      mfaEnabled: u.totpEnabled ?? false,
      hasPasskeys: (u.webauthnCredentials?.length ?? 0) > 0,
      createdAt: u.createdAt,
    }));
    users.sort((a, b) => a.name.localeCompare(b.name));
    return apiOk(users, { count: users.length });
  } catch (err) {
    logger.error("v1 admin users failed", { layer: "api.v1.admin.users" }, err as Error);
    return apiError("internal", "Could not load users");
  }
}
