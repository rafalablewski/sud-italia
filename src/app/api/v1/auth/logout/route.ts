import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { revokePresentedRefresh } from "@/lib/api/v1/auth";
import { LogoutBodySchema } from "@/lib/api/v1/schemas";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/auth/logout` — revoke the presented refresh token.
 *
 * Idempotent and best-effort: an unknown/already-revoked token still returns
 * success so the app can clear local state unconditionally. The short-lived
 * access token is left to expire on its own (stateless by design).
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = LogoutBodySchema.safeParse(raw);
  if (!parsed.success) return apiError("validation_failed", "Missing refreshToken");

  await revokePresentedRefresh(parsed.data.refreshToken);
  return apiOk({ revoked: true });
}
