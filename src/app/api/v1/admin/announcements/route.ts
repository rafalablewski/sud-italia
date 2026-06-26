import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getAnnouncements } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/announcements` — team broadcasts, mirroring web
 * `/admin/comms/announcements`. Manager+. Pinned first, then newest.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const list = (await getAnnouncements()).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdByName: a.createdByName,
      pinned: a.pinned ?? false,
      createdAt: a.createdAt,
      readCount: a.readBy.length,
    }));
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin announcements failed", { layer: "api.v1.admin.announce" }, err as Error);
    return apiError("internal", "Could not load announcements");
  }
}
