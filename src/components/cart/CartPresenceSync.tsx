"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCartStore } from "@/store/cart";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { getOrCreateCartVisitorId } from "@/lib/cart-visitor-id";

const DEBOUNCE_MS = 2500;
/** Empty snapshots remove the guest from the kitchen board; debounce so brief flicker / multi-tab races do not wipe presence immediately. */
const CLEAR_DEBOUNCE_MS = 3500;
const HEARTBEAT_MS = 90_000;

async function postSnapshot(
  locationSlug: string,
  items: { id: string; quantity: number }[],
  totalCents: number
) {
  const visitorId = getOrCreateCartVisitorId();
  if (!visitorId) return;

  const body = JSON.stringify({
    visitorId,
    locationSlug,
    items,
    totalCents,
  });

  const send = () =>
    fetch("/api/cart/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });

  try {
    let res = await send();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await send();
    }
  } catch {
    // ignore network errors
  }
}

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
        void postSnapshot(
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
        void postSnapshot(loc, [], 0);
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
      void postSnapshot(
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
    };
  }, [mayPost, schedule]);

  return null;
}
