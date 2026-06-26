import { getAdminUsers, getCustomer } from "@/lib/store";
import { sessionLocationScope } from "@/lib/user-locations";
import { normalizePlPhoneE164 } from "@/lib/phone";
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

/**
 * Resolve a customer identity (Ottaviano app) for token issue/refresh. The
 * subject IS the E.164 phone — customer identity is phone-based and zero-
 * friction (Rule #6), there's no account to disable, so this always resolves.
 * Name/email are hydrated from the rollup when the customer has ordered before.
 */
export async function resolveCustomerIdentity(rawPhone: string): Promise<IdentityForToken | null> {
  const phone = normalizePlPhoneE164(rawPhone) ?? rawPhone;
  const c = await getCustomer(phone);
  return {
    userId: phone,
    scope: "customer",
    role: "customer",
    name: c?.name ?? undefined,
    email: c?.email ?? undefined,
  };
}
