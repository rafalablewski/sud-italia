"use client";

import { create } from "zustand";
import type { MenuItem } from "@/data/types";

/**
 * Cart UI store — transient (non-persisted) coordination state for the
 * checkout drawer and the floating cart pill.
 *
 * Why a separate store? The persisted `useCartStore` holds the cart's
 * line items / fulfilment / slot / address — things that *must* survive
 * a refresh. The drawer's open/closed state, by contrast, is page-local:
 * a refresh should put the customer back on the menu with the drawer
 * closed. Likewise the active location's menu items live in this store
 * so the drawer can read them without every trigger component having to
 * pass them down as props (after Step 11's single-mount move, the drawer
 * is portalled at the layout level, far above the location page that
 * sources the menu).
 *
 * Single-mount contract:
 *   - `(public)/layout.tsx` mounts <CartDrawer /> exactly once. The
 *     drawer reads `drawerOpen` + `menuItems` from this store.
 *   - <CartButton />, <FloatingCartButton />, <AbandonedCartBanner /> —
 *     and any future trigger — call setDrawerOpen(true) instead of
 *     mounting their own drawer instance.
 *   - <MenuItemsRegistrar /> (rendered by /locations/[slug]) seeds
 *     menuItems on mount so the drawer's cross-sell rail + bundle
 *     ladder + tier perk see the location's live, admin-override-aware
 *     menu — not the hardcoded `krakowMenu` / `warszawaMenu` fallback.
 */
interface CartUIStore {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  menuItems: MenuItem[];
  setMenuItems: (items: MenuItem[]) => void;
}

export const useCartUIStore = create<CartUIStore>()((set) => ({
  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  menuItems: [],
  setMenuItems: (items) => set({ menuItems: items }),
}));
