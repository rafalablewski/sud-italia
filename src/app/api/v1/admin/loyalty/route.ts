import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getLoyaltyMembers } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/loyalty` — enrolled loyalty members, powering the Core Guest
 * Engagement surface (mirrors `/core/guest/loyalty`). Staff+; chain-wide.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  try {
    const members = await getLoyaltyMembers();
    members.sort((a, b) => (b.signedUpAt ?? "").localeCompare(a.signedUpAt ?? ""));
    return apiOk(members, { count: members.length });
  } catch (err) {
    logger.error("v1 admin loyalty failed", { layer: "api.v1.admin.loyalty" }, err as Error);
    return apiError("internal", "Could not load loyalty members");
  }
}
