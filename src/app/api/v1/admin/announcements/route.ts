import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getAnnouncements, saveAnnouncement } from "@/lib/store";
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

/**
 * `POST /api/v1/admin/announcements` — post a team broadcast, mirroring web
 * `/admin/comms/announcements` POST. Body `{ title, body, pinned? }`; targeting
 * defaults to everyone. Owner-only (matches the web). Returns the created row.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;

  let body: { title?: string; body?: string; pinned?: boolean };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const title = String(body.title ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 5000);
  if (!title || !text) {
    return apiError("validation_failed", "title and body are required");
  }
  try {
    const a = await saveAnnouncement({
      title,
      body: text,
      createdBy: guard.claims.sub,
      createdByName: guard.claims.name ?? guard.claims.sub,
      pinned: body.pinned === true,
    });
    return apiOk(
      {
        id: a.id,
        title: a.title,
        body: a.body,
        createdByName: a.createdByName,
        pinned: a.pinned ?? false,
        createdAt: a.createdAt,
        readCount: a.readBy.length,
      },
      undefined,
      201,
    );
  } catch (err) {
    logger.error("v1 admin announcement post failed", { layer: "api.v1.admin.announce" }, err as Error);
    return apiError("internal", "Could not post the announcement");
  }
}
