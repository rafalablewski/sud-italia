import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireCustomer } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { getOrderById } from "@/lib/store";
import { phonesEqualPl } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/customer/orders/:id` — one of the customer's own orders.
 *
 * Ownership-gated on the token phone. A non-owned (or missing) id returns 404
 * uniformly — never 403 — so an attacker can't probe which order ids exist.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireCustomer(req);
  if ("error" in guard) return guard.error;

  const { id } = await ctx.params;
  const order = await getOrderById(id);
  if (!order || !phonesEqualPl(order.customerPhone, guard.claims.sub)) {
    return apiError("not_found", "Order not found");
  }
  return apiOk(toOrderDTO(order));
}
