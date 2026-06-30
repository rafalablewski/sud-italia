import { useCallback, useEffect, useRef, useState } from "react";
import { openSSE } from "@/api/sse";
import { useOperator } from "@/auth/OperatorSession";
import type { OrderDTO, OrderStatus } from "@/api/types";

/**
 * The operator live board feed — the realtime spine (API-V1.md). Opens the
 * Bearer-authed SSE `/orders/stream` and consumes `{ orders }` frames, with a
 * `/orders` snapshot as the initial paint + manual refresh, and an optimistic
 * `patchOrder` that pins a bumped ticket to its new status until the server echo
 * catches up (so a frame computed before the write commits can't snap it back).
 * 1:1 with the web `useAdminOrdersStream` used by the KDS + Orders board.
 */
export function useOrdersStream(opts: { paused?: boolean } = {}) {
  const { authed, accessToken } = useOperator();
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id → pinned optimistic status; cleared once the stream echoes it.
  const pins = useRef<Map<string, OrderStatus>>(new Map());

  const applyPins = useCallback((list: OrderDTO[]): OrderDTO[] => {
    if (pins.current.size === 0) return list;
    return list.map((o) => {
      const pinned = pins.current.get(o.id);
      if (!pinned) return o;
      if (o.status === pinned) {
        pins.current.delete(o.id);
        return o;
      }
      return { ...o, status: pinned };
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await authed<OrderDTO[]>("/orders");
      setOrders(applyPins(data ?? []));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders");
    }
  }, [authed, applyPins]);

  const patchOrder = useCallback(
    (id: string, patch: Partial<OrderDTO>) => {
      if (patch.status) pins.current.set(id, patch.status);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    },
    [],
  );

  // Initial snapshot.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live stream (skipped while paused). Re-opens when the access token rotates.
  useEffect(() => {
    if (opts.paused || !accessToken) return;
    const handle = openSSE<{ orders: OrderDTO[] }>({
      path: "/orders/stream",
      token: accessToken,
      onOpen: () => setConnected(true),
      onMessage: (frame) => {
        if (Array.isArray(frame.orders)) setOrders(applyPins(frame.orders));
      },
      onError: () => setConnected(false),
    });
    return () => {
      handle.close();
      setConnected(false);
    };
  }, [opts.paused, accessToken, applyPins]);

  return { orders, connected, error, refresh, patchOrder };
}
