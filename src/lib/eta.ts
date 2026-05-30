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

/** Expo handoff + plating buffer not captured in per-item prep_time (minutes). */
export const EXPO_BUFFER_MINUTES = 3;
/** Hard floor so a fast-prep order never promises something the line can't hit. */
export const MIN_PREP_MINUTES = 10;

/**
 * Minutes from fire/order time until an order is promised ready, for orders
 * without a customer-picked scheduled slot. Mirrors `computePromisedReadyAt`
 * in `store.ts`: the longest single-item prep across the order, plus an expo
 * buffer, floored at {@link MIN_PREP_MINUTES}. Quantity does not extend the
 * estimate — multiple pizzas fire in parallel across the line.
 */
export function estimatePrepMinutes(items: EtaItemLike[]): number {
  const maxPrep = items.reduce(
    (m, i) => Math.max(m, i.menuItem.prepTimeMinutes ?? 0),
    0,
  );
  return Math.max(MIN_PREP_MINUTES, maxPrep + EXPO_BUFFER_MINUTES);
}

/**
 * Promised-ready instant for an as-yet-unplaced order with no scheduled slot.
 * `from` defaults to now so the cart can quote "Ready by ~HH:MM" live.
 */
export function estimateReadyAt(items: EtaItemLike[], from: Date = new Date()): Date {
  return new Date(from.getTime() + estimatePrepMinutes(items) * 60_000);
}
