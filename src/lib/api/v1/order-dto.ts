import type { Order, CartItem } from "@/data/types";

/**
 * The on-the-wire order shape for the OttavianoKDS operator app (Orders board +
 * KDS). Pure mapping (no I/O) so it's shared by the list, detail and SSE
 * endpoints AND unit-tested. Money stays in grosze; the app formats via
 * `MoneyText`. Stripe ids, refunds, disputes and food cost are deliberately
 * NOT exposed on this operator-ops surface.
 */

export interface OrderLineDTO {
  menuItemId: string;
  name: string;
  quantity: number;
  /** Unit price in grosze (line subtotal = price × quantity + modifier deltas). */
  unitPrice: number;
  notes: string | null;
  modifiers: { groupId: string; optionId: string }[];
}

export interface OrderDTO {
  id: string;
  locationSlug: string;
  status: Order["status"];
  fulfillmentType: Order["fulfillmentType"];
  channel: Order["channel"];
  customerName: string;
  customerPhone: string;
  items: OrderLineDTO[];
  totalAmount: number;
  tipAmount: number | null;
  deliveryFee: number | null;
  partySize: number | null;
  tableId: string | null;
  specialInstructions: string | null;
  slotDate: string;
  slotTime: string;
  createdAt: string;
  paidAt: string | null;
  estimatedReadyAt: string | null;
  queuePosition: number | null;
}

function lineToDTO(line: CartItem): OrderLineDTO {
  return {
    menuItemId: line.menuItem.id,
    name: line.menuItem.name,
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
