import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSigningSecret } from "@/lib/session-secret";
import { getAdminUsers } from "@/lib/store";

export const SESSION_COOKIE = "sud-italia-admin";
export const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

/**
 * Session token format (m0_5+): `<userId>:<locationScope>:<issuedAtUnix>.<hmac>`
 *
 * locationScope is either `"*"` (full access — owners, legacy sessions) or a
 * comma-separated list of allowed location slugs (e.g. `"krakow"` or
 * `"krakow,warszawa"`). It's bound into the HMAC payload so a holder can't
 * widen their scope by editing the cookie.
 *
 * Backward-compatibility: pre-m0_5 tokens are 2-part (`userId:issuedAt.hmac`)
 * and verifyAndDecode still parses them with locationScope defaulting to "*".
 * Existing sessions keep working until they expire and the user re-logs.
 *
 * Tenant enforcement: requireLocationAccess (m0_6) consumes the scope; admin
 * API routes call it via withAdmin (m0_8) so a Kraków staff user cannot
 * fetch Warszawa orders by tweaking a query param.
 *
 * Backward-compatibility (pre-RBAC): when an operator logs in with the
 * shared password but supplies no email, the token uses `userId = "admin"`
 * and the resolver falls back to the owner role with scope "*", matching
 * pre-RBAC behaviour.
 *
 * Why not magic-link? Email delivery infrastructure isn't wired yet
 * (Resend / SMTP / etc.) so we keep the shared-password gate but extend
 * the cookie to carry identity. A future PR can swap the password step
 * for a magic-link without changing this token format.
 */

function getSecret(): string {
  return getSessionSigningSecret();
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/** Sentinel for owner / unrestricted sessions. */
export const LOCATION_SCOPE_ALL = "*";

function sanitizeIdComponent(value: string): string {
  // `:` is the payload delimiter; replace defensively so a malicious id can't
  // smuggle extra fields into the token. The leading `_` is just a visible
  // marker so accidentally-sanitized ids are obvious in logs.
  return value.replace(/:/g, "_");
}

function sanitizeLocationScope(scope: string | undefined | null): string {
  if (!scope) return LOCATION_SCOPE_ALL;
  const trimmed = scope.trim();
  if (!trimmed) return LOCATION_SCOPE_ALL;
  if (trimmed === LOCATION_SCOPE_ALL) return LOCATION_SCOPE_ALL;
  // Allow lowercase a-z, 0-9, hyphens, and commas (for multi-loc users in
  // Phase 3). Anything else gets dropped so a hand-rolled token can't sneak
  // a wildcard or path traversal into the scope.
  return trimmed
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]+$/.test(s))
    .join(",") || LOCATION_SCOPE_ALL;
}

