import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { getActiveLocations } from "@/data/locations";

export const KITCHEN_SESSION_COOKIE = "sud-italia-kitchen";
export const KITCHEN_SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (secret) {
    return secret;
  }
  console.warn(
    "SECURITY WARNING: SESSION_SECRET and ADMIN_PASSWORD are not set. Using an insecure default secret. Please set SESSION_SECRET in your environment."
  );
  return "admin123";
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createKitchenToken(locationSlug: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `kitchen:${locationSlug}:${issuedAt}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function verifyKitchenToken(token: string): { slug: string } | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = token.substring(0, lastDot);
  const signature = token.substring(lastDot + 1);

  const expected = signPayload(payload);
  if (signature.length !== expected.length) return null;

  const isValid = timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  if (!isValid) return null;

  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== "kitchen") return null;

  const slug = parts[1];
  const issuedAt = parseInt(parts[2], 10);
  if (!slug || isNaN(issuedAt)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt >= KITCHEN_SESSION_MAX_AGE) return null;

  return { slug };
}

/** Returns slug if credentials match this location's staff index (1-based among active locations). */
export function verifyKitchenCredentials(
  slug: string,
  username: string,
  password: string
): boolean {
  const active = getActiveLocations();
  const loc = active.find((l) => l.slug === slug);
  if (!loc) return false;

  if (username !== password) return false;

  const n = parseInt(username, 10);
  if (isNaN(n) || n < 1 || n > active.length) return false;

  return active[n - 1].slug === slug;
}

export async function getKitchenSession(): Promise<{ slug: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(KITCHEN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyKitchenToken(token);
}

export async function clearKitchenSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(KITCHEN_SESSION_COOKIE);
}
