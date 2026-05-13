import { EventEmitter } from "events";

/**
 * Process-local event bus for order lifecycle events (m1_10).
 *
 * The substance of LISTEN/NOTIFY for the serverless reality:
 * - Same lambda: writes from createOrder/updateOrder/etc immediately notify
 *   any SSE connection running in the same Node process. Sub-50ms latency
 *   instead of the previous 2-second poll.
 * - Cross-lambda: each SSE connection still polls as a backstop (now at a
 *   longer interval — 10s — since the in-process path handles the fast
 *   case). The poll hits the m1_2 indexed orders table, so the cost is
 *   bounded even with many concurrent SSE clients.
 *
 * Why not real Postgres LISTEN/NOTIFY? Neon's serverless HTTP driver
 * doesn't support session-bound LISTEN; doing it via the WebSocket Client
 * would require a long-lived connection per Vercel lambda instance,
 * which isn't a thing in stateless serverless. A future move to a
 * persistent Node host (e.g. Railway, Fly) could swap this emitter for
 * real LISTEN without touching the call sites.
 */

export type OrderEvent =
  | { kind: "created"; orderId: string; locationSlug: string }
  | { kind: "updated"; orderId: string; locationSlug: string }
  | { kind: "status_changed"; orderId: string; locationSlug: string; status: string }
  | { kind: "deleted"; orderId: string; locationSlug: string };

// Single emitter per Node process — survives across requests on the same
// lambda for as long as it's warm. EventEmitter is in-memory so this is
// strictly best-effort; the polling backstop handles missed events.
const emitter = new EventEmitter();
// SSE handlers may run for tens of minutes; default 10-listener cap warns
// far too early.
emitter.setMaxListeners(0);

export function emitOrderEvent(event: OrderEvent): void {
  emitter.emit("order", event);
}

export function subscribeOrderEvents(
  handler: (event: OrderEvent) => void,
): () => void {
  emitter.on("order", handler);
  return () => emitter.off("order", handler);
}
