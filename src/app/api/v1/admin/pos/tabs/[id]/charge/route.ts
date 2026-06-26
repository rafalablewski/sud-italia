import { NextRequest } from "next/server";
import { apiOk, apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { chargeTab, PosActionError } from "@/lib/pos/fireTab";

export const dynamic = "force-dynamic";

function codeFor(status: number): ApiErrorCode {
  if (status === 404) return "not_found";
  if (status === 400) return "validation_failed";
  return "internal";
}

/**
 * `POST /api/v1/admin/pos/tabs/:id/charge?location=` — settle an open check:
 * ensure its Order exists, stamp it paid, close the tab. Shares
 * `@/lib/pos/fireTab` (chargeTab) with the web route. Idempotent per
 * Idempotency-Key — a retry returns the memoized result, never a second payment.
 * Returns `{ ok, orderId, totalAmount }`. Staff+, location-scoped.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
  if (!loc) return apiError("validation_failed", "location is required");
  if (!scopeAllows(guard.claims.scope, loc)) return apiError("forbidden", `Not authorized for location "${loc}"`);

  const { id } = await ctx.params;
  try {
    const r = await chargeTab({ tabId: id, locationSlug: loc, idempotencyKey: req.headers.get("idempotency-key") });
    return apiOk(r);
  } catch (e) {
    if (e instanceof PosActionError) return apiError(codeFor(e.httpStatus), e.message);
    throw e;
  }
}
