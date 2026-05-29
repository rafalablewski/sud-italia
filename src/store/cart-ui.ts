"use client";

import { create } from "zustand";
import type { MenuItem } from "@/data/types";

/**
 * Cart UI store — transient (non-persisted) coordination state for the
 * checkout drawer, the floating cart pill, the add-to-cart toast, and
 * the item-detail drawer.
 *
 * Why a separate store? The persisted `useCartStore` holds the cart's
 * line items / fulfilment / slot / address — things that *must* survive
 * a refresh. The drawer's open/closed state, by contrast, is page-local:
 * a refresh should put the customer back on the menu with both drawers
 * closed. Likewise the active location's menu items live in this store
 * so the cart drawer can read them without every trigger component
 * having to pass them down as props.
 *
 * Single-mount contract:
 *   - `(public)/layout.tsx` mounts <CartDrawer />, <FloatingCartButton />,
 *     <AddToCartToast />, <AbandonedCartBanner />, and <ItemDetailDrawer />
 *     exactly once each. The drawer-style surfaces read their open state
 *     + payload from this store.
 *   - Trigger surfaces (<CartButton />, <FloatingCartButton />,
 *     <AbandonedCartBanner />, the "Details" button on a menu card)
 *     call the matching setter instead of mounting their own instance.
 *   - <MenuItemsRegistrar /> (rendered by /locations/[slug]) seeds
 *     menuItems on mount so the layout-level <CartDrawer />'s
 *     cross-sell rail + bundle ladder + tier perk + <AddToCartToast />'s
 *     seed copy read the same data the menu chrome above renders.
 */
interface DetailPayload {
  item: MenuItem;
  /** Location slug this item belongs to. Captured from the menu card
   *  that opened the drawer so the detail's Add-to-cart CTA can call
   *  `useCartStore.addItem(item, locationSlug)` even when the cart is
   *  still empty (the cart only learns its location once the first
   *  item lands — without this, the drawer's Add CTA would be
   *  permanently disabled for an empty cart). */
  locationSlug: string;
  /** Whether this dish is in the "popular this week" set at the active
   *  location (real 7-day order counts). The menu card already knows
   *  this and hands it through when opening the detail drawer so the
   *  V8 chrome can surface a "popular this week · richiesto in
   *  settimana" callout without re-fetching. */
  popularThisWeek: boolean;
}

interface CartUIStore {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  menuItems: MenuItem[];
  setMenuItems: (items: MenuItem[]) => void;
  /** Active item-detail payload. Null = drawer closed. */
  detailItem: DetailPayload | null;
  setDetailItem: (payload: DetailPayload | null) => void;
}

export const useCartUIStore = create<CartUIStore>()((set) => ({
  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  menuItems: [],
  setMenuItems: (items) => set({ menuItems: items }),
  detailItem: null,
  setDetailItem: (payload) => set({ detailItem: payload }),
}));
