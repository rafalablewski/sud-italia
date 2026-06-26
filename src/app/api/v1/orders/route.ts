import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireOperator, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { getOrders, ORDERS_BOARD_LIMIT } from "@/lib/store";
import type { Order } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/orders` — the operator Orders/KDS board (Bearer).
 *
 * Location-scoped: `?location=` must be within the token's scope; a scoped
 * operator who omits it gets their allowed locations merged (an unrestricted
 * "*" operator gets the chain). Capped to the recent board window, newest first
 * — same contract as the web admin board. Reuses getOrders, so simulated rows
 * are stripped and the indexed read does the work.
 */
export async function GET(req: NextRequest) {
  const guard = requireOperator(req);
  if ("error" in guard) return guard.error;
  const { scope } = guard.claims;

  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  const sinceParam = req.nextUrl.searchParams.get("since")?.trim() || undefined;

  if (requested && !scopeAllows(scope, requested)) {
    return apiError("forbidden", `Not authorized for location "${requested}"`);
  }

  try {
    let orders: Order[];
    if (requested) {
      orders = await getOrders(requested, sinceParam, { limit: ORDERS_BOARD_LIMIT });
    } else {
      const allowed = scopedLocations(scope);
      if (allowed === null) {
        // Unrestricted — chain-wide board.
        orders = await getOrders(undefined, sinceParam, { limit: ORDERS_BOARD_LIMIT });
      } else if (allowed.length === 0) {
        orders = [];
      } else {
        // Scoped to specific sites — read each and merge.
        const lists = await Promise.all(
          allowed.map((slug) => getOrders(slug, sinceParam, { limit: ORDERS_BOARD_LIMIT })),
        );
        orders = lists.flat();
      }
    }

    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const capped = orders.slice(0, ORDERS_BOARD_LIMIT);
    return apiOk(capped.map(toOrderDTO), { count: capped.length, limit: ORDERS_BOARD_LIMIT });
  } catch (err) {
    logger.error("v1 orders list failed", { layer: "api.v1.orders" }, err as Error);
    return apiError("internal", "Could not load orders");
  }
}
