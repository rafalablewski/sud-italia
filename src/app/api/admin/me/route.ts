import { NextResponse } from "next/server";
import { getCurrentAdminUser, getCurrentLocationScope } from "@/lib/admin-auth";
import { getAdminUserById } from "@/lib/store";
import { resolveEffectivePermissions } from "@/lib/permissions";
import { landingPathForRole } from "@/lib/staff-roles";

/**
 * Returns the current admin user's identity for client-side gating (m2_31).
 * The nav sidebar fetches this once on mount to filter items by role; the
 * Settings "How you sign in" panel reads the credential facts below.
 *
 * Auth route, but intentionally not wrapped in withAdmin — the response
 * shape itself signals "not logged in" via 401, and we want this callable
 * even from the login page if a route ever needs to react to the
 * already-logged-in case.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const scope = await getCurrentLocationScope();
  // Effective granular permissions, so the client nav + page guard gate on the
  // exact same set the server enforces. `allAccess` lets the client skip
  // per-item checks for owners.
  const eff = resolveEffectivePermissions(user);

  // Credential facts for the self "How you sign in" panel. The legacy shared
  // "admin" session has no row → it rides the shared password, no per-user
  // credentials. Never ship the secrets themselves, only "is set" booleans.
  const row = user.id === "admin" ? undefined : await getAdminUserById(user.id);
  const signIn = {
    // Owners use the admin door; everyone else the universal /login.
    door: user.role === "owner" ? "/admin/login" : "/login",
    landing: landingPathForRole(user.role),
    hasPassword: !!row?.passwordHash,
    hasPin: !!row?.pinHash,
    passkeys: row?.webauthnCredentials?.length ?? 0,
    mfa: !!row?.totpEnabled,
    shared: user.id === "admin" || !row?.passwordHash,
  };

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    locationScope: scope,
    allAccess: eff.all,
    // `custom` distinguishes a user carrying an explicit grant (permissions are
    // authoritative — client gates on `permissions`) from a role-default user
    // (client keeps the legacy role-rank nav/guard, exactly as before).
    custom: eff.custom,
    permissions: eff.all ? [] : Array.from(eff.keys),
    signIn,
  });
}
