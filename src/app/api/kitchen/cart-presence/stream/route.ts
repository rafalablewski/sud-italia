import { NextRequest } from "next/server";
import { getKitchenSession } from "@/lib/kitchen-auth";
import { isCartPresenceEnabled } from "@/lib/cart-presence-config";
import { getKitchenCartPresenceEntries } from "@/lib/cart-presence-kitchen";
import { subscribeCartPresence } from "@/lib/cart-presence-broadcast";
import { getUpstashRedis } from "@/lib/upstash-redis";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** Faster poll when Upstash backs presence (cross-instance); in-process notify still helps same instance. */
function pollIntervalMs(): number {
  return getUpstashRedis() ? 500 : 1000;
}
const PING_MS = 25_000;

export async function GET(req: NextRequest) {
  const session = await getKitchenSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const slug = session.slug;
  const encoder = new TextEncoder();

  if (!isCartPresenceEnabled()) {
    const payload = JSON.stringify({ enabled: false, carts: [] as unknown[] });
    const body = `data: ${payload}\n\n`;
    return new Response(encoder.encode(body), { headers: SSE_HEADERS });
  }

  let lastJson = "";
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendIfChanged = async () => {
        if (closed) return;
        try {
          const carts = await getKitchenCartPresenceEntries(slug);
          const payload = JSON.stringify({ enabled: true, carts });
          if (payload !== lastJson) {
            lastJson = payload;
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        } catch {
          /* ignore */
        }
      };

      await sendIfChanged();

      const poll = setInterval(() => void sendIfChanged(), pollIntervalMs());
      const unsub = subscribeCartPresence(slug, () => void sendIfChanged());
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
        unsub();
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
