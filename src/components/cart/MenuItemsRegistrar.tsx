"use client";

import { useEffect } from "react";
import type { MenuItem } from "@/data/types";
import { useCartUIStore } from "@/store/cart-ui";

interface MenuItemsRegistrarProps {
  menuItems: MenuItem[];
}

/**
 * Seeds the active location's menu items into the cart UI store on mount
 * so the layout-level <CartDrawer /> can read them. Without this, the
 * drawer falls back to the hardcoded `krakowMenu` / `warszawaMenu` arrays
 * — which miss admin overrides (price changes, item-86 toggles, badges).
 *
 * Render this once on every page that has a live menu in scope; today
 * that's `/locations/[slug]/page.tsx`.
 */
export function MenuItemsRegistrar({ menuItems }: MenuItemsRegistrarProps) {
  const setMenuItems = useCartUIStore((s) => s.setMenuItems);
  useEffect(() => {
    setMenuItems(menuItems);
    return () => {
      // Clear on unmount so the next page doesn't see stale overrides.
      setMenuItems([]);
    };
  }, [menuItems, setMenuItems]);
  return null;
}
