import { NextRequest } from "next/server";
import { apiOk, apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { createOrderFromCart, type CreateOrderResult } from "@/lib/checkout/createOrder";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CREATE_ERROR: Record<string, ApiErrorCode> = {
  invalid_phone: "validation_failed",
  invalid_quantity: "validation_failed",
  item_unavailable: "validation_failed",
  below_min_spend: "validation_failed",
  below_min_order: "validation_failed",
};

interface PosBody {
  locationSlug?: string;
  items?: { id?: string; quantity?: number }[];
  customerName?: string;
  customerPhone?: string;
  tableNumber?: string;
}

/**
 * `POST /api/v1/admin/pos/order` — counter (POS) sale, mirroring the web POS
 * "send to KDS". Staff+; location-scoped. Reuses the authoritative
 * `createOrderFromCart` as an **immediate dine-in** order (no slot booking — the
 * guest is at the counter), so pricing, combo/bundle math and KDS firing are the
 * exact same tested path as customer checkout. A phone is captured for the
 * receipt / loyalty (a real number, never fabricated). Channel `qr` = the
 * at-counter/at-table immediate path.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  let body: PosBody;
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }

  const locationSlug = body.locationSlug?.trim().toLowerCase();
  if (!locationSlug) return apiError("validation_failed", "locationSlug is required");
  if (!scopeAllows(guard.claims.scope, locationSlug)) {
    return apiError("forbidden", `Not authorized for location "${locationSlug}"`);
  }
  const items = (body.items ?? [])
    .filter((i): i is { id: string; quantity: number } => typeof i.id === "string" && Number(i.quantity) > 0)
    .map((i) => ({ id: i.id, quantity: Math.floor(Number(i.quantity)) }));
  if (items.length === 0) return apiError("validation_failed", "At least one item is required");
  if (!body.customerName?.trim()) return apiError("validation_failed", "customerName is required");
  if (!body.customerPhone?.trim()) return apiError("validation_failed", "customerPhone is required");

  let result: CreateOrderResult;
  try {
    result = await createOrderFromCart({
      items,
      locationSlug,
      customerName: body.customerName.trim(),
      customerPhone: body.customerPhone.trim(),
      fulfillmentType: "dine-in",
      immediate: true,
      tableNumber: body.tableNumber?.trim() || undefined,
      channel: "qr",
    });
  } catch (err) {
    logger.error("v1 pos order failed", { layer: "api.v1.admin.pos" }, err as Error);
    return apiError("internal", "Could not create the order");
  }

  if (!result.ok) {
    return apiError(CREATE_ERROR[result.code] ?? "bad_request", result.message, { code: result.code });
  }
  return apiOk(toOrderDTO(result.order), { paid: result.order.paidAt != null }, 201);
}
