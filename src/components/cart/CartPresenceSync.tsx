"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCartStore } from "@/store/cart";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { getOrCreateCartVisitorId } from "@/lib/cart-visitor-id";

const DEBOUNCE_MS = 2500;
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (timerRef.current) clearTimeout(timerRef.current);

    const { items, locationSlug } = useCartStore.getState();

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
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(heartbeat);
      unsub();
      unsubHydration?.();
    };
  }, [mayPost, schedule]);

  return null;
}
