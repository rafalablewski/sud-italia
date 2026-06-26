import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { rotateTokens, type RefreshError } from "@/lib/api/v1/auth";
import { resolveOperatorIdentity } from "@/lib/api/v1/identity";
import { RefreshBodySchema } from "@/lib/api/v1/schemas";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MESSAGE_FOR: Record<RefreshError, string> = {
  malformed: "Malformed refresh token",
  unknown: "Refresh token not recognized",
  expired: "Refresh token expired — sign in again",
  reuse: "Refresh token already used — session revoked for safety, sign in again",
  revoked: "Session no longer valid — sign in again",
};

/**
 * `POST /api/v1/auth/refresh` — rotate a refresh token into a fresh pair.
 *
 * Every refresh ROTATES the token (the old one is single-use). Replaying a spent
 * token trips reuse detection and burns the whole family (theft containment).
 * The new access token reflects the user's CURRENT role/scope, so a permission
 * change propagates within one access-token lifetime.
 */
export async function POST(req: NextRequest) {
  // Generous limit — a refresh per 15 min/device is normal; this just caps abuse.
  const rl = await rateLimit({ key: "v1-refresh", id: getClientIp(req), limit: 60, windowSec: 60 });
  if (!rl.allowed) return apiError("rate_limited", "Too many refreshes");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = RefreshBodySchema.safeParse(raw);
  if (!parsed.success) return apiError("validation_failed", "Missing refreshToken");

  try {
    const result = await rotateTokens(parsed.data.refreshToken, (rec) =>
      resolveOperatorIdentity(rec.userId),
    );
    if (!result.ok) {
      return apiError("unauthorized", MESSAGE_FOR[result.reason], { reason: result.reason });
    }
    return apiOk(result.pair);
  } catch (err) {
    logger.error("v1 refresh failed", { layer: "api.v1.auth.refresh" }, err as Error);
    return apiError("internal", "Refresh failed");
  }
}
