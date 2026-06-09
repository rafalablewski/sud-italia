import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totp,
  verifyTotp,
  hotp,
  totpUri,
} from "./totp";

// Run with:  npx tsx --test src/lib/totp.test.ts

// RFC 6238 test secret: ASCII "12345678901234567890" → base32.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

test("base32 round-trips", () => {
  const buf = Buffer.from("hello totp world", "utf8");
  assert.equal(base32Decode(base32Encode(buf)).toString("utf8"), "hello totp world");
});

test("RFC 6238 vector — SHA1, 6 digits at T=59 is 287082", () => {
  // T0=0, step=30 → counter=1 at t=59s.
  assert.equal(totp(RFC_SECRET, 59 * 1000), "287082");
});

test("RFC 6238 vector — at T=1111111109 is 081804", () => {
  assert.equal(totp(RFC_SECRET, 1111111109 * 1000), "081804");
});

test("hotp matches RFC 4226 vectors (counter 0 and 1)", () => {
  assert.equal(hotp(RFC_SECRET, 0), "755224");
  assert.equal(hotp(RFC_SECRET, 1), "287082");
});

test("verifyTotp accepts the current code and tolerates ±1 step drift", () => {
  const now = 1111111109 * 1000;
  assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now), { forTime: now }), true);
  // Previous and next window codes.
  assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 30000), { forTime: now }), true);
  assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now + 30000), { forTime: now }), true);
});

test("verifyTotp rejects malformed codes without throwing", () => {
  const now = Date.now();
  // Use a fixed time where the real code is known not to be "000000".
  const t = 1111111109 * 1000; // real code 081804
  assert.equal(verifyTotp(RFC_SECRET, "000000", { forTime: t, window: 0 }), false);
  assert.equal(verifyTotp(RFC_SECRET, "12345", { forTime: now }), false); // too short
  assert.equal(verifyTotp(RFC_SECRET, "abcdef", { forTime: now }), false); // non-numeric
  assert.equal(verifyTotp(RFC_SECRET, "", { forTime: now }), false);
});

test("a code from a different secret does not verify", () => {
  const t = 1111111109 * 1000;
  // A secret whose code at t differs from RFC_SECRET's 081804.
  const other = base32Encode(Buffer.from("09876543210987654321", "ascii"));
  const code = totp(other, t);
  assert.notEqual(code, totp(RFC_SECRET, t));
  assert.equal(verifyTotp(RFC_SECRET, code, { forTime: t, window: 0 }), false);
});

test("generateTotpSecret produces a decodable 160-bit secret", () => {
  const s = generateTotpSecret();
  assert.equal(base32Decode(s).length, 20);
});

test("totpUri is a scannable otpauth URI", () => {
  const uri = totpUri(RFC_SECRET, "owner@sud-italia.pl");
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=/);
  assert.match(uri, /issuer=Ottaviano/);
});
