import type { Order } from "@/data/types";

/**
 * Diff of a fresh orders read against the previous frame, for the SSE delta
 * protocol (`/api/admin/orders/stream?delta=1`). Kept pure and standalone so
 * the streaming route stays a thin transport and the diff itself is unit
 * tested. See docs/strategy/core-v2-local-first.md.
 */
export interface OrderDelta {
  /** Orders that are new or whose serialized row changed since `prevSig`. */
  changed: Order[];
  /** Ids present last frame but gone now (filtered out / deleted). */
  removed: string[];
  /** The signature index to carry into the next diff (id → serialized row). */
  nextSig: Map<string, string>;
}

/**
 * Compare `orders` against the per-row signatures from the previous frame and
 * return what changed. A "signature" is the serialized row, so any field edit
 * (status bump, paidAt, totals) registers as a change while untouched rows are
 * skipped — that's what lets a busy board re-render only the tickets that moved.
 */
export function diffOrders(prevSig: Map<string, string>, orders: Order[]): OrderDelta {
  const nextSig = new Map<string, string>();
  const changed: Order[] = [];
  for (const o of orders) {
    const sig = JSON.stringify(o);
    nextSig.set(o.id, sig);
    if (prevSig.get(o.id) !== sig) changed.push(o);
  }
  const removed: string[] = [];
  for (const id of prevSig.keys()) {
    if (!nextSig.has(id)) removed.push(id);
  }
  return { changed, removed, nextSig };
}
