"use client";

import { useEffect, useState } from "react";

interface AvailabilityResponse {
  locationSlug: string;
  availability: Record<string, boolean>;
}

/**
 * Polls /api/menu/availability for the current location's item-availability
 * map and returns it as `{ [itemId]: boolean }`. Items not present in the map
 * (e.g. server fetch in progress) fall through to the caller's default — pass
 * `defaults` from the initial SSR snapshot so the first paint is correct.
 *
 * Polling is 10s while the tab is visible, paused while hidden, and the first
 * fetch fires immediately so admin 86 actions take effect within ~10s for any
 * customer currently browsing.
 */
export function useLiveMenuAvailability(
  locationSlug: string,
  defaults: Record<string, boolean>,
): Record<string, boolean> {
  const [available, setAvailable] = useState<Record<string, boolean>>(defaults);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/menu/availability?location=${encodeURIComponent(locationSlug)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data: AvailabilityResponse = await res.json();
        if (cancelled) return;
        setAvailable((prev) => {
          // Avoid re-renders when nothing changed.
          let differs = false;
          for (const id of Object.keys(data.availability)) {
            if (prev[id] !== data.availability[id]) {
              differs = true;
              break;
            }
          }
          return differs ? data.availability : prev;
        });
      } catch {
        // Network blips — try again on the next tick.
      } finally {
        if (!cancelled && !document.hidden) {
          timer = setTimeout(tick, 10_000);
        }
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else if (!timer) {
        tick();
      }
    };

    tick();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [locationSlug]);

  return available;
}
