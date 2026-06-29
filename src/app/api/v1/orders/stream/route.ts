import { NextRequest } from "next/server";
import { requireOperator, scopeAllows, scopedLocations } from "@/lib/api/v1/guard";
import { toOrderDTOs } from "@/lib/api/v1/order-dto";
import { getOrders, ORDERS_BOARD_LIMIT } from "@/lib/store";
import { subscribeOrderEvents } from "@/lib/order-events";
import type { Order } from "@/data/types";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "X-Ottaviano-API": "v1",
} as const;

const BACKSTOP_POLL_MS = 10_000;
const PING_MS = 25_000;

/**
 * `GET /api/v1/orders/stream` — live operator board for the OttavianoKDS app.
 *
 * The native realtime spine (ARCHITECTURE §4): the app opens this with a Bearer
 * header (URLSession can, EventSource can't — which is fine, this is a native
 * API) and reads `data: {"orders":[...]}` frames as an AsyncSequence. Same
 * hybrid path as the web admin stream — in-process events for sub-50ms updates,
 * a 10s backstop poll for cross-instance writes, a 25s ping to hold the
 * connection. Location-scoped exactly like the REST board.
 */
export async function GET(req: NextRequest) {
  const guard = requireOperator(req);
  if ("error" in guard) return guard.error;
  const { scope } = guard.claims;

  const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || null;
  if (requested && !scopeAllows(scope, requested)) {
    return new Response("Forbidden", { status: 403 });
  }
  const allowed = requested ? [requested] : scopedLocations(scope); // null = unrestricted

  const readBoard = async (): Promise<Order[]> => {
    let orders: Order[];
    if (allowed === null) {
      orders = await getOrders(undefined, undefined, { limit: ORDERS_BOARD_LIMIT });
    } else if (allowed.length === 0) {
      orders = [];
    } else {
      const lists = await Promise.all(
        allowed.map((slug) => getOrders(slug, undefined, { limit: ORDERS_BOARD_LIMIT })),
      );
      orders = lists.flat();
    }
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return orders.slice(0, ORDERS_BOARD_LIMIT);
  };

  const relevant = (locationSlug: string): boolean =>
    allowed === null || allowed.includes(locationSlug);

  const encoder = new TextEncoder();
  let lastJson = "";
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendIfChanged = async () => {
        if (closed) return;
        try {
          // Board-level mapper: the predictive block (SLA meter / at-risk tier)
          // is computed per location via analyzeTruck on each frame — so the
          // native KDS card matches the web board tick-for-tick.
          const dtos = toOrderDTOs(await readBoard());
          if (closed) return;
          const payload = JSON.stringify({ orders: dtos });
          if (payload !== lastJson) {
            lastJson = payload;
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        } catch {
          /* a single failed read shouldn't kill the stream */
        }
      };

      await sendIfChanged();

      const unsubscribe = subscribeOrderEvents((event) => {
        if (closed) return;
        if (!relevant(event.locationSlug)) return;
        void sendIfChanged();
      });
      const poll = setInterval(() => void sendIfChanged(), BACKSTOP_POLL_MS);
      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* stream may already be closed */
        }
      }, PING_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
