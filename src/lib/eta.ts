/**
 * Single source of truth for "when will this order be ready" math, shared by
 * the server (KDS SLA / promised-ready) and the client (pre-pay ETA quote in
 * the cart). Keeping the formula in one client-safe module means the time we
 * quote a customer *before* they pay is exactly the promise the kitchen is
 * held to on the KDS countdown — no drift between the two surfaces.
 *
 * This file must stay free of server-only imports (no `fs`, no
 * `@neondatabase/serverless`, no `next/headers`) so it can be imported from
 * `"use client"` components.
 */

/** Minimal line shape needed to estimate prep — fits both cart lines and order items. */
export interface EtaItemLike {
  menuItem: { prepTimeMinutes?: number };
}

/** Default expo handoff + plating buffer not captured in per-item prep_time. */
export const EXPO_BUFFER_MINUTES = 3;
/** Default hard floor so a fast-prep order never promises something the line can't hit. */
export const MIN_PREP_MINUTES = 10;

/** Operator-set prep SLA overrides (admin → Operations). Both optional; each
 *  falls back to the constant default. Passed in by callers that have the
 *  settings (server: fireKdsTickets; client: the cart, from public settings) —
 *  this module stays server-import-free, so it can't read the store itself. */
export interface PrepOpts {
  minPrepMinutes?: number;
  expoBufferMinutes?: number;
}

/**
 * Minutes from fire/order time until an order is promised ready, for orders
 * without a customer-picked scheduled slot: the longest single-item prep across
 * the order, plus an expo buffer, floored at the minimum-prep SLA. Quantity does
 * not extend the estimate — multiple pizzas fire in parallel across the line.
 */
export function estimatePrepMinutes(items: EtaItemLike[], opts: PrepOpts = {}): number {
  const minPrep = opts.minPrepMinutes ?? MIN_PREP_MINUTES;
  const expoBuffer = opts.expoBufferMinutes ?? EXPO_BUFFER_MINUTES;
  const maxPrep = items.reduce(
    (m, i) => Math.max(m, i.menuItem.prepTimeMinutes ?? 0),
    0,
  );
  return Math.max(minPrep, maxPrep + expoBuffer);
}

/**
 * Promised-ready instant for an as-yet-unplaced order with no scheduled slot.
 * `from` defaults to now so the cart can quote "Ready by ~HH:MM" live.
 */
export function estimateReadyAt(items: EtaItemLike[], from: Date = new Date(), opts: PrepOpts = {}): Date {
  return new Date(from.getTime() + estimatePrepMinutes(items, opts) * 60_000);
}
