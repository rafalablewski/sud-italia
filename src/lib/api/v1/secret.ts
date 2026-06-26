import { getSessionSigningSecret } from "@/lib/session-secret";

/**
 * Signing secret for `/api/v1` access-token JWTs.
 *
 * Prefers a dedicated `API_JWT_SECRET` so the native token signer can be rotated
 * independently of the web cookie secret; falls back to the existing session
 * signing secret so the facade works in demo/local with zero extra config.
 *
 * Host-portability (Vercel exit, ARCHITECTURE §2.1): this reads a plain env var,
 * not any Vercel-specific secret store — it moves with the app to any host.
 */
export function getApiJwtSecret(): string {
  const dedicated = process.env.API_JWT_SECRET?.trim();
  if (dedicated && dedicated.length > 0) return dedicated;
  return getSessionSigningSecret();
}
