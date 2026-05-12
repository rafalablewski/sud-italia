import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  LOCATION_SCOPE_ALL,
} from "@/lib/admin-auth";
import { appendAuditLog, getAdminUsers } from "@/lib/store";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { adminLoginSchema, parseBody } from "@/lib/api-schemas";

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
  const { password, email } = parsed.data;

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  try {

    let userId = "admin";
    let auditActor = "admin";
    let resolvedRole: string | undefined;
    // Owners + shared-password sessions get unrestricted scope; non-owners
    // with a locationSlug get scoped to that one slug. AdminUser only models
    // one slug per user today — Phase 3 will widen this to comma-joined
    // multi-location membership when the franchisee model lands.
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
      userId = hit.id;
      auditActor = hit.email || hit.id;
      resolvedRole = hit.role;
      if (hit.role !== "owner" && hit.locationSlug) {
        locationScope = hit.locationSlug;
      }
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
      role: resolvedRole ?? "owner",
      locationScope,
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
