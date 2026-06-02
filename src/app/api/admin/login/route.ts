import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  LOCATION_SCOPE_ALL,
  sessionLocationScope,
} from "@/lib/admin-auth";
import { appendAuditLog, getAdminUsers } from "@/lib/store";
import { enforceRateLimit, getClientIp, isAdminIpAllowed } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";
import { verifyPasswordHash, isPasswordHash } from "@/lib/password";
import { landingPathForRole } from "@/lib/staff-roles";
import type { AdminRole } from "@/lib/admin-roles";
import { adminLoginSchema, parseBody } from "@/lib/api-schemas";
import { logger } from "@/lib/logger";

/**
 * Shared-password login extended with an optional `email`.
 *
 * - Without `email`: legacy behaviour — the session token uses the
 *   reserved `"admin"` userId and behaves like the previous shared-owner
 *   session (full access). Existing deployments keep working.
 * - With `email`: the email must match an active row in `admin-users.json`.
 *   On success the token carries that row's id, so `getCurrentRole()`
 *   returns the per-user role and `hasRole()` actually enforces.
 */
export async function POST(req: NextRequest) {
  // Network gate — login bypasses withAdmin, so enforce the admin IP
  // allowlist here too. No-op when ADMIN_IP_ALLOWLIST is unset.
  if (!isAdminIpAllowed(getClientIp(req))) {
    return NextResponse.json(
      { error: "Access from this network is not allowed" },
      { status: 403 },
    );
  }

  // 5/min/IP blocks password-guessing without hurting a real operator who
  // mistypes their password a few times. Failed and successful attempts
  // both count to the limit — keeps the math simple and discourages enumerating
  // valid emails.
  const rl = await enforceRateLimit({
    key: "admin-login",
    id: getClientIp(req),
    limit: 5,
    windowSec: 60,
  });
  if (rl) return rl;

  const parsed = await parseBody(req, adminLoginSchema);
  if ("error" in parsed) return parsed.error;
  const { password, email, totp, portal } = parsed.data;

  try {

    let userId = "admin";
    let auditActor = "admin";
    let resolvedRole: AdminRole | undefined;
    // Owners + shared-password sessions get unrestricted scope; a non-owner
    // bound to one or more locations gets a comma-joined scope (a manager can
    // run several sites). The scope is HMAC-bound into the token and enforced
    // by requireLocationAccess on every admin route.
    let locationScope: string = LOCATION_SCOPE_ALL;

    if (typeof email === "string" && email.trim().length > 0) {
      const normalized = email.trim().toLowerCase();
      const users = await getAdminUsers();
      const hit = users.find((u) => u.email?.toLowerCase() === normalized && u.status === "active");
      if (!hit) {
        return NextResponse.json(
          { error: "Email not found or user is disabled. Leave email blank to use the shared owner session." },
          { status: 401 },
        );
      }
      // Per-user password: when this account carries its own scrypt hash, that
      // is the credential — it no longer rides the shared ADMIN_PASSWORD. Only
      // accounts without a personal password (e.g. the bootstrap owner before
      // they set one) fall back to the shared secret.
      const passwordOk =
        hit.passwordHash && isPasswordHash(hit.passwordHash)
          ? verifyPasswordHash(password, hit.passwordHash)
          : verifyPassword(password);
      if (!passwordOk) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
      }
      // Per-user MFA: when this account has confirmed TOTP, a valid code is
      // mandatory. The password alone is not enough.
      if (hit.totpEnabled && hit.totpSecret) {
        if (!totp) {
          return NextResponse.json({ error: "MFA code required", mfaRequired: true }, { status: 401 });
        }
        if (!verifyTotp(hit.totpSecret, totp)) {
          return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
        }
      }
      userId = hit.id;
      auditActor = hit.email || hit.id;
      resolvedRole = hit.role;
      // A non-owner bound to one or more locations gets a comma-joined scope
      // (a manager can run multiple sites); no binding = unrestricted. The PIN
      // + passkey logins mint scope through the same helper.
      locationScope = sessionLocationScope(hit);
    } else {
      // No email → legacy shared-owner session, gated by the shared password.
      if (!verifyPassword(password)) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
      }
      // Shared-password session MFA: when ADMIN_TOTP_SECRET is set, the
      // no-email owner session also requires a code.
      const sharedSecret = process.env.ADMIN_TOTP_SECRET?.trim();
      if (sharedSecret) {
        if (!totp) {
          return NextResponse.json({ error: "MFA code required", mfaRequired: true }, { status: 401 });
        }
        if (!verifyTotp(sharedSecret, totp)) {
          return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
        }
      }
    }

    // Portal separation: the admin door (/admin/login) is owner-only. Managers,
    // staff and kitchen sign in at the universal /login door. We reject here
    // (before minting the cookie) so a non-owner can't establish a session via
    // the admin portal — they're pointed at /login instead.
    const role: AdminRole = resolvedRole ?? "owner";
    if (portal === "admin" && role !== "owner") {
      return NextResponse.json(
        {
          error: "This is the admin portal. Managers and staff sign in at /login.",
          wrongPortal: true,
        },
        { status: 403 },
      );
    }

    const token = createSession(userId, locationScope);

    await appendAuditLog({
      actor: auditActor,
      action: "auth.login",
      entityType: "admin_user",
      entityId: userId,
      after: {
        boundUser: userId !== "admin",
        role: resolvedRole ?? "owner_shim",
        locationScope,
      },
    });

    const response = NextResponse.json({
      success: true,
      userId,
      role,
      locationScope,
      // Where the client should land: kitchen → KDS, floor → POS, otherwise the
      // dashboard. Keeps routing in one place (staff-roles.ts).
      landing: landingPathForRole(role),
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (err) {
    // Without this binding the catch silently swallows the error and the
    // operator just sees "Internal server error" with nothing to grep for.
    // Log structurally so Sentry + the Vercel function log both pick it up.
    logger.error(
      "admin.login.failed",
      {
        layer: "api.admin.login",
        hasEmail: typeof email === "string" && email.trim().length > 0,
      },
      err,
    );
    return NextResponse.json(
      {
        error: "Internal server error",
        // Surfaced only in non-production to speed up debugging on PR
        // preview deploys. Stripped on production.
        detail:
          process.env.VERCEL_ENV !== "production"
            ? err instanceof Error
              ? err.message
              : String(err)
            : undefined,
      },
      { status: 500 },
    );
  }
}
