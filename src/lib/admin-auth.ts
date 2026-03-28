import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";

const SESSION_COOKIE = "sud-italia-admin";
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// In-memory session store (resets on server restart — fine for single-instance)
const sessions = new Set<string>();

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "admin123";
}

export function verifyPassword(password: string): boolean {
  return password === getAdminPassword();
}

export function createSession(): string {
  const token = randomBytes(32).toString("hex");
  sessions.add(hashToken(token));
  return token;
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
  return sessions.has(hashToken(token));
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    sessions.delete(hashToken(token));
  }
  cookieStore.delete(SESSION_COOKIE);
}
