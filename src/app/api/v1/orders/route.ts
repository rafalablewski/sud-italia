import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { apiOk, apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { requireOperator, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { authenticateBearer } from "@/lib/api/v1/auth";
import { toOrderDTO, toOrderDTOs } from "@/lib/api/v1/order-dto";
import { OrderCreateSchema } from "@/lib/api/v1/schemas";
import {
  getOrders,
  getOrderById,
  getApiOrderIdempotency,
  saveApiOrderIdempotency,
  ORDERS_BOARD_LIMIT,
} from "@/lib/store";
import { createOrderFromCart, type CreateOrderResult } from "@/lib/checkout/createOrder";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { Order } from "@/data/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Map createOrderFromCart's typed failure codes onto the v1 envelope.
const CREATE_ERROR: Record<string, ApiErrorCode> = {
  invalid_phone: "validation_failed",
  invalid_quantity: "validation_failed",
  item_unavailable: "validation_failed",
  below_min_spend: "validation_failed",
  below_min_order: "validation_failed",
  slot_fulfillment_mismatch: "validation_failed",
  slot_not_found: "not_found",
  slot_full: "conflict",
  slot_capacity_lost: "conflict",
};

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
    // Board-level mapper so each ticket carries its predictive block (SLA / at-risk),
    // computed per location via analyzeTruck — web KDS parity.
    return apiOk(toOrderDTOs(capped), { count: capped.length, limit: ORDERS_BOARD_LIMIT });
  } catch (err) {
    logger.error("v1 orders list failed", { layer: "api.v1.orders" }, err as Error);
    return apiError("internal", "Could not load orders");
  }
}

/**
 * `POST /api/v1/orders` — create an order (customer app or guest checkout).
 *
 * Zero-friction (Rule #6): no login required. When a customer Bearer token is
 * present the phone comes from it; otherwise customerName + customerPhone are
 * required (guest). Pricing is ALWAYS authoritative server-side via the shared
 * createOrderFromCart (menu lookup, bundle/combo math, delivery fee, slot
 * capacity) — client totals are never trusted. Pass an `Idempotency-Key` header
 * to make retries safe: a repeat with the same key + body returns the original
 * order instead of creating a second one. The order is created unpaid; payment
 * (Stripe / Apple Pay) is a later increment.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit({ key: "v1-order-create", id: getClientIp(req), limit: 10, windowSec: 60 });
  if (!rl.allowed) return apiError("rate_limited", "Too many orders. Try again shortly.");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = OrderCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("validation_failed", "Invalid order payload", parsed.error.flatten());
  }
  const body = parsed.data;

  // Identity: customer token wins for the phone; else guest must supply it.
  const claims = authenticateBearer(req);
  const tokenPhone =
    claims && claims.aud === "ottaviano" && claims.role === "customer" ? claims.sub : null;
  const customerPhone = tokenPhone ?? body.customerPhone;
  const customerName = body.customerName ?? claims?.name;
  if (!customerPhone) return apiError("validation_failed", "customerPhone is required");
  if (!customerName) return apiError("validation_failed", "customerName is required");

  // Idempotency: hash the key with the payload so reusing a key for a different
  // cart still gets a fresh attempt (never returns someone else's order).
  const idemKey = req.headers.get("idempotency-key")?.trim();
  const idemHash = idemKey
    ? createHash("sha256").update(`${idemKey}|${customerPhone}|${JSON.stringify(body)}`).digest("hex")
    : null;
  if (idemHash) {
    const priorId = await getApiOrderIdempotency(idemHash);
    if (priorId) {
      const prior = await getOrderById(priorId);
      if (prior) return apiOk(toOrderDTO(prior), { idempotent: true, paid: prior.paidAt != null });
    }
  }

  let result: CreateOrderResult;
  try {
    result = await createOrderFromCart({
      items: body.items,
      locationSlug: body.locationSlug,
      customerName,
      customerPhone,
      fulfillmentType: body.fulfillmentType,
      slotId: body.slotId,
      slotDate: body.slotDate,
      slotTime: body.slotTime,
      immediate: body.immediate,
      tableNumber: body.tableNumber,
      deliveryAddress: body.deliveryAddress,
      partySize: body.partySize,
      tipAmount: body.tipAmount,
      appliedBundleId: body.appliedBundleId,
      channel: body.channel ?? "web",
    });
  } catch (err) {
    logger.error("v1 order create failed", { layer: "api.v1.orders" }, err as Error);
    return apiError("internal", "Could not create order");
  }

  if (!result.ok) {
    return apiError(CREATE_ERROR[result.code] ?? "bad_request", result.message, {
      code: result.code,
      detail: result.detail,
    });
  }

  if (idemHash) await saveApiOrderIdempotency(idemHash, result.order.id);
  return apiOk(toOrderDTO(result.order), { paid: result.order.paidAt != null }, 201);
}
