/**
 * Live cart presence for the kitchen board (anonymous snapshots, TTL’d in KV).
 *
 * - Set NEXT_PUBLIC_ENABLE_CART_PRESENCE=true on Vercel to enable in production.
 * - In development, presence is on unless NEXT_PUBLIC_ENABLE_CART_PRESENCE=false.
 */
export function isCartPresenceEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_ENABLE_CART_PRESENCE;
  if (v === "false") return false;
  if (v === "true") return true;
  return process.env.NODE_ENV === "development";
}
