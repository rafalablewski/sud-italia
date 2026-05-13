import { NextRequest } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { getOrders } from "@/lib/store";
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
 * served by subscribeOrderEvents (m1_10). Matches /api/admin/orders/stream
 * cadence so the kitchen sees parity with the admin board.
 */
const BACKSTOP_POLL_MS = 10_000;
const PING_MS = 25_000;

/**
 * SSE feed of orders for a kitchen station (m1_11 hybrid path). Same
 * pattern as the admin orders stream: subscribeOrderEvents catches every
 * same-lambda write immediately, the backstop poll converges sibling-lambda
 * writes inside 10 s. Reads use the m1_2 indexed orders table.
 *
 * Authenticated by the kitchen session cookie (per-location password from
 * KITCHEN_PASSWORDS env). The session's slug is the only scope — kitchen
 * sees only its own location's orders, never another truck's.
 */
export async function GET(req: NextRequest) {
  const session = await getKitchenSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const slug = session.slug;
  const encoder = new TextEncoder();

  let lastJson = "";
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendIfChanged = async () => {
        if (closed) return;
        try {
          const orders = await getOrders(slug);
          orders.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          const payload = JSON.stringify(orders);
          if (payload !== lastJson) {
            lastJson = payload;
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        } catch {
          /* single failed read shouldn't kill the stream */
        }
      };

      await sendIfChanged();

      // Same-lambda writes fire here immediately. Cross-lambda writes are
      // picked up by the backstop poll below.
      const unsubscribe = subscribeOrderEvents((event) => {
        if (closed) return;
        if (event.locationSlug && event.locationSlug !== slug) return;
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
