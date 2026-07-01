import type { FulfillmentType, MenuCategory, Order, OrderStatus, PosCourse } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import type { TicketPrediction } from "./kds-prediction";

/**
 * Normalised KDS ticket — the single shape every KDS surface renders, so the
 * Atlas fleet board, the floor board (desktop + mobile) and the fullscreen
 * kiosk all draw byte-for-byte identical cards. Built server-side for the fleet
 * feed and client-side for the floor board, both via `buildKdsTicket` so the
 * two paths can never drift.
 */
export interface KdsTicketItem {
  name: string;
  quantity: number;
  category: MenuCategory;
  categoryLabel: string;
  notes?: string;
  allergens: string[];
  /** Resolved modifier picks for the line. `flag` mirrors the option's
   *  `flagOnKds` so the cook gets a highlighted callout (e.g. BUFFALO MOZZ). */
  modifiers: { label: string; flag: boolean }[];
}

export interface KdsTicket {
  id: string;
  shortId: string;
  customerName: string;
  fulfillmentType: FulfillmentType;
  partySize?: number;
  /** Assigned floor table (FloorTable.id) for dine-in — lets the Pass card
   *  react to the cross-lens selection (a table picked on Floor pulses here). */
  tableId?: string;
  status: OrderStatus;
  slotTime: string;
  specialInstructions?: string;
  itemCount: number;
  items: KdsTicketItem[];
  /** When the order was paid (ms epoch) — the elapsed-timer anchor. */
  paidAtMs: number;
  /** Promised-ready instant (ms epoch) from the order SLA, or null. */
  promisedReadyAtMs: number | null;
  /** Model's predicted-ready instant (ms epoch) from the prediction engine. */
  predictedReadyAtMs: number;
  predSeconds: number;
  atRisk: boolean;
  simulated?: boolean;
  /** POS coursing state (dine-in) — held courses are still in the kitchen. */
  coursing?: { fired: PosCourse[]; held: PosCourse[] };
}

/** Short, glanceable ticket id — last 6 chars, uppercased, symbols trimmed. */
export function kdsShortId(id: string): string {
  return id.slice(-6).replace(/^[^a-z0-9]+/i, "").toUpperCase();
}

/**
 * Map an order + its prediction (from `analyzeTruck`) into the render shape.
 * Pure and client-safe (types + a data constant only), so both the owner fleet
 * route and the floor board build tickets identically.
 */
export function buildKdsTicket(o: Order, prediction: TicketPrediction | undefined, nowMs: number): KdsTicket {
  return {
    id: o.id,
    shortId: kdsShortId(o.id),
    customerName: o.customerName || "Guest",
    fulfillmentType: o.fulfillmentType,
    partySize: o.partySize,
    tableId: o.tableId,
    status: o.status,
    slotTime: o.slotTime,
    specialInstructions: o.specialInstructions,
    itemCount: o.items.reduce((n, ci) => n + ci.quantity, 0),
    items: o.items.map((ci) => ({
      name: ci.menuItem.name,
      quantity: ci.quantity,
      category: ci.menuItem.category,
      categoryLabel: MENU_CATEGORY_LABELS[ci.menuItem.category] ?? ci.menuItem.category,
      notes: ci.notes,
      allergens: ci.menuItem.allergens ?? [],
      modifiers: (ci.selectedModifiers ?? []).map((sel) => {
        const opt = ci.menuItem.modifierGroups
          ?.find((g) => g.id === sel.groupId)
          ?.options.find((o) => o.id === sel.optionId);
        return { label: opt?.label ?? sel.optionId, flag: !!opt?.flagOnKds };
      }),
    })),
    paidAtMs: Date.parse(o.paidAt ?? o.createdAt) || nowMs,
    promisedReadyAtMs: prediction?.promisedReadyAtMs ?? null,
    predictedReadyAtMs: prediction?.predictedReadyAtMs ?? nowMs,
    predSeconds: prediction?.predSeconds ?? 0,
    atRisk: prediction?.atRisk ?? false,
    simulated: o.simulated ?? false,
    coursing: o.coursing,
  };
}
