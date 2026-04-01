/**
 * HMAC signing secret for admin + kitchen session cookies.
 * In production, SESSION_SECRET or ADMIN_PASSWORD must be set (no insecure default).
 */
export function getSessionSigningSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET or ADMIN_PASSWORD must be set in production.");
  }
  console.warn(
    "SESSION_SECRET and ADMIN_PASSWORD are not set. Using a local-only default; set SESSION_SECRET before deploying."
  );
  return "local-dev-only-insecure-session-secret";
}
