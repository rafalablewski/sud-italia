import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireCustomer } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { getOrdersByPhone } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 50;

/**
 * `GET /api/v1/customer/orders` — the signed-in customer's own orders.
 *
 * The token subject is the phone; `getOrdersByPhone` returns newest-first and
 * already strips simulated rows. `includePending` is on so a just-placed
 * (unpaid) order appears immediately for tracking. Capped — the app paginates
 * by `since` if it ever needs deep history.
 */
export async function GET(req: NextRequest) {
  const guard = requireCustomer(req);
  if ("error" in guard) return guard.error;
  const phone = guard.claims.sub;
  const since = req.nextUrl.searchParams.get("since")?.trim() || undefined;

  try {
    const orders = await getOrdersByPhone(phone, { includePending: true, sinceIso: since });
    const capped = orders.slice(0, HISTORY_LIMIT);
    // Per-order map — pass only the order (never map's index as `prediction`).
    return apiOk(capped.map((o) => toOrderDTO(o)), { count: capped.length, limit: HISTORY_LIMIT });
  } catch (err) {
    logger.error("v1 customer orders failed", { layer: "api.v1.customer.orders" }, err as Error);
    return apiError("internal", "Could not load your orders");
  }
}
