import { NextRequest } from "next/server";
import { apiOk, apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { chargeTab, PosActionError, type PosTender } from "@/lib/pos/fireTab";
import type { AdminRole } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

function codeFor(status: number): ApiErrorCode {
  if (status === 404) return "not_found";
  if (status === 400) return "validation_failed";
  return "internal";
}

/** Whitelist the tender-sheet fields off the request body — the server re-derives
 *  the bill and clamps tip/comp/payments in chargeTab, so this only shapes types
 *  (never trusts amounts). Mirrors the web `/api/admin/pos/orders` parse. */
function parseTender(raw: unknown): PosTender | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const payments = Array.isArray(b.payments)
    ? b.payments
        .map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          const amount = num(o.amount);
          if (amount == null) return null;
          return { method: o.method === "cash" ? "cash" : "card", amount } as const;
        })
        .filter((p): p is { method: "cash" | "card"; amount: number } => p != null)
    : undefined;
  const tender: PosTender = {
    tipGrosze: num(b.tipGrosze),
    compGrosze: num(b.compGrosze),
    compNote: typeof b.compNote === "string" ? b.compNote : undefined,
    payments,
    cashTenderedGrosze: num(b.cashTenderedGrosze),
    defaultMethod: b.defaultMethod === "cash" ? "cash" : b.defaultMethod === "card" ? "card" : undefined,
    compOverridePin: typeof b.compOverridePin === "string" ? b.compOverridePin : undefined,
  };
  return tender;
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

  // Optional tender payload (tip / split / comp / cash / manager-PIN override).
  // A bare body still charges the full bill (legacy single-tap). The actor +
  // role gate the per-shift comp cap, exactly as the web charge route does.
  let tender: PosTender | undefined;
  try {
    tender = parseTender(await req.json());
  } catch {
    /* empty / invalid body = charge full bill, no tender */
  }
  const actor = guard.claims.email || guard.claims.sub;

  try {
    const r = await chargeTab({
      tabId: id,
      locationSlug: loc,
      idempotencyKey: req.headers.get("idempotency-key"),
      tender,
      actor,
      role: guard.claims.role as AdminRole,
    });
    return apiOk(r);
  } catch (e) {
    if (e instanceof PosActionError) return apiError(codeFor(e.httpStatus), e.message);
    throw e;
  }
}
