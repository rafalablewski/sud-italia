import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * RFC 6238 TOTP (and the RFC 4226 HOTP it builds on) using only node:crypto.
 * Powers optional two-factor auth on admin login. Secrets are base32 (RFC
 * 4648) so they paste straight into Google Authenticator / 1Password / Authy
 * via the `otpauth://` URI.
 *
 * Defaults match every mainstream authenticator app: SHA-1, 6 digits, 30s
 * step. Verification accepts a ±1 step window to tolerate clock skew.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a new base32 TOTP secret (160 bits, the RFC-recommended size). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4226 HOTP for a specific counter. */
export function hotp(secretBase32: string, counter: number, digits = TOTP_DIGITS): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter. Bitwise ops are 32-bit in JS, so split.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/** Current TOTP code for a secret. */
export function totp(
  secretBase32: string,
  forTime: number = Date.now(),
  step = TOTP_STEP_SECONDS,
  digits = TOTP_DIGITS,
): string {
  const counter = Math.floor(forTime / 1000 / step);
  return hotp(secretBase32, counter, digits);
}

/**
 * Constant-time verification of a submitted code against a secret, accepting a
 * ±`window`-step drift. Returns false (never throws) on malformed input.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  opts: { window?: number; forTime?: number; step?: number; digits?: number } = {},
): boolean {
  const window = opts.window ?? 1;
  const step = opts.step ?? TOTP_STEP_SECONDS;
  const digits = opts.digits ?? TOTP_DIGITS;
  const forTime = opts.forTime ?? Date.now();
  const cleaned = (token || "").replace(/\s/g, "");
  if (!/^\d+$/.test(cleaned) || cleaned.length !== digits) return false;

  const counter = Math.floor(forTime / 1000 / step);
  for (let w = -window; w <= window; w++) {
    let candidate: string;
    try {
      candidate = hotp(secretBase32, counter + w, digits);
    } catch {
      return false;
    }
    const a = Buffer.from(candidate);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Builds the otpauth:// URI an authenticator app scans / imports. */
export function totpUri(
  secretBase32: string,
  accountName: string,
  issuer = "Ottaviano",
): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
