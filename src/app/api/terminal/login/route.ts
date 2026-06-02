import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionLocationScope,
} from "@/lib/admin-auth";
import { appendAuditLog, findAdminUserByPin } from "@/lib/store";
import { getLocationAsync } from "@/lib/locations-store";
import { landingPathForRole } from "@/lib/staff-roles";
import { isValidPin } from "@/lib/password";
import { enforceRateLimit, getClientIp, isAdminIpAllowed } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Fast per-person login for a shared kitchen/POS terminal.
 *
 * A pizzaiolo or waiter taps their location + PIN and is dropped onto the right
 * surface (KDS / POS). It mints the SAME signed admin session as the password
 * login — so all the downstream RBAC + tenant scoping apply unchanged — but the
 * credential is a short, location-scoped PIN instead of email + password.
 *
 * Security posture: the PIN search space is shrunk by scoping to one location
 * and guarded by the same 5/min/IP limiter as the password login, and the
 * stored PIN is a salted scrypt hash. It is a deliberate convenience path for
 * shared hardware — accounts that need MFA-grade assurance use the password
 * login (and can simply not set a PIN).
 */
export async function POST(req: NextRequest) {
  if (!isAdminIpAllowed(getClientIp(req))) {
    return NextResponse.json(
      { error: "Access from this network is not allowed" },
      { status: 403 },
    );
  }

  const rl = await enforceRateLimit({
    key: "terminal-login",
    id: getClientIp(req),
    limit: 5,
    windowSec: 60,
  });
  if (rl) return rl;

  let body: { slug?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!slug || !/^[a-z0-9-]+$/.test(slug) || !isValidPin(pin)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const location = await getLocationAsync(slug);
    if (!location?.isActive) {
      return NextResponse.json(
        { error: "Unknown or inactive location" },
        { status: 404 },
      );
    }

    const user = await findAdminUserByPin(slug, pin);
    if (!user) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // One resolver for every login path so a PIN session is scoped exactly like
    // the password login (and never over-grants every site).
    const locationScope = sessionLocationScope(user);
    const token = createSession(user.id, locationScope);

    await appendAuditLog({
      actor: user.email || user.id,
      action: "auth.login.pin",
      entityType: "admin_user",
      entityId: user.id,
      after: { via: "terminal", role: user.role, location: slug, locationScope },
    });

    const response = NextResponse.json({
      success: true,
      role: user.role,
      name: user.name,
      landing: landingPathForRole(user.role),
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
    logger.error("terminal.login.failed", { layer: "api.terminal.login" }, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
