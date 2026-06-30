import { create } from "zustand";
import type { MenuItemDTO } from "@/api/types";

/**
 * Customer cart — the native analogue of web `src/store/cart.ts`. Holds line items
 * (menu item + qty + notes) for one location; switching location clears it. Totals
 * shown here are an optimistic client estimate — the server re-prices
 * authoritatively on `POST /api/v1/orders` (it never trusts a client total).
 */

export interface CartLine {
  item: MenuItemDTO;
  quantity: number;
  notes?: string;
}

interface CartState {
  locationSlug: string | null;
  lines: CartLine[];
  add: (item: MenuItemDTO, locationSlug: string) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  remove: (itemId: string) => void;
  clear: () => void;
  count: () => number;
  subtotal: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  locationSlug: null,
  lines: [],
  add: (item, locationSlug) =>
    set((s) => {
      // A cart belongs to one location; switching restaurants starts fresh.
      const base = s.locationSlug && s.locationSlug !== locationSlug ? [] : s.lines;
      const existing = base.find((l) => l.item.id === item.id);
      const lines = existing
        ? base.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...base, { item, quantity: 1 }];
      return { lines, locationSlug };
    }),
  setQuantity: (itemId, quantity) =>
    set((s) => ({
      lines: quantity <= 0 ? s.lines.filter((l) => l.item.id !== itemId) : s.lines.map((l) => (l.item.id === itemId ? { ...l, quantity } : l)),
    })),
  remove: (itemId) => set((s) => ({ lines: s.lines.filter((l) => l.item.id !== itemId) })),
  clear: () => set({ lines: [], locationSlug: null }),
  count: () => get().lines.reduce((n, l) => n + l.quantity, 0),
  subtotal: () => get().lines.reduce((n, l) => n + l.item.price * l.quantity, 0),
}));
