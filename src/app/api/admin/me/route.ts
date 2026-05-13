import { NextResponse } from "next/server";
import { getCurrentAdminUser, getCurrentLocationScope } from "@/lib/admin-auth";

/**
 * Returns the current admin user's identity for client-side gating (m2_31).
 * The nav sidebar fetches this once on mount to filter items by role.
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
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    locationScope: scope,
  });
}
