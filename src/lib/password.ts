import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Salted password hashing for the shared admin secret.
 *
 * We use scrypt from node:crypto (no external dependency, works in the
 * serverless runtime) with per-hash random salts. The stored format is
 * self-describing so the cost parameters can be raised later without
 * invalidating existing hashes:
 *
 *   scrypt$<N>$<r>$<p>$<saltHex>$<keyHex>
 *
 * Generate a hash with `scripts/hash-admin-password.ts` and store it in the
 * `ADMIN_PASSWORD_HASH` env var. `verifyPassword` in admin-auth.ts prefers
 * the hash and only falls back to the deprecated plaintext `ADMIN_PASSWORD`
 * when no hash is configured.
 */

// Cost parameters. memory ≈ 128 * N * r bytes ≈ 16 MB at N=16384, r=8 —
// comfortably under Node's 32 MB scrypt maxmem default, and slow enough to
// make offline guessing expensive while keeping interactive login snappy.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

export function hashPassword(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("hashPassword: password must be a non-empty string");
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(plain, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/** True when `value` looks like a hash produced by `hashPassword`. */
export function isPasswordHash(value: string | undefined | null): boolean {
  return typeof value === "string" && value.startsWith("scrypt$");
}

/**
 * Constant-time verification of a plaintext password against a stored
 * scrypt hash. Returns false (never throws) on any malformed input so a
 * corrupt env var degrades to "wrong password" rather than a 500.
 */
export function verifyPasswordHash(plain: string, stored: string): boolean {
  if (typeof plain !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "hex");
    expected = Buffer.from(parts[5], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(plain, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
