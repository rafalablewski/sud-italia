import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { listWaCampaigns } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/campaigns` — WhatsApp broadcast campaigns, mirroring the web
 * Growth page (`/admin/growth`). Manager+. Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const list = (await listWaCampaigns()).map((c) => ({
      id: c.id,
      template: c.template,
      audienceLabel: c.audienceLabel,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      total: c.phones.length,
      status: c.status,
      createdAt: c.createdAt,
    }));
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin campaigns failed", { layer: "api.v1.admin.campaigns" }, err as Error);
    return apiError("internal", "Could not load campaigns");
  }
}
