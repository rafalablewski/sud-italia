"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { CartItem, MenuItem, FulfillmentType, SelectedModifier } from "@/data/types";
import { effectiveUnitPrice } from "@/lib/upsell";

/**
 * Stable identity for a cart line. Two lines merge only when they are the same
 * menu item with the same modifier selections — so a plain Margherita and a
 * Margherita with "half Diavola + extra cheese" sit on separate lines and the
 * stepper / remove / notes target the right one. Lines with no modifiers key on
 * the bare menu-item id, so every existing caller that passed `menuItem.id`
 * keeps addressing the correct line unchanged.
 */
export function cartLineKey(
  item: Pick<CartItem, "menuItem" | "selectedModifiers">,
): string {
  const mods = item.selectedModifiers;
  if (!mods || mods.length === 0) return item.menuItem.id;
  const sig = mods
    .map((m) => `${m.groupId}:${m.optionId}`)
    .sort()
    .join("|");
  return `${item.menuItem.id}#${sig}`;
}

/**
 * Debounced localStorage adapter. The previous sync-on-every-set
 * implementation stringified the full cart (including each line's
 * `menuItem` with `modifierGroups`, allergens, sourcing strings) on
 * every keystroke — perceptibly laggy on iOS Safari, where localStorage
 * writes block the main thread for 5–20ms per write. We now coalesce
 * writes to one per 150ms; survivability across reload is unaffected
 * (a 150ms window is shorter than any real refresh).
 *
 * On `beforeunload` we flush synchronously so an in-flight write isn't
 * dropped when the user navigates away.
 */
function debouncedLocalStorage(delayMs = 150): StateStorage {
  if (typeof window === "undefined") {
    // SSR no-op shim
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; value: string } | null = null;

  const flush = () => {
    if (pending) {
      try {
        window.localStorage.setItem(pending.key, pending.value);
      } catch {
        // Quota / Safari private-mode — drop silently; cart is non-essential
        // to persist (worst case: cart resets on reload).
      }
      pending = null;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  window.addEventListener("beforeunload", flush);
  // pagehide is the iOS-correct event when the page enters the back/forward
  // cache; beforeunload alone misses some Safari paths.
  window.addEventListener("pagehide", flush);

  return {
    getItem: (name) => {
      try {
        return window.localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { key: name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (name) => {
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        window.localStorage.removeItem(name);
      } catch {
        // ignore
      }
    },
  };
}

interface CartStore {
  items: CartItem[];
  locationSlug: string | null;
  fulfillmentType: FulfillmentType;
  selectedSlotId: string | null;
  selectedSlotTime: string | null;
  selectedSlotDate: string | null;
  deliveryAddress: string;
  /** Guests for a dine-in reservation. Only meaningful when
   *  fulfillmentType === "dine-in"; defaults to 2. */
  partySize: number;
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
  setPartySize: (size: number) => void;
  setTipAmount: (grosze: number) => void;
  addItem: (
    item: MenuItem,
    locationSlug: string,
    selectedModifiers?: SelectedModifier[],
  ) => void;
  /** All three address a line by its `cartLineKey` (= menu-item id when the
   *  line has no modifiers, so old call sites passing `menuItem.id` still work). */
  removeItem: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  setItemNotes: (lineKey: string, notes: string) => void;
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
      partySize: 2,
      tipAmount: 0,
      appliedBundleId: null,
      bundlePriceGrosze: 0,

      setFulfillmentType: (type: FulfillmentType) =>
        set({ fulfillmentType: type, selectedSlotId: null, selectedSlotTime: null, selectedSlotDate: null }),

      setSelectedSlot: (id: string | null, time: string | null, date: string | null) =>
        set({ selectedSlotId: id, selectedSlotTime: time, selectedSlotDate: date }),

      setDeliveryAddress: (address: string) => set({ deliveryAddress: address }),

      setPartySize: (size: number) =>
        set({ partySize: Math.max(1, Math.min(50, Math.round(size))) }),

      setTipAmount: (grosze: number) =>
        set({ tipAmount: Math.max(0, Math.round(grosze)) }),

      addItem: (
        item: MenuItem,
        locationSlug: string,
        selectedModifiers?: SelectedModifier[],
      ) => {
        set((state) => {
          const isNewLocation =
            state.locationSlug !== null && state.locationSlug !== locationSlug;
          const currentItems = isNewLocation ? [] : state.items;

          const mods =
            selectedModifiers && selectedModifiers.length > 0
              ? selectedModifiers
              : undefined;
          const candidate: CartItem = {
            menuItem: item,
            quantity: 1,
            locationSlug,
            ...(mods ? { selectedModifiers: mods } : {}),
          };
          // Lines are keyed by item id + chosen modifiers, so a Margherita with
          // "half Diavola + extra cheese" stacks separately from a plain one.
          const key = cartLineKey(candidate);
          const existing = currentItems.find((i) => cartLineKey(i) === key);

          if (existing) {
            return {
              items: currentItems.map((i) =>
                cartLineKey(i) === key
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
            items: [...currentItems, candidate],
            locationSlug,
            appliedBundleId: null,
            bundlePriceGrosze: 0,
          };
        });
      },

      removeItem: (lineKey: string) => {
        set((state) => {
          const newItems = state.items.filter(
            (i) => cartLineKey(i) !== lineKey
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

      updateQuantity: (lineKey: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(lineKey);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            cartLineKey(i) === lineKey ? { ...i, quantity } : i
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

      setItemNotes: (lineKey: string, notes: string) => {
        const trimmed = notes.trim();
        set((state) => ({
          items: state.items.map((i) =>
            cartLineKey(i) === lineKey
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
          partySize: 2,
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
      storage: createJSONStorage(() => debouncedLocalStorage()),
    },
  ),
);
