import { NextRequest } from "next/server";
import { verifyPassword } from "@/lib/admin-auth";
import { sessionLocationScope } from "@/lib/user-locations";
import { getAdminUsers } from "@/lib/store";
import { verifyPasswordHash, isPasswordHash } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { rateLimit, getClientIp, isAdminIpAllowed } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { issueTokenPair, type AppAudience, type IdentityForToken } from "@/lib/api/v1/auth";
import { LoginBodySchema } from "@/lib/api/v1/schemas";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/auth/login` — native operator sign-in.
 *
 * Mirrors the credential resolution of the web /api/admin/login exactly (shared
 * password owner, or email-bound user with per-user password + optional TOTP)
 * but returns a JWT access token + a rotating refresh token instead of setting a
 * cookie. The native app stores the refresh token in the Keychain.
 *
 * 200 → { data: { ...tokens, user } }
 */
export async function POST(req: NextRequest) {
  // Same network gate as the web login (no-op unless ADMIN_IP_ALLOWLIST is set).
  if (!isAdminIpAllowed(getClientIp(req))) {
    return apiError("forbidden", "Access from this network is not allowed");
  }

  // 5/min/IP — same budget as the web login door.
  const rl = await rateLimit({ key: "v1-login", id: getClientIp(req), limit: 5, windowSec: 60 });
  if (!rl.allowed) {
    return apiError("rate_limited", "Too many attempts. Try again shortly.", {
      retryAfterSec: rl.retryAfterSec ?? rl.resetInSec,
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = LoginBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("validation_failed", "Invalid login payload", parsed.error.flatten());
  }
  const { email, password, totp, app } = parsed.data;
  const aud: AppAudience = app ?? "ottaviano-kds";

  try {
    let identity: IdentityForToken;

    if (email && email.trim().length > 0) {
      const normalized = email.trim().toLowerCase();
      const users = await getAdminUsers();
      const hit = users.find((u) => u.email?.toLowerCase() === normalized && u.status === "active");
      if (!hit) {
        return apiError(
          "unauthorized",
          "Email not found or user is disabled. Omit email to use the shared owner session.",
        );
      }
      const passwordOk =
        hit.passwordHash && isPasswordHash(hit.passwordHash)
          ? verifyPasswordHash(password, hit.passwordHash)
          : verifyPassword(password);
      if (!passwordOk) return apiError("unauthorized", "Invalid password");

      if (hit.totpEnabled && hit.totpSecret) {
        if (!totp) return apiError("unauthorized", "MFA code required", { mfaRequired: true });
        if (!verifyTotp(hit.totpSecret, totp)) return apiError("unauthorized", "Invalid MFA code");
      }
      identity = {
        userId: hit.id,
        scope: sessionLocationScope(hit),
        role: hit.role,
        name: hit.name,
        email: hit.email,
      };
    } else {
      // Shared-owner session (legacy parity): shared password, optional shared TOTP.
      if (!verifyPassword(password)) return apiError("unauthorized", "Invalid password");
      const sharedSecret = process.env.ADMIN_TOTP_SECRET?.trim();
      if (sharedSecret) {
        if (!totp) return apiError("unauthorized", "MFA code required", { mfaRequired: true });
        if (!verifyTotp(sharedSecret, totp)) return apiError("unauthorized", "Invalid MFA code");
      }
      identity = { userId: "admin", scope: "*", role: "owner", name: "Rafał Ablewski" };
    }

    const pair = await issueTokenPair(identity, aud);
    return apiOk({
      ...pair,
      user: {
        id: identity.userId,
        name: identity.name ?? null,
        email: identity.email ?? null,
        role: identity.role,
        scope: identity.scope,
      },
    });
  } catch (err) {
    logger.error("v1 login failed", { layer: "api.v1.auth.login" }, err as Error);
    return apiError("internal", "Login failed");
  }
}
