"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCartStore } from "@/store/cart";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { postCartPresenceToServer } from "@/lib/cart-presence-post-client";

const DEBOUNCE_MS = 2500;
/** Empty snapshots remove the guest from the kitchen board; debounce so brief flicker / multi-tab races do not wipe presence immediately. */
const CLEAR_DEBOUNCE_MS = 3500;
const HEARTBEAT_MS = 90_000;

/**
 * Subscribes to cart changes and sends debounced snapshots when the server
 * allows cart presence (see /api/settings/public cartPresenceEnabled — avoids
 * relying only on NEXT_PUBLIC inlined at build time).
 */
export function CartPresenceSync() {
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocationRef = useRef<string | null>(null);
  const [serverAllowsPresence, setServerAllowsPresence] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/public", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { cartPresenceEnabled?: boolean }) => {
        if (cancelled) return;
        setServerAllowsPresence(data.cartPresenceEnabled === true);
      })
      .catch(() => {
        if (!cancelled) setServerAllowsPresence(isCartPresenceEnabled());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mayPost =
    serverAllowsPresence === true ||
    (serverAllowsPresence === null && isCartPresenceEnabled());

  const schedule = useCallback(() => {
    if (!mayPost) return;
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }

    const { items, locationSlug } = useCartStore.getState();

    if (items.length > 0 && locationSlug) {
      lastLocationRef.current = locationSlug;
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      snapshotTimerRef.current = setTimeout(() => {
        snapshotTimerRef.current = null;
        const s = useCartStore.getState();
        if (s.items.length === 0 || !s.locationSlug) return;
        void postCartPresenceToServer(
          s.locationSlug,
          s.items.map((i) => ({ id: i.menuItem.id, quantity: i.quantity })),
          s.getTotal()
        );
      }, DEBOUNCE_MS);
      return;
    }

    // Inconsistent local state (items but no slug): do not clear remote presence.
    if (items.length > 0 && !locationSlug) {
      return;
    }

    // Empty cart: debounce clear so a stray empty tick does not wipe Redis.
    if (items.length === 0) {
      const loc = lastLocationRef.current;
      if (!loc) return;
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        clearTimerRef.current = null;
        const s = useCartStore.getState();
        if (s.items.length > 0) return;
        void postCartPresenceToServer(loc, [], 0);
        lastLocationRef.current = null;
      }, CLEAR_DEBOUNCE_MS);
    }
  }, [mayPost]);

  useEffect(() => {
    if (!mayPost) return;

    schedule();
    const unsub = useCartStore.subscribe(schedule);
    const unsubHydration = useCartStore.persist.onFinishHydration(() => {
      schedule();
    });

    const heartbeat = setInterval(() => {
      const s = useCartStore.getState();
      if (s.items.length === 0 || !s.locationSlug) return;
      void postCartPresenceToServer(
        s.locationSlug,
        s.items.map((i) => ({ id: i.menuItem.id, quantity: i.quantity })),
        s.getTotal()
      );
    }, HEARTBEAT_MS);

    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearInterval(heartbeat);
      unsub();
      unsubHydration?.();

      // Checkout calls clearCart() then full-page navigation; debounced clear is cancelled
      // before it runs — flush empty snapshot so live carts drop as soon as the order exists.
      if (!mayPost) return;
      const s = useCartStore.getState();
      if (s.items.length > 0) return;
      const loc = lastLocationRef.current;
      if (loc) void postCartPresenceToServer(loc, [], 0);
    };
  }, [mayPost, schedule]);

  return null;
}
