import { NextRequest } from "next/server";
import { apiOk, apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { fireTab, PosActionError } from "@/lib/pos/fireTab";

export const dynamic = "force-dynamic";

function codeFor(status: number): ApiErrorCode {
  if (status === 404) return "not_found";
  if (status === 400) return "validation_failed";
  return "internal";
}

/**
 * `POST /api/v1/admin/pos/tabs/:id/fire?location=` — "Send to KDS" / "Fire
 * course" for an open check, the native twin of the web POST. Body
 * `{ courses?: PosCourse[], fireAll?: boolean }`; omit for a non-coursed
 * everything-at-once send. Shares `@/lib/pos/fireTab` with the web route — one
 * actuator, prices/courses resolved server-side. Idempotency-Key honoured.
 * Staff+, location-scoped.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
  if (!loc) return apiError("validation_failed", "location is required");
  if (!scopeAllows(guard.claims.scope, loc)) return apiError("forbidden", `Not authorized for location "${loc}"`);

  const { id } = await ctx.params;
  let body: { courses?: unknown; fireAll?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body = fire everything */
  }

  try {
    const r = await fireTab({
      tabId: id,
      locationSlug: loc,
      courses: body?.courses,
      fireAll: body?.fireAll === true,
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    return apiOk({ order: toOrderDTO(r.order), firedCourses: r.firedCourses });
  } catch (e) {
    if (e instanceof PosActionError) return apiError(codeFor(e.httpStatus), e.message);
    throw e;
  }
}