function createToken(
  userId: string = "admin",
  locationScope: string = LOCATION_SCOPE_ALL,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const safeId = sanitizeIdComponent(userId);
  const safeScope = sanitizeLocationScope(locationScope);
  const payload = `${safeId}:${safeScope}:${issuedAt}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

interface TokenClaims {
  userId: string;
  locationScope: string;
  issuedAt: number;
}

function verifyAndDecode(token: string): TokenClaims | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = token.substring(0, lastDot);
  const signature = token.substring(lastDot + 1);

  const expected = signPayload(payload);
  if (signature.length !== expected.length) return null;

  const isValid = timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
  if (!isValid) return null;

  // New format: userId:locationScope:issuedAt.  Legacy (pre-m0_5):
  // userId:issuedAt — accept it, default scope to "*". userId is sanitized
  // to strip `:`, so a 2-part split is unambiguous.
  const parts = payload.split(":");
  let userId: string;
  let locationScope: string;
  let issuedAt: number;
  if (parts.length === 3) {
    userId = parts[0];
    locationScope = parts[1];
    issuedAt = parseInt(parts[2], 10);
  } else if (parts.length === 2) {
    userId = parts[0];
    locationScope = LOCATION_SCOPE_ALL;
    issuedAt = parseInt(parts[1], 10);
  } else {
    return null;
  }
  if (!userId || !locationScope || Number.isNaN(issuedAt)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt >= SESSION_MAX_AGE) return null;

  return { userId, locationScope, issuedAt };
}

function verifyToken(token: string): boolean {
  return verifyAndDecode(token) !== null;
}

export function getAdminPassword(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (p && p.length > 0) return p;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASSWORD must be set in production.");
  }
  console.warn("ADMIN_PASSWORD not set; using local dev default. Set ADMIN_PASSWORD before deploying.");
  return "admin123";
}

export function verifyPassword(password: string): boolean {
  return password === getAdminPassword();
}

export function createSession(
  userId: string = "admin",
  locationScope: string = LOCATION_SCOPE_ALL,
): string {
  return createToken(userId, locationScope);
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifyToken(token);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export type AdminRole = "owner" | "manager" | "staff" | "kitchen";

const ROLE_RANK: Record<AdminRole, number> = {
  owner: 100,
  manager: 50,
  staff: 20,
  kitchen: 10,
};

/**
 * Reads the userId from the signed cookie and resolves to the current
 * admin user (or `null` when no session, or `"admin"` when the legacy
 * password-only login was used without an email — that path returns
 * an inline owner shim).
 */
async function getClaims(): Promise<{
  userId: string;
  locationScope: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const decoded = verifyAndDecode(token);
  return decoded
    ? { userId: decoded.userId, locationScope: decoded.locationScope }
    : null;
}

/**
 * Returns the parsed location scope from the current session. `["*"]` means
 * no restriction (owners, legacy sessions); otherwise a list of allowed
 * location slugs. Returns `null` when there is no session.
 *
 * Consumers should prefer hasLocationAccess() / requireLocationAccess() —
 * this is the lower-level read for telemetry and rare custom checks.
 */
export async function getCurrentLocationScope(): Promise<string[] | null> {
  const claims = await getClaims();
  if (!claims) return null;
  if (claims.locationScope === LOCATION_SCOPE_ALL) return [LOCATION_SCOPE_ALL];
  return claims.locationScope.split(",").filter(Boolean);
}

/**
 * True when the current session is authorized for `locationSlug`. Wildcard
 * scope ("*") passes for any slug; otherwise the slug must be present in the
 * comma-separated list. Returns false when there's no session.
 */
export async function hasLocationAccess(locationSlug: string): Promise<boolean> {
  const scope = await getCurrentLocationScope();
  if (!scope) return false;
  if (scope.includes(LOCATION_SCOPE_ALL)) return true;
  return scope.includes(locationSlug);
}

/** Hydrates the AdminUser row that owns the current session. */
export async function getCurrentAdminUser(): Promise<
  { id: string; name: string; email?: string; role: AdminRole } | null
> {
  const claims = await getClaims();
  if (!claims) return null;
  if (claims.userId === "admin") {
    // Legacy session — no per-user binding. Behave like the previous code
    // (everyone is owner) so existing deployments don't lose access on
    // upgrade.
    return { id: "admin", name: "Admin (shared)", role: "owner" };
  }
  const users = await getAdminUsers();
  const hit = users.find((u) => u.id === claims.userId);
  if (!hit || hit.status !== "active") return null;
  return { id: hit.id, name: hit.name, email: hit.email, role: hit.role };
}

export async function getCurrentRole(): Promise<AdminRole | null> {
  const u = await getCurrentAdminUser();
  return u?.role ?? null;
}

/**
 * String suitable for the `actor` field of an audit log entry: the user's
 * email when bound, the legacy "admin" tag for shared-password sessions,
 * or "system" when no session is active. Always returns a value so callers
 * don't have to special-case the unauthenticated path (they shouldn't be
 * writing audits without auth anyway).
 */
export async function getCurrentActor(): Promise<string> {
  const u = await getCurrentAdminUser();
  if (!u) return "system";
  return u.email || u.id;
}

/**
 * Returns true when the current session has at least one of the allowed
 * roles. Routes that need a role gate should call this AND `isAuthenticated`.
 */
export async function hasRole(allowed: AdminRole[]): Promise<boolean> {
  const role = await getCurrentRole();
  if (!role) return false;
  const minRank = Math.min(...allowed.map((r) => ROLE_RANK[r]));
  return ROLE_RANK[role] >= minRank;
}

/**
 * Convenience for API routes: returns null on success, a 401/403 NextResponse
 * on failure. Drop in at the top of any handler that needs role enforcement.
 */
export async function requireRole(
  allowed: AdminRole[],
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentAdminUser>>> } | { error: Response }> {
  const user = await getCurrentAdminUser();
  if (!user) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  const minRank = Math.min(...allowed.map((r) => ROLE_RANK[r]));
  if (ROLE_RANK[user.role] < minRank) {
    return {
      error: new Response(JSON.stringify({ error: `Requires role ${allowed.join("|")}` }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { user };
}

/**
 * Companion to `requireRole`: ensures the current session is authorized to
 * touch `locationSlug`. Returns `{ ok: true }` on success or a 401/403
 * NextResponse on failure — drop at the top of any /api/admin/* handler that
 * reads or writes a single-location entity.
 *
 * Wildcard scope ("*") passes unconditionally; otherwise the slug must be in
 * the session's comma-separated list. Pass `null`/undefined for routes that
 * intentionally span all locations (e.g. HQ rollups) — those still require
 * the caller to hold "*" scope.
 *
 * The middleware in m0_8 calls this for every admin route automatically.
 * Hand-call only when a single route legitimately needs cross-location
 * access enforced by some other rule.
 */
export async function requireLocationAccess(
  locationSlug: string | null | undefined,
): Promise<{ ok: true } | { error: Response }> {
  const claims = await getClaims();
  if (!claims) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  const scopes =
    claims.locationScope === LOCATION_SCOPE_ALL
      ? [LOCATION_SCOPE_ALL]
      : claims.locationScope.split(",").filter(Boolean);
  if (scopes.includes(LOCATION_SCOPE_ALL)) return { ok: true };
  if (!locationSlug) {
    // Caller asked for a cross-location operation but session is scoped down.
    return {
      error: new Response(
        JSON.stringify({ error: "Requires unrestricted location scope" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  if (!scopes.includes(locationSlug)) {
    return {
      error: new Response(
        JSON.stringify({
          error: `Session is not authorized for location "${locationSlug}"`,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  return { ok: true };
}
