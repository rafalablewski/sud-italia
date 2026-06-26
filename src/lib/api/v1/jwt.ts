import { createHmac, timingSafeEqual } from "crypto";

/**
 * Minimal RFC 7519 HS256 JWT for the native `/api/v1` facade.
 *
 * Why hand-rolled (no `jsonwebtoken`/`jose`):
 *   - zero new dependencies — the codebase already signs cookies with Node
 *     `crypto` HMAC (see admin-auth.ts); this is the same primitive, RFC-shaped;
 *   - runs on the default Node route runtime; no edge/WebCrypto constraints;
 *   - small + fully unit-testable in this repo (jwt.test.ts), which matters
 *     because the native apps depend on these tokens being correct.
 *
 * Access tokens are the ONLY JWTs we mint — short-lived (minutes), stateless,
 * verified on every `/api/v1` call. Refresh tokens are opaque + server-stored
 * (see auth.ts) so they can be revoked; they are deliberately NOT JWTs.
 */

export interface JwtClaims {
  /** Subject — the admin user id (or "admin" for the shared-owner session). */
  sub: string;
  /** Issuer. */
  iss: string;
  /** Audience — which app the token is for. */
  aud: "ottaviano" | "ottaviano-kds";
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
  /** Token type discriminator — always "access" here. */
  typ: "access";
  /** Location scope: "*" or a comma-separated slug list (mirrors cookie auth). */
  scope: string;
  /** Resolved role, for cheap client-side gating (server re-checks regardless). */
  role: string;
  /** Display name, convenience for the app UI. */
  name?: string;
  /** Email when the account is email-bound. */
  email?: string;
}

type SignableClaims = Omit<JwtClaims, "iat" | "exp" | "typ" | "iss">;

const HEADER_B64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const DEFAULT_ISS = "ottaviano-api";

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Mint an access token. `ttlSeconds` defaults to 15 minutes. */
export function signAccessToken(
  claims: SignableClaims,
  secret: string,
  ttlSeconds = 15 * 60,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const full: JwtClaims = {
    ...claims,
    typ: "access",
    iss: DEFAULT_ISS,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
  const payloadB64 = b64url(JSON.stringify(full));
  const signingInput = `${HEADER_B64}.${payloadB64}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

export type JwtVerifyError =
  | "malformed"
  | "bad-signature"
  | "expired"
  | "wrong-type"
  | "bad-claims";

export type JwtVerifyResult =
  | { ok: true; claims: JwtClaims }
  | { ok: false; reason: JwtVerifyError };

/** Verify signature + expiry and return typed claims. Constant-time on the sig. */
export function verifyAccessToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): JwtVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, payloadB64, sig] = parts;

  const expectedSig = sign(`${headerB64}.${payloadB64}`, secret);
  // Length check first so timingSafeEqual doesn't throw on mismatched buffers.
  if (sig.length !== expectedSig.length) return { ok: false, reason: "bad-signature" };
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { ok: false, reason: "bad-signature" };
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (claims.typ !== "access") return { ok: false, reason: "wrong-type" };
  if (
    typeof claims.sub !== "string" ||
    typeof claims.scope !== "string" ||
    typeof claims.exp !== "number" ||
    typeof claims.role !== "string"
  ) {
    return { ok: false, reason: "bad-claims" };
  }
  if (nowSeconds >= claims.exp) return { ok: false, reason: "expired" };

  return { ok: true, claims };
}
