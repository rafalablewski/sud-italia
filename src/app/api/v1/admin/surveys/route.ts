import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getSurveys, getSurveyResponses } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/surveys` — pulse surveys with response counts + average
 * rating, mirroring web `/admin/surveys`. Manager+.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const [surveys, responses] = await Promise.all([getSurveys(), getSurveyResponses()]);
    const byId = new Map<string, number[]>();
    for (const r of responses) {
      const arr = byId.get(r.surveyId) ?? [];
      arr.push(r.rating);
      byId.set(r.surveyId, arr);
    }
    const list = surveys.map((s) => {
      const ratings = byId.get(s.id) ?? [];
      const avg = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : 0;
      return {
        id: s.id,
        question: s.question,
        trigger: s.trigger,
        active: s.active,
        responseCount: ratings.length,
        avgRating: avg,
      };
    });
    return apiOk(list, { count: list.length, totalResponses: responses.length });
  } catch (err) {
    logger.error("v1 admin surveys failed", { layer: "api.v1.admin.surveys" }, err as Error);
    return apiError("internal", "Could not load surveys");
  }
}
