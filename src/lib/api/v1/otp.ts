import { randomInt, createHash, timingSafeEqual } from "crypto";

/**
 * Phone OTP for the customer app login (zero-friction, no passwords — Rule #6).
 *
 * A 6-digit numeric code, hashed (SHA-256) before storage, short TTL, capped
 * attempts. Pure helpers here; the store accessors (setOtpChallenge &c.) persist
 * the hash and the routes wire in SMS + rate limiting.
 */

export const OTP_TTL_SEC = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtpCode(): string {
  // 6 digits, zero-padded, from a CSPRNG (randomInt is uniform + unbiased).
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Constant-time compare of a submitted code against the stored hash. */
export function verifyOtpCode(submitted: string, storedHash: string): boolean {
  const submittedHash = hashOtpCode(submitted.trim());
  if (submittedHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(submittedHash), Buffer.from(storedHash));
}
