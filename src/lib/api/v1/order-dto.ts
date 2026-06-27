import type { Order, CartItem } from "@/data/types";
import type { OrderDTO, OrderLineDTO } from "./schemas";

/**
 * The on-the-wire order shape for the OttavianoKDS operator app (Orders board +
 * KDS). Pure mapping (no I/O) so it's shared by the list, detail and SSE
 * endpoints AND unit-tested. Money stays in grosze; the app formats via
 * `MoneyText`. Stripe ids, refunds, disputes and food cost are deliberately
 * NOT exposed on this operator-ops surface.
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
    modifiers: (line.selectedModifiers ?? []).map((m) => ({
      groupId: m.groupId,
      optionId: m.optionId,
    })),
  };
}

export function toOrderDTO(order: Order): OrderDTO {
  return {
    id: order.id,
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
  };
}
