import { create } from "zustand";
import type { MenuItemDTO, SelectedModifier } from "@/api/types";
import { cartLineKey, effectiveUnitPrice } from "@/lib/menu";

/**
 * Customer cart — the native analogue of web `src/store/cart.ts`. Holds line
 * items (menu item + chosen modifiers + qty + note), keyed by item id + sorted
 * option ids so each modifier variant stacks separately (web `cartLineKey`).
 * Also carries the checkout choices (fulfilment, delivery address, dine-in
 * party, tip, kitchen note) so the cart screen drives the whole flow.
 *
 * Totals here are an optimistic client estimate — the server re-prices
 * authoritatively on `POST /api/v1/orders` and never trusts a client total.
 */

export type Fulfillment = "takeout" | "delivery" | "dine-in";

export interface CartLine {
  key: string;
  item: MenuItemDTO;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes?: string;
}

interface CartState {
  locationSlug: string | null;
  lines: CartLine[];
  fulfillment: Fulfillment;
  deliveryAddress: string;
  partySize: number;
  tipGrosze: number;
  specialInstructions: string;

  add: (item: MenuItemDTO, locationSlug: string, selectedModifiers?: SelectedModifier[], quantity?: number, notes?: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  setNotes: (key: string, notes: string) => void;
  remove: (key: string) => void;
  clear: () => void;
  resetCheckout: () => void;

  setFulfillment: (f: Fulfillment) => void;
  setDeliveryAddress: (a: string) => void;
  setPartySize: (n: number) => void;
  setTip: (grosze: number) => void;
  setSpecialInstructions: (s: string) => void;

  count: () => number;
  /** Food subtotal incl. modifier surcharges (excludes tip / delivery). */
  subtotal: () => number;
  lineTotal: (line: CartLine) => number;
}

export const useCart = create<CartState>((set, get) => ({
  locationSlug: null,
  lines: [],
  fulfillment: "takeout",
  deliveryAddress: "",
  partySize: 2,
  tipGrosze: 0,
  specialInstructions: "",

  add: (item, locationSlug, selectedModifiers = [], quantity = 1, notes) =>
    set((s) => {
      // A cart belongs to one location; switching restaurants starts fresh.
      const switching = s.locationSlug && s.locationSlug !== locationSlug;
      const base = switching ? [] : s.lines;
      const key = cartLineKey(item.id, selectedModifiers);
      const existing = base.find((l) => l.key === key);
      const lines = existing
        ? base.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l))
        : [...base, { key, item, quantity, selectedModifiers, notes }];
      return switching
        ? { lines, locationSlug, tipGrosze: 0, specialInstructions: "" }
        : { lines, locationSlug };
    }),

  setQuantity: (key, quantity) =>
    set((s) => ({
      lines: quantity <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
    })),

  setNotes: (key, notes) =>
    set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, notes: notes || undefined } : l)) })),

  remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),

  clear: () => set({ lines: [], locationSlug: null, tipGrosze: 0, specialInstructions: "", deliveryAddress: "" }),

  resetCheckout: () => set({ tipGrosze: 0, specialInstructions: "" }),

  setFulfillment: (fulfillment) => set({ fulfillment }),
  setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
  setPartySize: (partySize) => set({ partySize: Math.max(1, partySize) }),
  setTip: (tipGrosze) => set({ tipGrosze: Math.max(0, Math.round(tipGrosze)) }),
  setSpecialInstructions: (specialInstructions) => set({ specialInstructions }),

  count: () => get().lines.reduce((n, l) => n + l.quantity, 0),
  lineTotal: (line) => effectiveUnitPrice(line.item, line.selectedModifiers) * line.quantity,
  subtotal: () => get().lines.reduce((n, l) => n + effectiveUnitPrice(l.item, l.selectedModifiers) * l.quantity, 0),
}));
