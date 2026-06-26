import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { CustomerAuthVerifySchema } from "@/lib/api/v1/schemas";
import { verifyOtpCode, OTP_MAX_ATTEMPTS } from "@/lib/api/v1/otp";
import { getOtpChallenge, bumpOtpAttempt, clearOtpChallenge } from "@/lib/store";
import { issueTokenPair } from "@/lib/api/v1/auth";
import { resolveCustomerIdentity } from "@/lib/api/v1/identity";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/customer/auth/verify` — exchange a phone + code for a customer
 * token pair (aud "ottaviano"). The code is single-use (cleared on success) and
 * attempt-capped (the whole challenge is burned after OTP_MAX_ATTEMPTS wrong
 * tries, so a code can't be brute-forced inside its TTL).
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit({ key: "v1-otp-verify", id: getClientIp(req), limit: 15, windowSec: 60 });
  if (!rl.allowed) return apiError("rate_limited", "Too many attempts");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = CustomerAuthVerifySchema.safeParse(raw);
  if (!parsed.success) return apiError("validation_failed", "Phone and a 6-digit code are required");

  const phone = normalizePlPhoneE164(parsed.data.phone);
  if (!phone) return apiError("validation_failed", "Invalid Polish phone number");

  const challenge = await getOtpChallenge(phone);
  if (!challenge) {
    return apiError("unauthorized", "No active code — request a new one", { reason: "expired" });
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await clearOtpChallenge(phone);
    return apiError("unauthorized", "Too many wrong attempts — request a new code", { reason: "locked" });
  }

  if (!verifyOtpCode(parsed.data.code, challenge.codeHash)) {
    const attempts = await bumpOtpAttempt(phone);
    if (attempts >= OTP_MAX_ATTEMPTS) await clearOtpChallenge(phone);
    return apiError("unauthorized", "Incorrect code", { reason: "incorrect" });
  }

  // Success — single-use code, mint the customer session.
  await clearOtpChallenge(phone);
  try {
    const identity = await resolveCustomerIdentity(phone);
    if (!identity) return apiError("internal", "Could not resolve customer");
    const pair = await issueTokenPair(identity, "ottaviano");
    return apiOk({
      ...pair,
      customer: { phone: identity.userId, name: identity.name ?? null },
    });
  } catch (err) {
    logger.error("v1 otp verify failed", { layer: "api.v1.customer.auth", phone }, err as Error);
    return apiError("internal", "Sign-in failed");
  }
}
