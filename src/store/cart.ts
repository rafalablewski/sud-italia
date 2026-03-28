"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, MenuItem } from "@/data/types";

interface CartStore {
  items: CartItem[];
  locationSlug: string | null;
  addItem: (item: MenuItem, locationSlug: string) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      locationSlug: null,

      addItem: (item: MenuItem, locationSlug: string) => {
        set((state) => {
          const isNewLocation =
            state.locationSlug !== null && state.locationSlug !== locationSlug;
          const currentItems = isNewLocation ? [] : state.items;

          const existing = currentItems.find(
            (i) => i.menuItem.id === item.id
          );

          if (existing) {
            return {
              items: currentItems.map((i) =>
                i.menuItem.id === item.id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
              locationSlug,
            };
          }

          return {
            items: [
              ...currentItems,
              { menuItem: item, quantity: 1, locationSlug },
            ],
            locationSlug,
          };
        });
      },

      removeItem: (itemId: string) => {
        set((state) => {
          const newItems = state.items.filter(
            (i) => i.menuItem.id !== itemId
          );
          return {
            items: newItems,
            locationSlug: newItems.length === 0 ? null : state.locationSlug,
          };
        });
      },

      updateQuantity: (itemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.menuItem.id === itemId ? { ...i, quantity } : i
          ),
        }));
      },

      clearCart: () => set({ items: [], locationSlug: null }),

      getTotal: () =>
        get().items.reduce(
          (sum, item) => sum + item.menuItem.price * item.quantity,
          0
        ),

      getItemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: "sud-italia-cart",
    }
  )
);
