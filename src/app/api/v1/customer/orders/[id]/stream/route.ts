import { NextRequest } from "next/server";
import { apiError } from "@/lib/api/v1/envelope";
import { requireCustomer } from "@/lib/api/v1/guard";
import { toOrderDTO } from "@/lib/api/v1/order-dto";
import { getOrderById } from "@/lib/store";
import { subscribeOrderEvents } from "@/lib/order-events";
import { phonesEqualPl } from "@/lib/phone";

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
 * `GET /api/v1/customer/orders/:id/stream` — live tracking for the customer's
 * own order (the Live Activity / order-tracker feed; APP-SHELL §5.2). Bearer
 * header auth (native URLSession), ownership-gated on the token phone. Emits
 * `data: { order }` frames on status change — the in-process emitter gives
 * sub-50ms updates, a 10s backstop catches cross-instance writes.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireCustomer(req);
  if ("error" in guard) return guard.error;
  const phone = guard.claims.sub;
  const { id } = await ctx.params;

  // Ownership is checked up front and re-checked on every emit (the phone is
  // fixed for the connection, so a 404 here is terminal).
  const initial = await getOrderById(id);
  if (!initial || !phonesEqualPl(initial.customerPhone, phone)) {
    return apiError("not_found", "Order not found");
  }

  const encoder = new TextEncoder();
  let lastJson = "";
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendIfChanged = async () => {
        if (closed) return;
        try {
          const order = await getOrderById(id);
          if (closed || !order || !phonesEqualPl(order.customerPhone, phone)) return;
          const payload = JSON.stringify({ order: toOrderDTO(order) });
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
        if (event.orderId !== id) return;
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
