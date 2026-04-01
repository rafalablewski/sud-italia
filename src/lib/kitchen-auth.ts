import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSigningSecret } from "@/lib/session-secret";
import { getActiveLocations } from "@/data/locations";

export const KITCHEN_SESSION_COOKIE = "sud-italia-kitchen";
export const KITCHEN_SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

function getSecret(): string {
  return getSessionSigningSecret();
}

let kitchenPasswordsCache: Record<string, string> | null | undefined;

/**
 * Per-location passwords from env JSON, e.g.
 * KITCHEN_PASSWORDS={"krakow":"secret-one","warszawa":"secret-two"}
 */
function kitchenPasswordMap(): Record<string, string> | null {
  if (kitchenPasswordsCache !== undefined) return kitchenPasswordsCache;
  const raw = process.env.KITCHEN_PASSWORDS?.trim();
  if (!raw) {
    kitchenPasswordsCache = null;
    return null;
  }
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") {
      kitchenPasswordsCache = null;
      return null;
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    kitchenPasswordsCache = Object.keys(out).length > 0 ? out : null;
  } catch {
    kitchenPasswordsCache = null;
  }
  return kitchenPasswordsCache;
}

const PASSWORD_COMPARE_PEPPER = "sud-italia-kitchen-pw-v1";

function passwordMatches(expected: string, provided: string): boolean {
  const digest = (s: string) =>
    createHmac("sha256", PASSWORD_COMPARE_PEPPER).update(s, "utf8").digest();
  const a = digest(expected);
  const b = digest(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Validates staff login for a location. Password must match KITCHEN_PASSWORDS[slug].
 * Username must be non-empty (display / audit only).
 */
export function verifyKitchenCredentials(
  slug: string,
  username: string,
  password: string
): boolean {
  const loc = getActiveLocations().find((l) => l.slug === slug);
  if (!loc) return false;
  if (username.trim().length === 0 || password.length === 0) return false;

  const expected = kitchenPasswordMap()?.[slug];
  if (!expected) return false;

  return passwordMatches(expected, password);
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
