#!/usr/bin/env tsx
/**
 * Generates a TOTP secret for the SHARED admin session (the no-email owner
 * login). Set the printed secret as ADMIN_TOTP_SECRET and the shared login
 * will require a 6-digit code in addition to the password.
 *
 * Per-user MFA (for email logins) is enrolled in the UI at /admin/users — this
 * script is only for the shared session.
 *
 * Usage:
 *   tsx scripts/generate-totp-secret.ts [account-label]
 *
 * Scan the printed otpauth:// URI (or enter the secret manually) into an
 * authenticator app, then put the secret in ADMIN_TOTP_SECRET.
 */
import { generateTotpSecret, totpUri } from "../src/lib/totp";

const label = process.argv[2] || "shared-owner";
const secret = generateTotpSecret();

console.log("ADMIN_TOTP_SECRET=" + secret);
console.log("");
console.log("otpauth URI (scan or paste into your authenticator app):");
console.log(totpUri(secret, label));
