import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { authenticateBearer } from "@/lib/api/v1/auth";
import { resolveOperatorIdentity } from "@/lib/api/v1/identity";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/auth/me` — the current operator, from the Bearer access token.
 *
 * Re-resolves against the live user model (not just the token claims) so a
 * disabled account is reflected immediately, and returns the current role +
 * location scope the app uses to shape its UI. The server still enforces the
 * real boundary on every data call — this is for presentation only.
 */
export async function GET(req: NextRequest) {
  const claims = authenticateBearer(req);
  if (!claims) return apiError("unauthorized", "Missing or invalid access token");

  const identity = await resolveOperatorIdentity(claims.sub);
  if (!identity) return apiError("unauthorized", "Account is no longer active");

  return apiOk({
    id: identity.userId,
    name: identity.name ?? null,
    email: identity.email ?? null,
    role: identity.role,
    scope: identity.scope,
    app: claims.aud,
  });
}
