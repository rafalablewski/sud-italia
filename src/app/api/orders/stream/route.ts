import { NextRequest } from "next/server";
import { getOrderById } from "@/lib/store";
import { subscribeOrderEvents } from "@/lib/order-events";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * 10 s backstop poll for cross-lambda writes; the same-lambda fast path is
 * served by subscribeOrderEvents (m1_10). Matches the admin/kitchen stream
 * cadence.
 */
const BACKSTOP_POLL_MS = 10_000;
const PING_MS = 25_000;

/**
 * Customer-facing SSE feed for a single order, by id. Replaces the 10 s
 * `setInterval` poll the OrderTracker shipped with — the in-process emitter
 * pushes status changes sub-50 ms on the common (same-lambda) path, with the
 * backstop poll converging sibling-lambda writes inside 10 s.
 *
 * Same trust profile as the existing `GET /api/orders?orderId=` (public,
 * keyed on a hard-to-guess order id) — this is the streaming twin of that
 * endpoint and emits the identical payload shape.
 */
export async function GET(req: NextRequest) {
  const orderId =
    req.nextUrl.searchParams.get("orderId") ?? req.nextUrl.searchParams.get("id");
  if (!orderId) {
    return new Response("Missing orderId parameter", { status: 400 });
  }

  const encoder = new TextEncoder();
  let lastJson = "";
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendIfChanged = async () => {
        if (closed) return;
        try {
          const order = await getOrderById(orderId);
          if (!order) return;
          const payload = JSON.stringify({
            order: {
              id: order.id,
              status: order.status,
              fulfillmentType: order.fulfillmentType,
              slotTime: order.slotTime,
              slotDate: order.slotDate,
              partySize: order.partySize,
              totalAmount: order.totalAmount,
              items: order.items,
            },
          });
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
        if (event.orderId !== orderId) return;
        void sendIfChanged();
      });

      const poll = setInterval(() => void sendIfChanged(), BACKSTOP_POLL_MS);
      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* stream may be closed */
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
          /* */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
