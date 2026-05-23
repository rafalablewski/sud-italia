"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/data/types";

const FALLBACK_POLL_MS = 15_000;

/**
 * Subscribes to /api/admin/orders/stream (SSE) for the given location and
 * exposes the current orders list. If EventSource is unavailable, the stream
 * errors, or the browser cuts it (often after backgrounding), the hook falls
 * back to plain REST polling so the screen never stops updating.
 *
 * Pass `paused: true` to halt both the stream and the fallback poll — used by
 * the KDS pause button.
 *
 * Simulated demo tickets never reach this hook: getOrders() filters them out
 * of every read, so the live KDS board, Orders list and dashboard only ever
 * see real orders. Synthetic tickets live solely in the KDS-simulator tab.
 */
export function useAdminOrdersStream(
  location: string | null | undefined,
  options: { paused?: boolean } = {},
): { orders: Order[]; loading: boolean; refresh: () => void } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const { paused } = options;

  useEffect(() => {
    if (paused) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const qs = location ? `?location=${encodeURIComponent(location)}` : "";

    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/admin/orders${qs}`);
        if (!res.ok || cancelled) return;
        const data: Order[] = await res.json();
        // Match the SSE endpoint's sort (newest first) so REST + stream
        // produce identical state.
        data.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setOrders(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const startFallbackPoll = () => {
      if (pollTimer) return;
      void fetchOnce();
      pollTimer = setInterval(() => void fetchOnce(), FALLBACK_POLL_MS);
    };

    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        source = new EventSource(`/api/admin/orders/stream${qs}`);
        source.onmessage = (ev) => {
          if (cancelled) return;
          try {
            const data: Order[] = JSON.parse(ev.data);
            setOrders(data);
            setLoading(false);
          } catch {
            /* ignore malformed frame */
          }
        };
        source.onerror = () => {
          // Browser closed the stream (proxy timeout, sleep, etc). Drop to
          // REST polling rather than letting the screen freeze.
          source?.close();
          source = null;
          startFallbackPoll();
        };
      } catch {
        startFallbackPoll();
      }
    } else {
      startFallbackPoll();
    }

    // Always do a first REST fetch so initial paint doesn't wait on the
    // stream's first frame.
    void fetchOnce();

    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [location, paused, refreshTick]);

  return {
    orders,
    loading,
    refresh: () => setRefreshTick((n) => n + 1),
  };
}
