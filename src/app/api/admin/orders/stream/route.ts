import { withAdmin } from "@/lib/api-middleware";
import { getOrders } from "@/lib/store";
import { subscribeOrderEvents } from "@/lib/order-events";
import { diffOrders } from "@/lib/order-delta";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Prevent Vercel / nginx from buffering — SSE needs to stream as it goes.
  "X-Accel-Buffering": "no",
} as const;

/**
 * Backstop poll cadence. The in-process emitter (m1_10) catches every order
 * event fired on the same lambda; we only fall back to polling for events
 * fired by sibling lambdas (cross-instance writes). 10 s keeps DB load
 * bounded while ensuring stale connections converge in a reasonable window.
 */
const BACKSTOP_POLL_MS = 10_000;
const PING_MS = 25_000;

/**
 * Server-Sent Events feed of the admin orders list (m1_10 hybrid path):
 *
 *   1. Initial render: read once and emit.
 *   2. Same-lambda writes: subscribeOrderEvents fires synchronously, the
 *      handler re-reads the orders list and emits if the serialized payload
 *      changed. Sub-50 ms latency for the common case.
 *   3. Cross-lambda writes: a 10 s backstop poll catches anything emitted by
 *      sibling lambdas. The read uses the m1_2 indexed orders table so the
 *      per-poll cost is one indexed range scan.
 *
 * Heartbeat (`: ping`) keeps proxies from idling the connection.
 *
 * Why not real Postgres LISTEN/NOTIFY? See src/lib/order-events.ts header —
 * Neon's serverless HTTP driver can't hold a long-lived LISTEN connection;
 * a future move to a persistent Node host can swap the emitter for real
 * LISTEN without touching this file.
 */
export const GET = withAdmin(
  { locationParam: "location" },
  async (req, _ctx, { locationSlug: scopedLocation }) => {
    const locationSlug = scopedLocation ?? undefined;
    // Opt-in via ?includeSimulated=1 — only the Kitchen Display board passes
    // it, so simulated tickets stream onto the KDS (clearly marked) while the
    // Orders list / dashboard stream stays free of demo tickets.
    const includeSimulated = req.nextUrl.searchParams.get("includeSimulated") === "1";
    // Opt-in delta protocol (?delta=1): after a first {t:"snap"} frame, emit
    // {t:"delta",changed,removed} diffs so a busy board re-renders only the
    // tickets that moved and the wire carries diffs, not the whole list every
    // frame. Without it, the legacy `data: [<array>]` contract is untouched, so
    // any other consumer is unaffected. See docs/strategy/core-v2-local-first.md.
    const wantDelta = req.nextUrl.searchParams.get("delta") === "1";
    const encoder = new TextEncoder();

    let lastJson = "";
    // Per-connection signature index for delta diffing: id → serialized row.
    let lastSig = new Map<string, string>();
    let sentSnapshot = false;
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (obj: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        const sendIfChanged = async () => {
          if (closed) return;
          try {
            const orders = await getOrders(locationSlug, undefined, { includeSimulated });
            // Sort newest first to match the REST endpoint's contract.
            orders.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );

            if (!wantDelta) {
              // Legacy full-snapshot frames.
              const payload = JSON.stringify(orders);
              if (payload !== lastJson) {
                lastJson = payload;
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
              }
              return;
            }

            // Delta path: diff this read against the last by per-row signature.
            const { changed, removed, nextSig } = diffOrders(lastSig, orders);
            lastSig = nextSig;

            if (!sentSnapshot) {
              sentSnapshot = true;
              emit({ t: "snap", orders });
            } else if (changed.length > 0 || removed.length > 0) {
              emit({ t: "delta", changed, removed });
            }
          } catch {
            // A single failed read shouldn't kill the stream; the next tick retries.
          }
        };

        await sendIfChanged();

        // Subscribe to in-process events for the fast path. The handler
        // filters by locationSlug so a Warszawa SSE doesn't re-read on a
        // Kraków order event.
        const unsubscribe = subscribeOrderEvents((event) => {
          if (closed) return;
          if (locationSlug && event.locationSlug !== locationSlug) return;
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
            /* */
          }
        };

        req.signal.addEventListener("abort", cleanup);
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  },
);
