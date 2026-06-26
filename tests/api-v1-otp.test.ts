import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from "@/lib/api/v1/otp";

// Run with:  npx tsx --test tests/api-v1-otp.test.ts
//
// The customer login code path — codes must be 6 digits, hashed (never stored
// raw), and verified in constant time. Pure crypto.

test("generates 6-digit numeric codes", () => {
  for (let i = 0; i < 200; i++) {
    const c = generateOtpCode();
    assert.match(c, /^\d{6}$/, `bad code ${c}`);
  }
});

test("hash is stable + not the raw code", () => {
  const code = "123456";
  const h = hashOtpCode(code);
  assert.equal(h, hashOtpCode(code)); // deterministic
  assert.notEqual(h, code);
  assert.equal(h.length, 64); // sha256 hex
});

test("verifies the right code and rejects wrong ones", () => {
  const code = generateOtpCode();
  const stored = hashOtpCode(code);
  assert.equal(verifyOtpCode(code, stored), true);
  assert.equal(verifyOtpCode(" " + code + " ", stored), true); // trims
  const wrong = code === "000000" ? "111111" : "000000";
  assert.equal(verifyOtpCode(wrong, stored), false);
  assert.equal(verifyOtpCode("", stored), false);
});
