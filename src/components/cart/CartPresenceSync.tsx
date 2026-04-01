"use client";

import { useEffect, useRef } from "react";
import { useCartStore } from "@/store/cart";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { getOrCreateCartVisitorId } from "@/lib/cart-visitor-id";

const DEBOUNCE_MS = 2500;

async function postSnapshot(locationSlug: string, items: { id: string; quantity: number }[], totalCents: number) {
  if (!isCartPresenceEnabled()) return;

  const visitorId = getOrCreateCartVisitorId();
  if (!visitorId) return;

  try {
    await fetch("/api/cart/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId,
        locationSlug,
        items,
        totalCents,
      }),
      keepalive: true,
    });
  } catch {
    // ignore network errors
  }
}

/**
 * Subscribes to cart changes and sends debounced snapshots when
 * NEXT_PUBLIC_ENABLE_CART_PRESENCE allows (see cart-presence-config).
 */
export function CartPresenceSync() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isCartPresenceEnabled()) return;

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const { items, locationSlug, getTotal } = useCartStore.getState();

      if (items.length > 0 && locationSlug) {
        lastLocationRef.current = locationSlug;
      }

      if (items.length === 0 || !locationSlug) {
        const loc = lastLocationRef.current;
        if (loc) {
          void postSnapshot(loc, [], 0);
          lastLocationRef.current = null;
        }
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const s = useCartStore.getState();
        if (s.items.length === 0 || !s.locationSlug) return;
        void postSnapshot(
          s.locationSlug,
          s.items.map((i) => ({ id: i.menuItem.id, quantity: i.quantity })),
          s.getTotal()
        );
      }, DEBOUNCE_MS);
    };

    schedule();
    const unsub = useCartStore.subscribe(schedule);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsub();
    };
  }, []);

  return null;
}
