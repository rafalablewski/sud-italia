"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Order } from "@/data/types";

const FALLBACK_POLL_MS = 15_000;
// How long an unconfirmed optimistic patch survives. Long enough to bridge the
// gap between a bump and the next stream frame/poll; short enough that a write
// that silently failed self-heals back to server truth.
const OPTIMISTIC_TTL_MS = 12_000;

type OrderPatch = Partial<Pick<Order, "status" | "paidAt">>;

// Wire frames from /api/admin/orders/stream?delta=1 (see the route + the
// local-first design doc). The REST fallback returns a plain array, which the
// hook treats as a snapshot.
type SnapFrame = { t: "snap"; orders: Order[] };
type DeltaFrame = { t: "delta"; changed: Order[]; removed: string[] };

/**
 * Subscribes to /api/admin/orders/stream (SSE, delta protocol) for the given
 * location and exposes the current orders list. The hook keeps an **id-keyed
 * client cache** as its source of truth: a `snap` frame replaces it, a `delta`
 * frame patches it (set changed / delete removed), so a busy board re-renders
 * only the tickets that actually moved. If EventSource is unavailable, the
 * stream errors, or the browser cuts it (often after backgrounding), the hook
 * falls back to plain REST polling (a full array, applied as a snapshot) so the
 * screen never stops updating.
 *
 * Pass `paused: true` to halt both the stream and the fallback poll — used by
 * the KDS pause button.
 *
 * Pass `includeSimulated: true` to opt into demo-simulator tickets. Only the
 * Kitchen Display boards do this; the Orders list, dashboard and every report
 * leave it off, so synthetic orders surface on the KDS (clearly marked) but
 * never leak into operational / reporting views.
 *
 * `patchOrder(id, patch)` applies an **optimistic overlay**: the change shows
 * instantly and is re-applied on top of every incoming frame until the server
 * echoes it (or the patch ages out). This kills the bump race where a frame
 * computed *before* the write committed would snap a just-advanced ticket back
 * to its old column for a few seconds.
 */
export function useAdminOrdersStream(
  location: string | null | undefined,
  options: { paused?: boolean; includeSimulated?: boolean } = {},
): {
  orders: Order[];
  loading: boolean;
  refresh: () => void;
  patchOrder: (id: string, patch: OrderPatch) => void;
} {
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const { paused, includeSimulated } = options;

  // id-keyed source of truth, mutated in place; `cacheVersion` bumps to force
  // the derived `orders` memo to recompute (a ref alone wouldn't re-render).
  const cache = useRef<Map<string, Order>>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);
  const bump = useCallback(() => setCacheVersion((n) => n + 1), []);

  const applySnapshot = useCallback(
    (list: Order[]) => {
      const next = new Map<string, Order>();
      for (const o of list) next.set(o.id, o);
      cache.current = next;
      bump();
    },
    [bump],
  );
  const applyDelta = useCallback(
    (changed: Order[], removed: string[]) => {
      const m = cache.current;
      for (const o of changed) m.set(o.id, o);
      for (const id of removed) m.delete(id);
      bump();
    },
    [bump],
  );

  // id → { patch, at }. A ref (not state) so incoming frames read the latest
  // overlay without re-subscribing the stream; `overlayTick` forces the derived
  // `orders` memo to recompute when the overlay changes.
  const overlay = useRef<Map<string, { patch: OrderPatch; at: number }>>(new Map());
  const [overlayTick, setOverlayTick] = useState(0);

  const patchOrder = useCallback((id: string, patch: OrderPatch) => {
    overlay.current.set(id, { patch, at: Date.now() });
    setOverlayTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (paused) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const params = new URLSearchParams();
    if (location) params.set("location", location);
    if (includeSimulated) params.set("includeSimulated", "1");
    const restQs = params.toString() ? `?${params.toString()}` : "";
    // The stream opts into the delta protocol; the REST fallback endpoint is a
    // plain list, so it doesn't take the flag.
    const streamParams = new URLSearchParams(params);
    streamParams.set("delta", "1");
    const streamQs = `?${streamParams.toString()}`;

    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/admin/orders${restQs}`);
        if (!res.ok || cancelled) return;
        const data: Order[] = await res.json();
        applySnapshot(data);
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
        source = new EventSource(`/api/admin/orders/stream${streamQs}`);
        source.onmessage = (ev) => {
          if (cancelled) return;
          try {
            const frame = JSON.parse(ev.data) as SnapFrame | DeltaFrame;
            if (frame.t === "snap") applySnapshot(frame.orders);
            else if (frame.t === "delta") applyDelta(frame.changed, frame.removed);
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
  }, [location, paused, includeSimulated, refreshTick, applySnapshot, applyDelta]);

  // Derive the sorted list from the cache, then apply the optimistic overlay on
  // top — pruning entries the server has confirmed (incoming order already
  // matches the patch) or that have aged out. Pruning here is idempotent, so a
  // StrictMode double-invoke is harmless.
  const orders = useMemo(() => {
    void cacheVersion; // recompute when the cache changes
    void overlayTick; // recompute when the overlay changes
    const list = [...cache.current.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (overlay.current.size === 0) return list;
    const now = Date.now();
    const seen = new Set<string>();
    const next = list.map((o) => {
      const entry = overlay.current.get(o.id);
      if (!entry) return o;
      seen.add(o.id);
      const confirmed = (Object.keys(entry.patch) as (keyof OrderPatch)[]).every(
        (k) => o[k] === entry.patch[k],
      );
      if (confirmed || now - entry.at > OPTIMISTIC_TTL_MS) {
        overlay.current.delete(o.id);
        return o;
      }
      return { ...o, ...entry.patch };
    });
    // Drop overlays whose order has left the list entirely (e.g. paid/cleared).
    for (const id of [...overlay.current.keys()]) {
      if (!seen.has(id)) overlay.current.delete(id);
    }
    return next;
  }, [cacheVersion, overlayTick]);

  return {
    orders,
    loading,
    refresh: () => setRefreshTick((n) => n + 1),
    patchOrder,
  };
}
