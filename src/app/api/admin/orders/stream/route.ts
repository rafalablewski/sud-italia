import { withAdmin } from "@/lib/api-middleware";
import { getOrders } from "@/lib/store";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Prevent Vercel / nginx from buffering — SSE needs to stream as it goes.
  "X-Accel-Buffering": "no",
} as const;

const POLL_MS = 2_000;
const PING_MS = 25_000;

/**
 * Server-Sent Events feed of the admin orders list, optionally filtered by
 * location. The endpoint polls the DB on `POLL_MS` and only emits when the
 * serialized payload actually changes — so clients render on real events,
 * not on every tick. A heartbeat keeps proxies from idling the connection.
 *
 * Replaces the 2–5 s polling loops on AdminOrders and AdminKDS. Clients can
 * fall back to /api/admin/orders polling if EventSource is unavailable or
 * the stream drops.
 */
export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug: scopedLocation }) => {
    const locationSlug = scopedLocation ?? undefined;
    const encoder = new TextEncoder();

  let lastJson = "";
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendIfChanged = async () => {
        if (closed) return;
        try {
          const orders = await getOrders(locationSlug);
          // Sort newest first to match the REST endpoint's contract.
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
          // A single failed read shouldn't kill the stream; the next tick retries.
        }
      };

      await sendIfChanged();

      const poll = setInterval(() => void sendIfChanged(), POLL_MS);
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
  },
);
