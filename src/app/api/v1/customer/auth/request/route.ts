import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { CustomerAuthRequestSchema } from "@/lib/api/v1/schemas";
import { generateOtpCode, hashOtpCode, OTP_TTL_SEC } from "@/lib/api/v1/otp";
import { setOtpChallenge } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSmsProvider } from "@/lib/providers/sms";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/customer/auth/request` — send a login code to a phone.
 *
 * Zero-friction, no passwords (Rule #6): the customer proves the phone with a
 * 6-digit SMS code, then `/verify` mints a token. Double rate-limited (per phone
 * + per IP) against SMS-pumping. When no SMS provider is configured (the Noop
 * provider) AND not in production, the code is returned as `devCode` so the flow
 * is testable locally — never leaked once Twilio is set or in prod.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = CustomerAuthRequestSchema.safeParse(raw);
  if (!parsed.success) return apiError("validation_failed", "A valid phone is required");

  const phone = normalizePlPhoneE164(parsed.data.phone);
  if (!phone) return apiError("validation_failed", "Invalid Polish phone number");

  // 3/min/phone + 10/min/IP — stop SMS-pumping without hurting a real retry.
  const perPhone = await rateLimit({ key: "v1-otp-phone", id: phone, limit: 3, windowSec: 60 });
  const perIp = await rateLimit({ key: "v1-otp-ip", id: getClientIp(req), limit: 10, windowSec: 60 });
  if (!perPhone.allowed || !perIp.allowed) {
    return apiError("rate_limited", "Too many code requests. Try again shortly.");
  }

  const code = generateOtpCode();
  const now = Math.floor(Date.now() / 1000);
  await setOtpChallenge({
    phone,
    codeHash: hashOtpCode(code),
    expiresAt: now + OTP_TTL_SEC,
    attempts: 0,
    createdAt: now,
  });

  const provider = getSmsProvider();
  try {
    await provider.send(phone, `Your Ottaviano code is ${code}. It expires in 5 minutes.`);
  } catch (err) {
    logger.error("v1 otp sms send failed", { layer: "api.v1.customer.auth", phone }, err as Error);
    return apiError("internal", "Could not send the code. Try again.");
  }

  const devFallback = provider.name === "noop" && process.env.NODE_ENV !== "production";
  return apiOk({
    sent: true,
    channel: "sms",
    expiresInSec: OTP_TTL_SEC,
    ...(devFallback ? { devCode: code } : {}),
  });
}
