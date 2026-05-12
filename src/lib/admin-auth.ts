import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSigningSecret } from "@/lib/session-secret";

export const SESSION_COOKIE = "sud-italia-admin";
export const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

function getSecret(): string {
  return getSessionSigningSecret();
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function createToken(): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `admin:${issuedAt}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function verifyToken(token: string): boolean {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return false;

  const payload = token.substring(0, lastDot);
  const signature = token.substring(lastDot + 1);

  const expected = signPayload(payload);
  if (signature.length !== expected.length) return false;

  const isValid = timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
  if (!isValid) return false;

  // Check expiration
  const parts = payload.split(":");
  const issuedAt = parseInt(parts[1], 10);
  if (isNaN(issuedAt)) return false;

  const now = Math.floor(Date.now() / 1000);
  return now - issuedAt < SESSION_MAX_AGE;
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

export function createSession(): string {
  return createToken();
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

/**
 * Role helpers (phase 24). The current cookie-based session only knows
 * "is the user the admin or not" — there's no per-user identity yet, so every
 * authenticated request is treated as having the "owner" role. The
 * /admin/users page can record planned per-user roles, and future work can
 * bind cookies to specific user ids without changing the API surface here.
 */
export type AdminRole = "owner" | "manager" | "staff" | "kitchen";

const ROLE_RANK: Record<AdminRole, number> = {
  owner: 100,
  manager: 50,
  staff: 20,
  kitchen: 10,
};

export async function getCurrentRole(): Promise<AdminRole | null> {
  return (await isAuthenticated()) ? "owner" : null;
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
