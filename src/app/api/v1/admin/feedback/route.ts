import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import { getFeedback, updateFeedbackStatus } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/feedback` — guest reviews + sentiment, mirroring web
 * `/admin/feedback`. Manager+; location-scoped. Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getFeedback();
    const list = filter.slugs === null ? [...all] : all.filter((f) => filter.slugs!.includes(f.locationSlug));
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const avg = list.length
      ? Math.round((list.reduce((s, f) => s + f.overallRating, 0) / list.length) * 10) / 10
      : 0;
    return apiOk(list, { count: list.length, avgRating: avg });
  } catch (err) {
    logger.error("v1 admin feedback failed", { layer: "api.v1.admin.feedback" }, err as Error);
    return apiError("internal", "Could not load feedback");
  }
}

const FEEDBACK_STATUSES = new Set(["new", "reviewed", "responded"]);

/**
 * `PATCH /api/v1/admin/feedback` — advance a review's triage status, mirroring web
 * `/admin/feedback` PUT. Body `{ id, status }` (new | reviewed | responded).
 * Manager+. Returns the updated entry.
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  if (!body.id || !body.status || !FEEDBACK_STATUSES.has(body.status)) {
    return apiError("validation_failed", "id and a valid status (new | reviewed | responded) are required");
  }
  try {
    // Scope-gate before mutating — the GET is scope-filtered, so a review the
    // operator can't see can't be triaged either.
    const existing = (await getFeedback()).find((f) => f.id === body.id);
    if (!existing) return apiError("not_found", "Feedback not found");
    if (!scopeAllows(guard.claims.scope, existing.locationSlug)) {
      return apiError("forbidden", `Not authorized for location "${existing.locationSlug}"`);
    }
    const updated = await updateFeedbackStatus(body.id, body.status as "new" | "reviewed" | "responded");
    if (!updated) return apiError("not_found", "Feedback not found");
    return apiOk(updated, { changed: true });
  } catch (err) {
    logger.error("v1 admin feedback patch failed", { layer: "api.v1.admin.feedback" }, err as Error);
    return apiError("internal", "Could not update feedback");
  }
}
