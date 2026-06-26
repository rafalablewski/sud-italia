import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  signAccessToken,
  verifyAccessToken,
} from "@/lib/api/v1/jwt";

// Run with:  npx tsx --test tests/api-v1-jwt.test.ts
//
// The native apps authenticate every /api/v1 call with these tokens, so the
// sign/verify round-trip, tamper rejection, and expiry are load-bearing. Pure
// crypto (no store/network) → fast, deterministic unit test.

const SECRET = "test-secret-do-not-use-in-prod";

const baseClaims = {
  sub: "u_123",
  aud: "ottaviano-kds" as const,
  scope: "krakow,warszawa",
  role: "manager",
  name: "Ada",
  email: "ada@example.com",
};

test("round-trips valid claims", () => {
  const now = 1_700_000_000;
  const token = signAccessToken(baseClaims, SECRET, 900, now);
  const res = verifyAccessToken(token, SECRET, now + 10);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.claims.sub, "u_123");
    assert.equal(res.claims.scope, "krakow,warszawa");
    assert.equal(res.claims.role, "manager");
    assert.equal(res.claims.typ, "access");
    assert.equal(res.claims.exp, now + 900);
  }
});

test("rejects a wrong secret", () => {
  const token = signAccessToken(baseClaims, SECRET);
  const res = verifyAccessToken(token, "different-secret");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "bad-signature");
});

test("rejects a tampered payload", () => {
  const now = 1_700_000_000;
  const token = signAccessToken(baseClaims, SECRET, 900, now);
  const [h, , s] = token.split(".");
  // Flip a payload byte while keeping the original signature.
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...baseClaims, role: "owner", typ: "access", iss: "x", iat: now, exp: now + 900 }),
  ).toString("base64url");
  const forged = `${h}.${forgedPayload}.${s}`;
  const res = verifyAccessToken(forged, SECRET, now + 10);
  assert.equal(res.ok, false);
});

test("rejects an expired token", () => {
  const now = 1_700_000_000;
  const token = signAccessToken(baseClaims, SECRET, 900, now);
  const res = verifyAccessToken(token, SECRET, now + 901);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "expired");
});

test("rejects a malformed token", () => {
  assert.equal(verifyAccessToken("not-a-jwt", SECRET).ok, false);
  assert.equal(verifyAccessToken("a.b", SECRET).ok, false);
  assert.equal(verifyAccessToken("", SECRET).ok, false);
});

test("rejects a non-access token type", () => {
  const now = 1_700_000_000;
  // Hand-build a token whose typ is not "access" but signature is valid.
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ ...baseClaims, typ: "refresh", iss: "x", iat: now, exp: now + 900 }),
  ).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  const res = verifyAccessToken(`${header}.${payload}.${sig}`, SECRET, now + 10);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "wrong-type");
});
