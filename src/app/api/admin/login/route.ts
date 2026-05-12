import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/admin-auth";
import { appendAuditLog, getAdminUsers } from "@/lib/store";

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
  try {
    const body = await req.json().catch(() => ({}));
    const { password, email } = body as { password?: string; email?: string };

    if (!password || !verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    let userId = "admin";
    let auditActor = "admin";
    let resolvedRole: string | undefined;

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
    }

    const token = createSession(userId);

    await appendAuditLog({
      actor: auditActor,
      action: "auth.login",
      entityType: "admin_user",
      entityId: userId,
      after: { boundUser: userId !== "admin", role: resolvedRole ?? "owner_shim" },
    });

    const response = NextResponse.json({ success: true, userId, role: resolvedRole ?? "owner" });
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
