import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPasswordHash, isPasswordHash } from "./password";

// Run with:  npx tsx --test src/lib/password.test.ts

test("hashPassword produces a self-describing scrypt string", () => {
  const h = hashPassword("correct horse battery staple");
  assert.ok(isPasswordHash(h));
  const parts = h.split("$");
  assert.equal(parts.length, 6);
  assert.equal(parts[0], "scrypt");
});

test("each hash uses a fresh salt", () => {
  const a = hashPassword("same-password");
  const b = hashPassword("same-password");
  assert.notEqual(a, b);
});

test("verifyPasswordHash accepts the right password", () => {
  const h = hashPassword("s3cret-pa$$word");
  assert.equal(verifyPasswordHash("s3cret-pa$$word", h), true);
});

test("verifyPasswordHash rejects the wrong password", () => {
  const h = hashPassword("s3cret-pa$$word");
  assert.equal(verifyPasswordHash("wrong", h), false);
  assert.equal(verifyPasswordHash("s3cret-pa$$wor", h), false);
});

test("verifyPasswordHash never throws on malformed input", () => {
  assert.equal(verifyPasswordHash("x", ""), false);
  assert.equal(verifyPasswordHash("x", "notahash"), false);
  assert.equal(verifyPasswordHash("x", "scrypt$bad"), false);
  assert.equal(verifyPasswordHash("x", "scrypt$16384$8$1$$"), false);
  assert.equal(verifyPasswordHash("x", "bcrypt$16384$8$1$aa$bb"), false);
});

test("hashPassword rejects empty passwords", () => {
  assert.throws(() => hashPassword(""));
});
