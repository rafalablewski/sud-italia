"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, MenuItem, FulfillmentType } from "@/data/types";
import { effectiveUnitPrice } from "@/lib/upsell";

interface CartStore {
  items: CartItem[];
  locationSlug: string | null;
  fulfillmentType: FulfillmentType;
  selectedSlotId: string | null;
  selectedSlotTime: string | null;
  selectedSlotDate: string | null;
  deliveryAddress: string;
  /** Tip in grosze; defaults to 0 (no tip selected). Survives refresh via the
   *  persisted store, gets cleared on clearCart so it doesn't leak between
   *  orders. */
  tipAmount: number;
  /** Active bundle id (audit §3.2). When set, the cart subtotal switches
   *  from sum-of-lines to the locked `bundlePriceGrosze`; the items array
   *  still drives the KDS ticket so the kitchen sees what to make. Cleared
   *  whenever the line-up no longer satisfies the bundle composition. */
  appliedBundleId: string | null;
  bundlePriceGrosze: number;
  setFulfillmentType: (type: FulfillmentType) => void;
  setSelectedSlot: (id: string | null, time: string | null, date: string | null) => void;
  setDeliveryAddress: (address: string) => void;
  setTipAmount: (grosze: number) => void;
  addItem: (item: MenuItem, locationSlug: string) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  setItemNotes: (itemId: string, notes: string) => void;
  /**
   * Replace the cart with the bundle's resolved composition and lock the
   * subtotal to `priceGrosze`. Pass `null` to clear an applied bundle and
   * fall back to per-line pricing.
   */
  applyBundle: (
    bundleId: string,
    priceGrosze: number,
    items: CartItem[],
    locationSlug: string,
  ) => void;
  clearBundle: () => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      locationSlug: null,
      fulfillmentType: "takeout" as FulfillmentType,
      selectedSlotId: null,
      selectedSlotTime: null,
      selectedSlotDate: null,
      deliveryAddress: "",
      tipAmount: 0,
      appliedBundleId: null,
      bundlePriceGrosze: 0,

      setFulfillmentType: (type: FulfillmentType) =>
        set({ fulfillmentType: type, selectedSlotId: null, selectedSlotTime: null, selectedSlotDate: null }),

      setSelectedSlot: (id: string | null, time: string | null, date: string | null) =>
        set({ selectedSlotId: id, selectedSlotTime: time, selectedSlotDate: date }),

      setDeliveryAddress: (address: string) => set({ deliveryAddress: address }),

      setTipAmount: (grosze: number) =>
        set({ tipAmount: Math.max(0, Math.round(grosze)) }),

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
              // Adding extras outside the bundle composition breaks the lock.
              appliedBundleId: null,
              bundlePriceGrosze: 0,
            };
          }

          return {
            items: [
              ...currentItems,
              { menuItem: item, quantity: 1, locationSlug },
            ],
            locationSlug,
            appliedBundleId: null,
            bundlePriceGrosze: 0,
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
            // Removing a line breaks the bundle lock — fall back to
            // per-item pricing rather than charge the full bundle price
            // for a smaller order.
            appliedBundleId: null,
            bundlePriceGrosze: 0,
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
          appliedBundleId: null,
          bundlePriceGrosze: 0,
        }));
      },

      applyBundle: (
        bundleId: string,
        priceGrosze: number,
        items: CartItem[],
        locationSlug: string,
      ) => {
        set({
          items,
          locationSlug,
          appliedBundleId: bundleId,
          bundlePriceGrosze: Math.max(0, Math.round(priceGrosze)),
        });
      },

      clearBundle: () =>
        set({ appliedBundleId: null, bundlePriceGrosze: 0 }),

      setItemNotes: (itemId: string, notes: string) => {
        const trimmed = notes.trim();
        set((state) => ({
          items: state.items.map((i) =>
            i.menuItem.id === itemId
              ? { ...i, notes: trimmed.length > 0 ? trimmed : undefined }
              : i
          ),
        }));
      },

      clearCart: () =>
        set({
          items: [],
          locationSlug: null,
          fulfillmentType: "takeout",
          selectedSlotId: null,
          selectedSlotTime: null,
          selectedSlotDate: null,
          deliveryAddress: "",
          tipAmount: 0,
          appliedBundleId: null,
          bundlePriceGrosze: 0,
        }),

      getTotal: () => {
        const state = get();
        // When a bundle is applied, the locked price replaces line summing.
        // Tip + delivery still apply on top inside CartDrawer.
        if (state.appliedBundleId && state.bundlePriceGrosze > 0) {
          return state.bundlePriceGrosze;
        }
        // Effective unit price includes any per-line modifier surcharges
        // (audit §3 — Extra cheese +6, Sourdough crust +5, etc.).
        return state.items.reduce(
          (sum, item) => sum + effectiveUnitPrice(item) * item.quantity,
          0
        );
      },

      getItemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: "sud-italia-cart",
    }
  )
);
