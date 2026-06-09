import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSigningSecret } from "@/lib/session-secret";

/**
 * WebAuthn (passkey / hardware security key) plumbing shared by the
 * registration route (authenticated) and the authentication route (pre-session).
 *
 * Two things are environment-sensitive and MUST line up with the browser:
 *  - rpID:   the effective domain (no scheme, no port). The browser refuses a
 *            credential whose rpID isn't a registrable suffix of the page origin.
 *  - origin: scheme + host the user is actually on.
 *
 * We derive both from the request host by default, with WEBAUTHN_RP_ID /
 * WEBAUTHN_ORIGIN env overrides for deployments behind a proxy where the
 * forwarded host can't be trusted. The login challenge (no session yet) rides
 * a short-lived signed httpOnly cookie; the enrollment challenge is stored on
 * the already-authenticated user row.
 */

export const WEBAUTHN_RP_NAME = "Ottaviano";
const CHALLENGE_COOKIE = "sud-italia-webauthn-chal";
const CHALLENGE_MAX_AGE = 300; // 5 minutes — long enough to tap a key, short enough to be safe.

export interface RpConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export function getRpConfig(req: NextRequest): RpConfig {
  const envRpId = process.env.WEBAUTHN_RP_ID?.trim();
  const envOrigin = process.env.WEBAUTHN_ORIGIN?.trim();
  if (envRpId && envOrigin) {
    return { rpID: envRpId, rpName: WEBAUTHN_RP_NAME, origin: envOrigin };
  }

  // Derive from the request. host includes the port for localhost dev.
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const origin = envOrigin || `${proto}://${host}`;
  // Let the URL parser strip the port — it handles IPv6 literals like
  // `[::1]:3000` that a naive split(":") would mangle. Fall back to the bare
  // split if the host header is somehow unparseable.
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    hostname = host.split(":")[0];
  }
  return {
    rpID: envRpId || hostname,
    rpName: WEBAUTHN_RP_NAME,
    origin,
  };
}

// --- Login-challenge cookie (signed, httpOnly, short-lived) ----------------

function sign(payload: string): string {
  return createHmac("sha256", getSessionSigningSecret()).update(payload).digest("hex");
}

/** Packs `challenge|email|issuedAt` with an HMAC so it can't be tampered with. */
export function setLoginChallengeCookie(
  res: NextResponse,
  challenge: string,
  email: string,
): void {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${challenge}:${email.toLowerCase()}:${issuedAt}`;
  const token = `${payload}.${sign(payload)}`;
  res.cookies.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CHALLENGE_MAX_AGE,
    path: "/",
  });
}

/**
 * Returns the challenge bound to `email` from the cookie, or null when missing,
 * tampered, expired, or for a different email. The caller clears the cookie
 * after a verify attempt regardless of outcome.
 */
export function readLoginChallengeCookie(
  req: NextRequest,
  email: string,
): string | null {
  const token = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
    return null;
  }
  // payload = challenge:email:issuedAt — challenge is base64url (no colon).
  const parts = payload.split(":");
  if (parts.length !== 3) return null;
  const [challenge, boundEmail, issuedAtStr] = parts;
  const issuedAt = Number.parseInt(issuedAtStr, 10);
  if (Number.isNaN(issuedAt)) return null;
  if (Math.floor(Date.now() / 1000) - issuedAt >= CHALLENGE_MAX_AGE) return null;
  if (boundEmail !== email.toLowerCase()) return null;
  return challenge;
}

export function clearLoginChallengeCookie(res: NextResponse): void {
  res.cookies.delete(CHALLENGE_COOKIE);
}
