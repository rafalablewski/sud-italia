import type { Order, CartItem } from "@/data/types";
import { analyzeTruck, type TicketPrediction } from "@/lib/kds-prediction";
import { kdsShortId } from "@/lib/kds-ticket";
import type { OrderDTO, OrderLineDTO } from "./schemas";

/**
 * The on-the-wire order shape for the OttavianoKDS operator app (Orders board +
 * KDS). Pure mapping (no I/O) so it's shared by the list, detail and SSE
 * endpoints AND unit-tested. Money stays in grosze; the app formats via
 * `MoneyText`. Stripe ids, refunds, disputes and food cost are deliberately
 * NOT exposed on this operator-ops surface.
 *
 * The ticket carries everything the native KDS card renders at web parity:
 * resolved modifier labels (+ `flagOnKds` callout), per-line allergens, the
 * coursing state, and — for the live board — a server-computed prediction block
 * (promised/predicted-ready + at-risk) that drives the SLA meter and tone tiers.
 * The prediction needs the whole board (queue depth), so it's filled by the
 * board-level `toOrderDTOs`; the single-order `toOrderDTO` leaves it null.
 *
 * `OrderDTO`/`OrderLineDTO` are inferred from the Zod contract (schemas.ts), so
 * if this mapper's output drifts from the published contract it fails to
 * compile — the drift firewall (ARCHITECTURE §5).
 */
export type { OrderDTO, OrderLineDTO } from "./schemas";

function lineToDTO(line: CartItem): OrderLineDTO {
  return {
    menuItemId: line.menuItem.id,
    name: line.menuItem.name,
    category: line.menuItem.category,
    quantity: line.quantity,
    unitPrice: line.menuItem.price,
    notes: line.notes ?? null,
    // Resolve the modifier picks to cook-readable labels + the KDS flag, so the
    // app needn't carry the menu's modifier catalogue. Mirrors buildKdsTicket.
    modifiers: (line.selectedModifiers ?? []).map((sel) => {
      const opt = line.menuItem.modifierGroups
        ?.find((g) => g.id === sel.groupId)
        ?.options.find((o) => o.id === sel.optionId);
      return { label: opt?.label ?? sel.optionId, flag: !!opt?.flagOnKds };
    }),
    allergens: (line.menuItem.allergens ?? []) as string[],
  };
}

export function toOrderDTO(order: Order, prediction?: TicketPrediction): OrderDTO {
  return {
    id: order.id,
    shortId: kdsShortId(order.id),
    locationSlug: order.locationSlug,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    channel: order.channel ?? "web",
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.items.map(lineToDTO),
    totalAmount: order.totalAmount,
    tipAmount: order.tipAmount ?? null,
    deliveryFee: order.deliveryFee ?? null,
    partySize: order.partySize ?? null,
    tableId: order.tableId ?? null,
    specialInstructions: order.specialInstructions ?? null,
    slotDate: order.slotDate,
    slotTime: order.slotTime,
    createdAt: order.createdAt,
    paidAt: order.paidAt ?? null,
    estimatedReadyAt: order.estimatedReadyAt ?? null,
    queuePosition: order.queuePosition ?? null,
    coursing: order.coursing ?? null,
    simulated: order.simulated ?? false,
    prediction: prediction
      ? {
          promisedReadyAtMs: prediction.promisedReadyAtMs,
          predictedReadyAtMs: prediction.predictedReadyAtMs,
          predSeconds: prediction.predSeconds,
          atRisk: prediction.atRisk,
        }
      : null,
    voidedItems: order.voidedItems?.length
      ? order.voidedItems.map((v) => ({ name: v.name, quantity: v.quantity, reason: v.reason ?? null, at: v.at }))
      : null,
  };
}

/**
 * Board-level mapper for the operator KDS/Orders feed (list + SSE). Computes the
 * predictive block the web KDS draws from: the model is per-truck (a station's
 * queue depth is local), so orders are grouped by location, `analyzeTruck` runs
 * once per group, and each ticket is mapped with its own prediction. `nowMs` is
 * injectable for deterministic tests; defaults to the call instant.
 */
export function toOrderDTOs(orders: Order[], nowMs: number = Date.now()): OrderDTO[] {
  const byLocation = new Map<string, Order[]>();
  for (const o of orders) {
    const arr = byLocation.get(o.locationSlug);
    if (arr) arr.push(o);
    else byLocation.set(o.locationSlug, [o]);
  }
  const predictions = new Map<string, TicketPrediction>();
  for (const list of byLocation.values()) {
    for (const [id, p] of analyzeTruck(list, nowMs).predictions) predictions.set(id, p);
  }
  return orders.map((o) => toOrderDTO(o, predictions.get(o.id)));
}
