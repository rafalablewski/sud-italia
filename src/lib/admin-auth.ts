import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSigningSecret } from "@/lib/session-secret";
import { getAdminUsers } from "@/lib/store";

export const SESSION_COOKIE = "sud-italia-admin";
export const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

/**
 * Session token format: `<userId>:<issuedAtUnix>.<hmac>`.
 *
 * Backward-compatibility: when an operator logs in with the shared password
 * but supplies no email, the token uses `userId = "admin"` and the resolver
 * falls back to the owner role (matching pre-RBAC behaviour). When an email
 * is supplied at login and matches an active row in `admin-users.json`,
 * the row's id goes into the token and `getCurrentRole()` returns the
 * row's role — that's what makes `hasRole()` actually enforce.
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

function createToken(userId: string = "admin"): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  // Replace ':' in userId defensively so it can't be confused with the
  // payload delimiter.
  const safeId = userId.replace(/:/g, "_");
  const payload = `${safeId}:${issuedAt}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

interface TokenClaims {
  userId: string;
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

  const colon = payload.lastIndexOf(":");
  if (colon === -1) return null;
  const userId = payload.substring(0, colon);
  const issuedAt = parseInt(payload.substring(colon + 1), 10);
  if (!userId || Number.isNaN(issuedAt)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt >= SESSION_MAX_AGE) return null;

  return { userId, issuedAt };
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

export function createSession(userId: string = "admin"): string {
  return createToken(userId);
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
async function getClaims(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const decoded = verifyAndDecode(token);
  return decoded ? { userId: decoded.userId } : null;
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
