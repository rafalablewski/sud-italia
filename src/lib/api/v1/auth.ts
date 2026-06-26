import { randomBytes, createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { getApiJwtSecret } from "./secret";
import { signAccessToken, verifyAccessToken, type JwtClaims } from "./jwt";
import {
  addApiRefreshToken,
  getApiRefreshToken,
  rotateApiRefreshToken,
  revokeApiRefreshToken,
  revokeApiRefreshTokenFamily,
  type ApiRefreshToken,
} from "@/lib/store";

/**
 * Token lifecycle for the native `/api/v1` facade.
 *
 *   access token   — stateless HS256 JWT, 15 min, verified on every call
 *   refresh token  — opaque `<id>.<secret>`, 30 days, server-stored (revocable),
 *                    ROTATED on every use with reuse/theft detection
 *
 * The app keeps the access token in memory and the refresh token in the
 * Keychain; on a 401 it silently rotates. This mirrors the design in
 * docs/native/ARCHITECTURE.md §2.
 */

export type AppAudience = "ottaviano" | "ottaviano-kds";

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export interface IdentityForToken {
  userId: string;
  scope: string;
  role: string;
  name?: string;
  email?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (client schedules refresh). */
  expiresIn: number;
  refreshExpiresIn: number;
  tokenType: "Bearer";
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function newId(bytes = 9): string {
  return randomBytes(bytes).toString("base64url");
}

function buildAccess(identity: IdentityForToken, aud: AppAudience): string {
  return signAccessToken(
    {
      sub: identity.userId,
      aud,
      scope: identity.scope,
      role: identity.role,
      name: identity.name,
      email: identity.email,
    },
    getApiJwtSecret(),
    ACCESS_TTL_SEC,
  );
}

async function mintRefresh(
  identity: IdentityForToken,
  aud: AppAudience,
  family: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const id = newId();
  const secret = randomBytes(32).toString("base64url");
  const record: ApiRefreshToken = {
    id,
    tokenHash: sha256(secret),
    userId: identity.userId,
    scope: identity.scope,
    aud,
    family,
    issuedAt: now,
    expiresAt: now + REFRESH_TTL_SEC,
  };
  await addApiRefreshToken(record);
  return `${id}.${secret}`;
}

/** First issue at login — starts a new rotation family. */
export async function issueTokenPair(
  identity: IdentityForToken,
  aud: AppAudience,
): Promise<TokenPair> {
  const family = newId(12);
  const refreshToken = await mintRefresh(identity, aud, family);
  return {
    accessToken: buildAccess(identity, aud),
    refreshToken,
    expiresIn: ACCESS_TTL_SEC,
    refreshExpiresIn: REFRESH_TTL_SEC,
    tokenType: "Bearer",
  };
}

export type RefreshError = "malformed" | "unknown" | "expired" | "reuse" | "revoked";

export type RefreshResult =
  | { ok: true; pair: TokenPair }
  | { ok: false; reason: RefreshError };

/**
 * Rotate a presented refresh token into a fresh pair.
 *
 * Reuse detection: a token that exists but is already revoked means someone is
 * replaying a spent token — we kill the entire family so a thief and the
 * legitimate holder are both logged out (the holder simply re-logs in).
 */
export async function rotateTokens(
  presented: string,
  resolveIdentity: (rec: ApiRefreshToken) => Promise<IdentityForToken | null>,
): Promise<RefreshResult> {
  const dot = presented.indexOf(".");
  if (dot < 1) return { ok: false, reason: "malformed" };
  const id = presented.slice(0, dot);
  const secret = presented.slice(dot + 1);

  const rec = await getApiRefreshToken(id);
  if (!rec) return { ok: false, reason: "unknown" };

  // Constant-time secret check.
  const presentedHash = sha256(secret);
  if (
    presentedHash.length !== rec.tokenHash.length ||
    !timingSafeEqual(Buffer.from(presentedHash), Buffer.from(rec.tokenHash))
  ) {
    return { ok: false, reason: "unknown" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (rec.revokedAt) {
    // Spent token replayed → theft signal. Burn the family.
    await revokeApiRefreshTokenFamily(rec.family);
    return { ok: false, reason: "reuse" };
  }
  if (rec.expiresAt <= now) return { ok: false, reason: "expired" };

  const identity = await resolveIdentity(rec);
  if (!identity) {
    // Account disabled/deleted since issue — revoke and refuse.
    await revokeApiRefreshToken(rec.id);
    return { ok: false, reason: "revoked" };
  }

  const newSecret = randomBytes(32).toString("base64url");
  const newRecordId = newId();
  const replacement: ApiRefreshToken = {
    id: newRecordId,
    tokenHash: sha256(newSecret),
    userId: identity.userId,
    scope: identity.scope,
    aud: rec.aud,
    family: rec.family,
    issuedAt: now,
    expiresAt: now + REFRESH_TTL_SEC,
  };
  const rotated = await rotateApiRefreshToken(rec.id, replacement);
  if (!rotated) {
    // Lost a race — another rotation revoked it first. Treat as reuse.
    await revokeApiRefreshTokenFamily(rec.family);
    return { ok: false, reason: "reuse" };
  }

  return {
    ok: true,
    pair: {
      accessToken: buildAccess(identity, rec.aud),
      refreshToken: `${newRecordId}.${newSecret}`,
      expiresIn: ACCESS_TTL_SEC,
      refreshExpiresIn: REFRESH_TTL_SEC,
      tokenType: "Bearer",
    },
  };
}

/** Logout — revoke the presented refresh token (best-effort; always 204-safe). */
export async function revokePresentedRefresh(presented: string): Promise<void> {
  const dot = presented.indexOf(".");
  if (dot < 1) return;
  await revokeApiRefreshToken(presented.slice(0, dot));
}

/** Read + verify the Bearer access token on a request. Returns claims or null. */
export function authenticateBearer(req: NextRequest): JwtClaims | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  const result = verifyAccessToken(token.trim(), getApiJwtSecret());
  return result.ok ? result.claims : null;
}
