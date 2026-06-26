import { getAdminUsers } from "@/lib/store";
import { sessionLocationScope } from "@/lib/user-locations";
import type { IdentityForToken } from "./auth";

/**
 * Resolve an operator identity for token issue/refresh, from the live user
 * model. Recomputing scope/role here (rather than trusting the old token) means
 * an admin re-scoping or disabling a user takes effect on their next refresh —
 * tokens can't outlive a permission change by more than the 15-min access TTL.
 *
 * `"admin"` is the legacy shared-owner session (no per-user row), mirrored from
 * admin-auth.getCurrentAdminUser().
 */
export async function resolveOperatorIdentity(userId: string): Promise<IdentityForToken | null> {
  if (userId === "admin") {
    return { userId: "admin", scope: "*", role: "owner", name: "Rafał Ablewski" };
  }
  const users = await getAdminUsers();
  const hit = users.find((u) => u.id === userId);
  if (!hit || hit.status !== "active") return null;
  return {
    userId: hit.id,
    scope: sessionLocationScope(hit),
    role: hit.role,
    name: hit.name,
    email: hit.email,
  };
}
